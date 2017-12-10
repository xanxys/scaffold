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
    constructor(private model: ScaffoldModel, private feeder: S60RailFeederWide, private builder: S60TrainBuilder) {
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
