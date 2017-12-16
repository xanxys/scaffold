import * as THREE from 'three';
import { ScaffoldModel, S60RailStraight, S60RailHelix, S60RailRotator, ScaffoldThing, S60RailFeederWide, S60TrainBuilder, Port } from './scaffold-model';
import { Action, ActionSeq } from './action';
import { Coordinates } from './geometry';
import { currentId } from 'async_hooks';

/**
 * Planner takes a model (that's in specific state), and provides Timeline that's simulatable and/or executable.
 */
export interface Planner {
    // TODO: Simulation functionality should be moved to ScaffoldModel.
    setTime(tSec: number);

    getPlan(): Plan | string;
}

export class Plan {
    constructor(private actions: Map<number, Array<[number, ActionSeq]>>) {
    }

    /**
     * Guarantee: within worker, actionSeq is non-overlapping and ordered.
     */
    getSeqPerWorker(): Map<number, Array<[number, ActionSeq]>> {
        return this.actions;
    }
}

/**
 * FeederPlanner1D is a very limited Planner for FDW-TB-RS interactions.
 */
export class FeederPlanner1D implements Planner {
    constructor(private srcModel: ScaffoldModel, private dstModel: ScaffoldModel) {
    }

    getPlan(): Plan | string {
        const srcWOrErr = this.interpretWorld(this.srcModel);
        const dstWOrErr = this.interpretWorld(this.dstModel);
        if (typeof (srcWOrErr) === 'string') {
            return `src world too complex: ${srcWOrErr}`;
        }
        if (typeof (dstWOrErr) === 'string') {
            return `dest world too complex: ${dstWOrErr}`;
        }

        if (srcWOrErr.countRs() !== dstWOrErr.countRs()) {
            return `mismatched RS counts ${srcWOrErr.countRs()} → ${dstWOrErr.countRs()}`;
        }

        const delta = dstWOrErr.connectedRs.map((v, ix) => v - srcWOrErr.connectedRs[ix]);

        // TODO: do something about carryRs
        const swaps = this.getSwapSequence(delta);
        let currState = srcWOrErr;
        const actions = [];
        swaps.forEach(swap => {
            let da = moveRs(currState, swap);
            actions.push(da);
            currState = applyAction(currState, da);
        });
        console.log(swaps, actions);

        // TODO: do something about carryRs

        const m = new Map();
        m.set(1, [[0, new ActionSeq([new Action("250b-20")])]]);
        m.set(2, [[0, new ActionSeq([new Action("200a50")])]]);
        return new Plan(m);
    }

    /** @returns (get index, put index) */
    private getSwapSequence(delta: Array<number>): Array<[number, number]> {
        delta = delta.map(v => v);  // copy to avoid mutating original data.
        const seq = [];
        while (!delta.every(d => d === 0)) {
            let minusIndex = delta.findIndex(d => d < 0);
            let plusIndex = delta.findIndex(d => d > 0);
            seq.push([minusIndex, plusIndex]);
            delta[minusIndex] += 1;
            delta[plusIndex] -= 1;
        }
        return seq;
    }

    setTime(tSec: number) {
        let fdw = this.srcModel.findByType(S60RailFeederWide);
        if (fdw) {
            fdw.paramx = Math.cos(tSec * Math.PI / 2) * 0.05;
        }
    }

