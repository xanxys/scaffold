import * as THREE from 'three';
import { ScaffoldModel, S60RailStraight, S60RailHelix, S60RailRotator, ScaffoldThing, S60RailFeederWide, S60TrainBuilder } from './scaffold-model';

// Fixed functionality planner for FDW-TB-RS interactions.
export class FeederPlanner1D {
    constructor(private model: ScaffoldModel, private feeder: S60RailFeederWide, private builder: S60TrainBuilder) {
    }

    setTime(tSec: number) {
        this.feeder.paramx = Math.cos(tSec * Math.PI / 2) * 0.05;
    }
}
