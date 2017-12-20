import * as THREE from 'three';
import { ScaffoldModel, S60RailStraight, S60RailHelix, S60RailRotator, ScaffoldThing, S60RailFeederWide, S60TrainBuilder, Port } from './scaffold-model';
import { Action, ActionSeq } from './action';
import { Coordinates } from './geometry';
import { CommandHistory } from './command-history';
import { comparing } from './functional';

/**
 * Planner takes a model (that's in specific state), and provides Timeline that's simulatable and/or executable.
 */
export interface Planner {
    // TODO: Simulation functionality should be moved to ScaffoldModel.
    setTime(tSec: number);

    getPlan(): Plan | string;
}

type WorkerId = string;

export class Plan {
    constructor(private actions: Map<WorkerId, Array<ActionSeq>>) {
    }

    /**
     * Guarantee: within worker, actionSeq is non-overlapping and ordered.
     */
    getSeqPerWorker(): Map<WorkerId, Array<ActionSeq>> {
        return this.actions;
    }

    /**
     * Guarantee: ordered by time.
     */
    getSeqTimeOrdered(): Array<[WorkerId, ActionSeq]> {
        const result = [];
        this.actions.forEach((seqs, wid) => {
            seqs.forEach(seq => result.push([wid, seq]));
        });
        result.sort(comparing(t => t[1].getT0()));
        return result;
    }

    getTotalTime(): number {
        let t1 = 0;
        this.actions.forEach((actionSeqArr, _) => {
            actionSeqArr.forEach(actionSeq => {
                t1 = Math.max(t1, actionSeq.getT1());
            });
        });
        return t1;
    }

    getTotalTxCommandSize(): number {
        let size = 0;
        this.actions.forEach((actionSeqArr, _) => {
            actionSeqArr.forEach(actionSeq => {
                const command = 'e' + actionSeq.getFullDesc();
                size += command.length;
            });
        });
        return size;
    }
}

// Read at module load.
const commandHistory = new CommandHistory();

/**
 * FeederPlanner1D is a very limited Planner for FDW-TB-RS interactions.
 */
export class FeederPlanner1D implements Planner {


    constructor(private srcModel: ScaffoldModel, private dstModel: ScaffoldModel) {
        //this.commandHistory =
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
        // TODO: do something about carryRs

        const wholeAction = new Seq(...actions);
        const flatActions = this.flattenAction(wholeAction);

        const m = new Map();
        flatActions[1].forEach(ta => {
            const index = ta.primAction.kind.startsWith('Tb') ? 'TB' : 'FDW-RS';
            if (!m.has(index)) {
                m.set(index, []);
            }
            const aSqs = this.translateCommand(ta);
            m.set(index, m.get(index).concat(aSqs));
        });
        return new Plan(m);
    }