    private interpretWorld(model: ScaffoldModel): Fp1dWorld | string {
        const w = new Fp1dWorld();

        let fdw = model.findByType(S60RailFeederWide);
        if (!fdw) {
            return "FDW-RS x1 expected but not found";
        }
        w.stagePos = fdw.stagePos;
        w.connectedRs = new Array(S60RailFeederWide.NUM_PORTS);
        let unprocessedRss = model.findAllByType(S60RailStraight);
        w.connectedRs = fdw.ports.map(fixedPort => {
            let rootPortPos = fdw.coord.convertP(fixedPort.pos, model.coord);
            let attachedCount = 0;
            while (true) {
                let foundInThisCycle = undefined;
                unprocessedRss.forEach(rs => {
                    const otherSidePos = FeederPlanner1D.getOtherSide(model.coord, rootPortPos, rs);
                    if (otherSidePos) {
                        rootPortPos = otherSidePos;
                        attachedCount += 1;
                        foundInThisCycle = rs;
                    }
                });
                if (!foundInThisCycle) {
                    break;
                }
                unprocessedRss = unprocessedRss.filter(r => r !== foundInThisCycle);
            }
            return attachedCount;
        });

        let tb = model.findByType(S60TrainBuilder);
        if (!tb) {
            return "TB x1 expected but not found";
        }
        // TODO: Get info from tb.
        w.carryRs = false;
        w.tbLoc = { kind: "onStage", stackIx: 0};  // TODO: Fix
        return w;
    }

    /**
     * Return the other port of RS.
     * If the spcified port is not shared by given rs, return undefined.
     */
    private static getOtherSide(wCoord: Coordinates, pos: THREE.Vector3, rs: S60RailStraight): THREE.Vector3 | null {
        const eps = 1e-3;
        const isShared = rs.ports.some(rsPort => {
            const rsPortPos = rs.coord.convertP(rsPort.pos, wCoord);
            return rsPortPos.distanceTo(pos) < eps;
        });
        return isShared ? rs.coord.convertP(rs.ports.find(rsPort => {
            const rsPortPos = rs.coord.convertP(rsPort.pos, wCoord);
            return !(rsPortPos.distanceTo(pos) < eps);
        }).pos, wCoord) : null;
    }
}


/** Pattern-based action generator. */

// Do move m = [s, d], s -> d.
//
// IN: carrysRs = false, Empty[s], Connected[w, s-1], Connected[w, d-1]
// OUT: carrysRs = false, Remove[s], Add[d]
function moveRs(w: Fp1dWorld, m: [number, number]): HlAction {
    let [getIndex, putIndex] = m;
    let ag = goGetRs(w, { stackIx: getIndex, posInStack: w.connectedRs[getIndex] - 1 });
    let wg = applyAction(w, ag);
    let ap = goPutRs(wg, { stackIx: putIndex, posInStack: w.connectedRs[putIndex] });
    return new Seq(ag, ap);
}

// go fetch targ, and stay there.
//
// IN: carrysRs = false, Exist[arg], Connected[w, targ-1]
// OUT: carrysRs = true, Remove[targ]
function goGetRs(w: Fp1dWorld, targ: TargetRs): HlAction {
    let dst: TbLoc = (targ.posInStack == 0) ?
        { kind: "onStage", stackIx: targ.stackIx } :
        { kind: "onStack", stackIx: targ.stackIx, posInStack: targ.posInStack - 1 };
    return new Seq(go(w, dst), new TbGet());
}

// go put targ, and stay there.
//
// IN: carrysRs = true, Empty[arg], Connected[w, targ-1]
// OUT: carrysRs = false, Add[targ]
function goPutRs(w: Fp1dWorld, targ: TargetRs): HlAction {
    let dst: TbLoc = (targ.posInStack == 0) ?
        { kind: "onStage", stackIx: targ.stackIx } :
        { kind: "onStack", stackIx: targ.stackIx, posInStack: targ.posInStack - 1 };
    return new Seq(go(w, dst), new TbPut());
}

