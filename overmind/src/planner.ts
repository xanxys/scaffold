import * as THREE from 'three';
import { ScaffoldModel, S60RailStraight, S60RailHelix, S60RailRotator, ScaffoldThing, S60RailFeederWide, S60TrainBuilder } from './scaffold-model';

/**
 * Planner takes a model (that's in specific state), and provides Timeline that's simulatable and/or executable.
 */
export interface Planner {
    // TODO: Simulation functionality should be moved to ScaffoldModel.
    setTime(tSec: number);
}

/**
 * FeederPlanner1D is a very limited Planner for FDW-TB-RS interactions.
 */
export class FeederPlanner1D implements Planner {
    constructor(private model: ScaffoldModel, private feeder: S60RailFeederWide, private builder: S60TrainBuilder) {
    }

    setTime(tSec: number) {
        this.feeder.paramx = Math.cos(tSec * Math.PI / 2) * 0.05;
    }
}
