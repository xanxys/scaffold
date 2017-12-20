import * as THREE from 'three';
import { ScaffoldModel, S60RailStraight, S60RailHelix, S60RailRotator, ScaffoldThing, S60TrainBuilder, S60RailFeederWide, ScaffoldThingLoader, Port } from './scaffold-model';
import { Plan, Planner, FeederPlanner1D } from './planner';
import { Coordinates } from './geometry';
import { WorldView } from './world-view';
import { WorkerPool } from './worker-pool';

/**
 * Current "tool" state. Conceptually, this belongs to single `ScaffoldModel` and `WorldViewModel`,
 * but for UI naturalness the state belongs to PlanViewModel.
 */
export enum ClickOpState {
    None,
    AddRs,
    AddRh,
    AddRr,
    Remove,
}

export interface WorldViewModelCb {
    getLoader(): ScaffoldThingLoader;

    onModelUpdated();
}

export class WorldViewModel {
    selectedTb?: S60TrainBuilder = null;
    selectedFdw?: S60RailFeederWide = null;

    constructor(public readonly model: ScaffoldModel, public readonly state: ClickOpState, private cb: WorldViewModelCb) {

    }

    getShowPhysics(): boolean {
        return false;
    }

    onClickUiObject(obj: any) {
        switch (this.state) {
            case ClickOpState.AddRs:
                this.cb.getLoader().createAsync(S60RailStraight).then(r => this.addRail(obj, r));
                break;
            case ClickOpState.AddRh:
                this.cb.getLoader().createAsync(S60RailHelix).then(r => this.addRail(obj, r));
                break;
            case ClickOpState.AddRr:
                this.cb.getLoader().createAsync(S60RailRotator).then(r => this.addRail(obj, r));
                break;
            case ClickOpState.Remove:
                this.removeRail(obj);
                break;
            case ClickOpState.None:
                console.log('E');
                const thing = obj.userData.thing;
                if (thing.type === 'TB') {
                    this.selectedTb = <S60TrainBuilder>thing;
                    this.selectedFdw = null;
                } else if (thing.type === 'FDW-RS') {
                    this.selectedTb = null;
                    this.selectedFdw = <S60RailFeederWide>thing;
                }
                break;
            default:
                let _: never = this.state;
        }
    }

    private addRail(obj: any, newRail: ScaffoldThing) {
        this.model.addRailToPort(obj.userData.rail.coord, obj.userData.port, newRail);
        this.cb.onModelUpdated();
    }

    private removeRail(obj: any) {
        this.model.removeRail(obj.userData.rail);
        this.cb.onModelUpdated();
    }
}
