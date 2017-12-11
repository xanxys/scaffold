import * as THREE from 'three';
import { ScaffoldModel, S60RailStraight, S60RailHelix, S60RailRotator, ScaffoldThing, S60RailFeederWide, S60TrainBuilder } from './scaffold-model';
import { Action, ActionSeq } from './action';

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
    constructor(private srcModel: ScaffoldModel, private dstModel: ScaffoldModel, private feeder: S60RailFeederWide, private builder: S60TrainBuilder) {
    }

    getPlan(): Plan {
        const m = new Map();
        m.set(1, [[0, new ActionSeq([new Action("250b-20")])]]);
        m.set(2, [[0, new ActionSeq([new Action("200a50")])]]);
        return new Plan(m);
    }

    setTime(tSec: number) {
        this.feeder.paramx = Math.cos(tSec * Math.PI / 2) * 0.05;
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
    readonly FDW_NUM_PORTS = 5;

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
