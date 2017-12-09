import * as THREE from 'three';
import { ScaffoldModel, S60RailStraight, S60RailHelix, S60RailRotator, ScaffoldThing, S60RailFeederWide, S60TrainBuilder } from './scaffold-model';

// Fixed functionality planner for FDW-TB-RS interactions.
export class FeederPlanner1D {
    constructor(private model: ScaffoldModel, feeder: S60RailFeederWide, builder: S60TrainBuilder) {
    }

    setTime(t: number) {
    }
}