// go dst
//
// forall A.
// In: carrysRs = A
// OUT: carrysR = A
function go(w: Fp1dWorld, dst: TbLoc): HlAction {
    const tbLoc: TbLoc = w.tbLoc;
    switch (tbLoc.kind) {
        case 'onStage':
            switch (dst.kind) {
                case 'onStage':
                    const dIx = dst.stackIx - tbLoc.stackIx;
                    return dIx > 0 ? new FdwMove(dIx) : new Noop();
                case 'onStack':
                    return new Seq(
                        (w.stagePos !== dst.stackIx) ? new FdwMove(dst.stackIx - w.stagePos) : new Noop(),
                        new TbMove(dst.posInStack + 1)
                    );
            }
        case 'onStack':
            switch (dst.kind) {
                case 'onStage':
                    return new Seq(
                        new Par(
                            (tbLoc.posInStack > 1) ? new TbMove(-tbLoc.posInStack) : new Noop(),
                            (w.stagePos !== tbLoc.stackIx) ? new FdwMove(tbLoc.stackIx - w.stagePos) : new Noop()
                        ),
                        new TbMove(-1));
                case 'onStack':
                    // TODO
                    return new Noop();
            }
    }
}

// Implementation of Accumulating monad-ish object.
type WAs = [Fp1dWorld, Array<HlAction>];

function chain(m: WAs, f: (w: Fp1dWorld) => WAs): WAs {
    let [w, actions] = m;
    let [wNext, dAs] = f(w);
    return [wNext, actions.concat(dAs)];
}

/**
 * High level discrete actions.
 * 
 * Law for Par:
 * forall as' in permutation(as). apply(w, Par(as)) == apply(w, Seq(as'))
 * */
type HlAction
    = TbMove | FdwMove | TbPut | TbGet  // Delta of Fp1DWorld
    | Par | Seq | Noop;  // Generic control elements

/**
 * Remove useuless actions with no domain knowledge.
 * i.e.
 * * Noop in Par / Seq -> remove.
 * * empty Par, Seq -> Noop.
 * * Par, Seq singletons -> remvoe wrapping.
 * * Nested Par -> flatten.
 * * Nested Seq -> flatten.
 */
function simplify(a: HlAction): HlAction {
    return a;
}

class Noop {
    kind: 'Noop';
    constructor() { }
}

class TbMove {
    kind: 'TbMove';
    constructor(public n: number) { }
}

class TbPut {
    kind: 'TbPut';
    constructor() { }
}

class TbGet {
    kind: 'TbGet';
    constructor() { }
}

class FdwMove {
    kind: 'FdwMove';
    // FDW-RS has notion of "origin", maybe include that?
    constructor(public n: number) { }
}

// Actions that can start at the same time safely, and waits until all children acs finishes.
class Par {
    kind: "Par";
    public acs: Array<HlAction>;
    constructor(...acs: Array<HlAction>) {
        this.acs = acs;
    }
}

class Seq {
    kind: "Seq";
    public acs: Array<HlAction>;
    constructor(...acs: Array<HlAction>) {
        this.acs = acs;
    }
}

function applyAction(w: Fp1dWorld, a: HlAction): Fp1dWorld {
    return w;
}


interface TargetRs {
    stackIx: number;
    posInStack: number; // 0: first connected Rs, 1: second ...
}

/**
 * Immutable world representation for FeederPlanner1D.
 * 
 * In this world, only RS * n (n >= 0), FDW-RS * 1, TB * 1 can exist.
 * This also represents succesful static state.
 * 
 * e.g. world must be constrained:
 *  * TB must be on-center
 *  * both darm & driver is up (folded)
 *  * no motor is rotating
 */
class Fp1dWorld {
    // FDW-RS & connected RS.
    stagePos: number;
    connectedRs: Array<number>;  // must have length of FDW_NUM_PORTS

    // TB state
    carryRs: boolean;
    tbLoc: TbLoc;

    countRs(): number {
        return this.connectedRs.reduce((a, b) => a + b) + (this.carryRs ? 1 : 0);
    }
}

type TbLoc = TbOnStage | TbOnStack;

interface TbOnStage {
    kind: "onStage";
    stackIx: number;  // [0, FDW_NUM_PORTS)
}

interface TbOnStack {
    kind: "onStack"
    stackIx: number;  // [0, FDW_NUM_PORTS)
    posInStack: number; // 0: first connected Rs, 1: second ...
}
