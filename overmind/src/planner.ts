import * as THREE from 'three';
import { ScaffoldModel, S60RailStraight, S60RailHelix, S60RailRotator, ScaffoldThing, S60RailFeederWide, S60TrainBuilder, Port } from './scaffold-model';
import { Action, ActionSeq } from './action';
import { Coordinates } from './geometry';

/**
 * Planner takes a model (that's in specific state), and provides Timeline that's simulatable and/or executable.
 */
export interface Planner {
    // TODO: Simulation functionality should be moved to ScaffoldModel.
    setTime(tSec: number);

    getPlan(): Plan;
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

    getPlan(): Plan {
        const m = new Map();
        m.set(1, [[0, new ActionSeq([new Action("250b-20")])]]);
        m.set(2, [[0, new ActionSeq([new Action("200a50")])]]);
        return new Plan(m);
    }

    setTime(tSec: number) {
        const wOrErr = this.interpretWorld(this.srcModel);
        if (tSec < 0.1) {
            console.log("IW", wOrErr);
        }
        if (typeof (wOrErr) === 'string') {
            console.error(wOrErr);
            return;
        }

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
        w.tbLoc = { kind: "onStage" };

        return w;
    }

    /**
     * Return the other port of RS.
     * If the spcified port is not shared by given rs, return undefined.
     */
    private static getOtherSide(wCoord: Coordinates, pos: THREE.Vector3, rs: S60RailStraight): THREE.Vector3? {
        const eps = 1e-3;
        const isShared = rs.ports.some(rsPort => {
            const rsPortPos = rs.coord.convertP(rsPort.pos, wCoord);
            return rsPortPos.distanceTo(pos) < eps;
        });
        return isShared ? rs.coord.convertP(rs.ports.find(rsPort => {
            const rsPortPos = rs.coord.convertP(rsPort.pos, wCoord);
            return !(rsPortPos.distanceTo(pos) < eps);
        }).pos, wCoord) : undefined;
    }
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
}

type TbLoc = TbOnStage | TbOnStack;

interface TbOnStage {
    kind: "onStage";
}

interface TbOnStack {
    kind: "onStack"
    stackIx: number;  // [0, FDW_NUM_PORTS)
    posInStack: number; // 0: first connected Rs, 1: second ...
}