    translateCommand(ta: TimedAction): Array<ActionSeq> {
        let actionSeqs = [];
        function emit(wt: string, memo: string) {
            actionSeqs.push([commandHistory.getByMemo(wt, memo), memo]);
        }
        if (ta.primAction instanceof TbGet) {
            emit('TB', 'C->DrvE');
            emit('TB', 'DrvE->Get');
            emit('TB', 'ArmRest');
            emit('TB', 'FindC-');
            emit('TB', 'DrvIn');
        } else if (ta.primAction instanceof TbPut) {
            emit('TB', 'C->DrvE');
            emit('TB', 'DrvE->Put');
            emit('TB', 'ArmRest');
            emit('TB', 'FindC-');
            emit('TB', 'DrvIn');
        } else if (ta.primAction instanceof TbMove) {
            const dist = Math.abs(ta.primAction.n);
            const dirPositive = ta.primAction.n > 0;
            for (let i = 0; i < dist; i++) {
                if (dirPositive) {
                    emit('TB', 'FindC+');
                } else {
                    emit('TB', 'FindC-');
                }
            }
        } else if (ta.primAction instanceof FdwMove) {
            const dist = Math.abs(ta.primAction.n);
            const dirPositive = ta.primAction.n > 0;
            for (let i = 0; i < dist; i++) {
                if (dirPositive) {
                    emit('FDW-RS', 'Ln');
                } else {
                    emit('FDW-RS', 'Rn');
                }
            }
        } else {
            actionSeqs.push("1000X" + ta.primAction.kind, ta.primAction.kind);
        }
        let aSqCoverted = [];
        let t0 = ta.t0;
        actionSeqs.forEach(asqAndM => {
            let [asq, memo] = asqAndM;
            let aSqCv = new ActionSeq(asq.split(',').map(seq => new Action(seq)), t0, -1);
            const dur = aSqCv.getDurationSec();
            aSqCoverted.push(new ActionSeq(asq.split(',').map(seq => new Action(seq)), t0, t0 + dur, memo));
            t0 += dur;
        });
        return aSqCoverted;
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
            fdw.paramx = (Math.cos(tSec * Math.PI / 4) + 1) * 0.165 / 2;
        }
    }

    /**
     * 
     * @returns (endT, actions)
     */
    flattenAction(a: HlAction, t0: number = 0): [number, Array<TimedAction>] {
        switch (a.kind) {
            case 'Par':
                {
                    const endTs = [];
                    const accum = [];
                    (<Par>a).acs.map(subA => this.flattenAction(subA, t0)).forEach(res => {
                        endTs.push(res[0]);
                        res[1].forEach(ta => accum.push(ta));
                    });
                    return [endTs.reduce((v0, v1) => Math.max(v0, v1), t0), accum];
                }
            case 'Seq':
                {
                    const accum = [];
                    let currT = t0;
                    (<Seq>a).acs.forEach(subA => {
                        const flatSubA = this.flattenAction(subA, currT);
                        currT = flatSubA[0];
                        flatSubA[1].forEach(ta => accum.push(ta));
                    });
                    return [currT, accum];
                }
            case 'Noop':
                return [t0, []];
            default:
                const sqs = this.translateCommand(new TimedAction(t0, -1, a)); // TODO: FIx this hack
                const t1 = sqs[sqs.length - 1].getT0() + sqs[sqs.length - 1].getDurationSec();
                return [t1, [new TimedAction(t0, t1, a)]];
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
        w.carryRs = false;  // TODO
        if (tb.attachedTo !== fdw) {
            return "TB must be attached to FDW-RS";
        }
        w.tbLoc = new TbOnStage(fdw.stagePos);
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
        new TbOnStage(targ.stackIx) :
        new TbOnStack(targ.stackIx, targ.posInStack - 1);
    return new Seq(go(w, dst), new TbGet());
}

// go put targ, and stay there.
//
// IN: carrysRs = true, Empty[arg], Connected[w, targ-1]
// OUT: carrysRs = false, Add[targ]
function goPutRs(w: Fp1dWorld, targ: TargetRs): HlAction {
    let dst: TbLoc = (targ.posInStack == 0) ?
        new TbOnStage(targ.stackIx) :
        new TbOnStack(targ.stackIx, targ.posInStack - 1);
    return new Seq(go(w, dst), new TbPut());
}

// go dst
//
// forall A.
// In: carrysRs = A
// OUT: carrysR = A
function go(w: Fp1dWorld, dst: TbLoc): HlAction {
    const tbLoc: TbLoc = w.tbLoc;
    if (tbLoc instanceof TbOnStage) {
        if (dst instanceof TbOnStage) {
            const dIx = dst.stackIx - tbLoc.stackIx;
            return dIx > 0 ? new FdwMove(dIx) : new Noop();
        } else if (dst instanceof TbOnStack) {
            return new Seq(
                (w.stagePos !== dst.stackIx) ? new FdwMove(dst.stackIx - w.stagePos) : new Noop(),
                new TbMove(dst.posInStack + 1)
            );
        }
    } else if (tbLoc instanceof TbOnStack) {
        if (dst instanceof TbOnStage) {
            return new Seq(
                new Par(
                    (tbLoc.posInStack > 1) ? new TbMove(-tbLoc.posInStack) : new Noop(),
                    (w.stagePos !== tbLoc.stackIx) ? new FdwMove(tbLoc.stackIx - w.stagePos) : new Noop()
                ),
                new TbMove(-1));
        } else if (dst instanceof TbOnStack) {
            if (tbLoc.stackIx === dst.stackIx) {
                return new TbMove(dst.posInStack - tbLoc.posInStack);
            } else {
                return new Seq(
                    (w.stagePos !== tbLoc.stackIx) ? new FdwMove(tbLoc.stackIx - w.stagePos) : new Noop(),
                    new TbMove(-(tbLoc.posInStack + 1)),
                    new FdwMove(dst.stackIx - w.stagePos),
                    new TbMove(dst.posInStack + 1)
                );
            }
        }
    } else {
        const _: never = tbLoc;
    }
}

// Implementation of Accumulating monad-ish object.
type WAs = [Fp1dWorld, Array<HlAction>];

function chain(m: WAs, f: (w: Fp1dWorld) => WAs): WAs {
    let [w, actions] = m;
    let [wNext, dAs] = f(w);
    return [wNext, actions.concat(dAs)];
}


class TimedAction {
    constructor(public t0: number, public t1: number, public primAction: HlAction) { }
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
    kind = 'Noop';
    constructor() { }
}

class TbMove {
    kind = 'TbMove';
    constructor(public n: number) { }
}

class TbPut {
    kind = 'TbPut';
    constructor() { }
}

class TbGet {
    kind = 'TbGet';
    constructor() { }
}

class FdwMove {
    kind = 'FdwMove';
    // FDW-RS has notion of "origin", maybe include that?
    constructor(public n: number) { }
}

// Actions that can start at the same time safely, and waits until all children acs finishes.
class Par {
    kind = "Par";
    public acs: Array<HlAction>;
    constructor(...acs: Array<HlAction>) {
        this.acs = acs;
    }
}

class Seq {
    kind = "Seq";
    public acs: Array<HlAction>;
    constructor(...acs: Array<HlAction>) {
        this.acs = acs;
    }
}

function applyAction(w: Fp1dWorld, a: HlAction): Fp1dWorld {
    switch (a.kind) {
        case 'TbMove':
            {
                const n = (<TbMove>a).n;
                let nw = w.clone();
                if (n === 0) {
                    return w;
                } else if (n < 0) {
                    console.error(w, a);
                    throw "applyAction: impossible action";
                } else if (w.tbLoc.kind === 'onStage') {
                    nw.tbLoc = new TbOnStack(w.tbLoc.stackIx, n - 1);
                } else {
                    const newPos = w.tbLoc.posInStack + n;
                    nw.tbLoc = (newPos === -1) ? new TbOnStage(w.tbLoc.stackIx) : new TbOnStack(w.tbLoc.stackIx, newPos);
                }
                return nw;
            }
        case 'TbGet':
            {
                let nw = w.clone();
                nw.carryRs = true;
                // TODO: Proper verification of position.
                nw.connectedRs[w.tbLoc.stackIx] -= 1;
                return nw;
            }
        case 'TbPut':
            {
                let nw = w.clone();
                nw.carryRs = false;
                // TODO: Proper verification of position.
                nw.connectedRs[w.tbLoc.stackIx] += 1;
                return nw;
            }
        case 'FdwMove':
            {
                let nw = w.clone();
                const n = (<FdwMove>a).n;
                if (w.tbLoc.kind === 'onStage') {
                    nw.tbLoc = new TbOnStage(nw.tbLoc.stackIx + n);
                }
                nw.stagePos += n;
                return nw;
            }
        case 'Noop':
            return w;
        case 'Seq':
            {
                let nw = w;
                (<Seq>a).acs.forEach(subA => {
                    nw = applyAction(w, subA);
                });
                return nw;
            }
        case 'Par':
            {
                let nw = w;
                (<Seq>a).acs.forEach(subA => {
                    nw = applyAction(w, subA);
                });
                return nw;
            }
        default:
            console.error("Complex action passed to applyAction");
    }
}


interface TargetRs {
    stackIx: number;
    posInStack: number; // 0: first connected Rs, 1: second ...
}

/**
 * Immutable world representation for `FeederPlanner1D`.
 * 
 * In this world, only RS * n (n >= 0), FDW-RS * 1, TB * 1 can exist.
 * This can also represents succesful static states, but not continuum between them.
 * 
 * e.g. world must be constrained:
 *  * TB must be on-center
 *  * both darm & driver is up (folded)
 *  * no motor is rotating
 *  * when TB is onStage, stagePos === tbLoc.stackIx (rail coupling)
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

    clone(): Fp1dWorld {
        const w = new Fp1dWorld();
        w.stagePos = this.stagePos;
        w.connectedRs = this.connectedRs.map(x => x);
        w.carryRs = this.carryRs;
        w.tbLoc = this.tbLoc;
        return w;
    }
}

type TbLoc = TbOnStage | TbOnStack;

class TbOnStage {
    kind: "onStage";
    // [0, FDW_NUM_PORTS)
    constructor(public stackIx: number) { }
}

class TbOnStack {
    kind: "onStack";
    // [0, FDW_NUM_PORTS)
    // 0: first connected Rs, 1: second ...
    constructor(public stackIx: number, public posInStack: number) {
    }
}
