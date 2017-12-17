import * as THREE from 'three';
import { ScaffoldModel, S60RailStraight, S60RailHelix, S60RailRotator, ScaffoldThing, S60TrainBuilder, S60RailFeederWide, ScaffoldThingLoader, Port } from './scaffold-model';
import { Plan, Planner, FeederPlanner1D } from './planner';
import { Coordinates } from './geometry';
import { WorldView, WorldViewModel, ClickOpState } from './world-view';
import { randomBytes } from 'crypto';
import { WorkerPool } from './worker-pool';

/**
 * A viewmodel used by both View3DClient, the-plan-toolbar, and timeline.
 * 
 * Knows about both current / future ScaffoldModel.
 */
export class PlanViewModel {
    private state = ClickOpState.None;
    private view: WorldView;
    private showPhysics = false;
    private isCurrent = true;

    private loader: ScaffoldThingLoader;
    private planner?: Planner;
    plan?: Plan = null;
    errorMsg: string = "";
    infoMsg: string = "";

    // Plan Execution.
    private execTimers: Array<NodeJS.Timer>;

    private targetModel: ScaffoldModel;

    constructor(private currModel, private workerPool: WorkerPool) {
        this.loader = new ScaffoldThingLoader();
        this.targetModel = new ScaffoldModel();
    }

    setState(state: ClickOpState) {
        this.state = state;
        this.rebind();
    }

    popForFeederPlan() {
        this.loader.loaded().then(loader => {
            {
                const rs = loader.create(S60RailStraight);
                rs.coord.unsafeSetParent(this.currModel.coord, new THREE.Vector3(0, 0, 0.02));
                this.currModel.addRail(rs);

                const fd = loader.create(S60RailFeederWide);
                fd.coord.unsafeSetParent(this.currModel.coord, new THREE.Vector3(0.1, 0, 0));
                this.currModel.addRail(fd);
                PlanViewModel.addRailToPort(this.currModel, fd.coord, fd.ports[3], loader.create(S60RailStraight));

                const tb = loader.create(S60TrainBuilder);
                tb.coord.unsafeSetParent(this.currModel.coord, new THREE.Vector3(0.105, -0.022, 0));
                this.currModel.addRail(tb);
            }
            {
                const fd = loader.create(S60RailFeederWide);
                fd.coord.unsafeSetParent(this.targetModel.coord, new THREE.Vector3(0.1, 0, 0));
                this.targetModel.addRail(fd);
                PlanViewModel.addRailToPort(this.targetModel, fd.coord, fd.ports[1], loader.create(S60RailStraight));

                const tb = loader.create(S60TrainBuilder);
                tb.coord.unsafeSetParent(this.targetModel.coord, new THREE.Vector3(0.105, -0.022, 0));
                this.targetModel.addRail(tb);
            }
        }).then(_ => {
            this.updatePlan();
            this.rebind();
        });
    }

    execCurrentPlan() {
        const workers = new Map([
            ['FDW-RS', 2165185564],
            ['TB', 4278401023]
        ]);

        this.execTimers =
            this.plan.getSeqTimeOrdered().map(([wid, seq]) => {
                return <NodeJS.Timer><any>setTimeout(() => {
                    this.workerPool.sendActionSeq(seq, workers.get(wid));
                }, seq.getT0() * 1e3);
            });
    }

    stopExec() {
        this.execTimers.forEach(t => clearTimeout(t));
        this.execTimers = [];
    }

    /** Call this when models are updated. */
    private updatePlan() {
        this.planner = new FeederPlanner1D(this.currModel, this.targetModel);

        this.errorMsg = "<calculating>";
        const planOrError = this.planner.getPlan();
        if (typeof (planOrError) === 'string') {
            this.plan = undefined;
            this.errorMsg = planOrError;
            this.infoMsg = '';
        } else {
            this.plan = planOrError;
            this.errorMsg = '';
            this.infoMsg = `${planOrError.getTotalTime()}sec Tx:${planOrError.getTotalTxCommandSize()}B`;
        }
    }

    setTime(tSec: number) {
        if (this.planner !== null) {
            this.planner.setTime(tSec);
        }
    }

    setIsCurrent(isCurrent: boolean) {
        this.isCurrent = isCurrent;
        this.rebind();
    }

    getIsCurrent(): boolean {
        return this.isCurrent;
    }

    togglePhysics() {
        this.showPhysics = !this.showPhysics;
    }

    bindView(view: WorldView) {
        this.view = view;
    }

    onClickUiObject(obj: any) {
        switch (this.state) {
            case ClickOpState.AddRs:
                this.loader.createAsync(S60RailStraight).then(r => this.addRail(obj, r));
                break;
            case ClickOpState.AddRh:
                this.loader.createAsync(S60RailHelix).then(r => this.addRail(obj, r));
                break;
            case ClickOpState.AddRr:
                this.loader.createAsync(S60RailRotator).then(r => this.addRail(obj, r));
                break;
            case ClickOpState.Remove:
                this.removeRail(obj);
                break;
        }
    }

    getShowPhysics(): boolean {
        return this.showPhysics;
    }

    private addRail(obj: any, newRail: ScaffoldThing) {
        PlanViewModel.addRailToPort(this.isCurrent ? this.currModel : this.targetModel, obj.userData.rail.coord, obj.userData.port, newRail);
        this.updatePlan();
        this.rebind();
    }

    private static addRailToPort(model: ScaffoldModel, orgCoord: Coordinates, orgPort: Port, newRail: ScaffoldThing) {
        newRail.coord.unsafeSetParentWithRelation(model.coord, orgCoord)
            .alignPt(newRail.ports[0].pos, orgPort.pos)
            .alignDir(newRail.ports[0].fwd, orgPort.fwd.clone().multiplyScalar(-1))
            .alignDir(newRail.ports[0].up, orgPort.up)
            .build();
        model.addRail(newRail);
    }

    private removeRail(obj: any) {
        (this.isCurrent ? this.currModel : this.targetModel).removeRail(obj.userData.rail);
        this.updatePlan();
        this.rebind();
    }

    private rebind() {
        this.view.bindViewModel(new WorldViewModelImpl(this.isCurrent ? this.currModel : this.targetModel, this, this.state));
    }
}

class WorldViewModelImpl implements WorldViewModel {
    constructor(public readonly model: ScaffoldModel, private planViewModel: PlanViewModel, public readonly state: ClickOpState) {
    }

    // Realtime
    getShowPhysics(): boolean {
        return this.planViewModel.getShowPhysics();
    }

    // Non-realtime
    onClickUiObject(obj: any) {
        return this.planViewModel.onClickUiObject(obj);
    }
}
