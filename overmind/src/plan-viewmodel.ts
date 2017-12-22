import * as THREE from 'three';
import { ScaffoldModel, S60RailStraight, S60RailHelix, S60RailRotator, ScaffoldThing, S60TrainBuilder, S60RailFeederWide, ScaffoldThingLoader, Port } from './scaffold-model';
import { Plan, Planner, FeederPlanner1D } from './planner';
import { Coordinates } from './geometry';
import { WorldView } from './world-view';
import { WorldViewModel, ClickOpState, WorldViewModelCb } from './world-viewmodel';
import { randomBytes } from 'crypto';
import { WorkerPool } from './worker-pool';

/**
 * A viewmodel used by both View3DClient, the-plan-toolbar, and timeline.
 * 
 * Knows about both current / future ScaffoldModel.
 */
export class PlanViewModel implements WorldViewModelCb {
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
    public execNumComplete = 0;
    public execTime = 0;
    private execTimers: Array<NodeJS.Timer>;
    private execInterval: any;

    private targetModel: ScaffoldModel;
    worldViewModel: WorldViewModel;

    constructor(private currModel: ScaffoldModel, private workerPool: WorkerPool) {
        this.loader = new ScaffoldThingLoader();
        this.targetModel = new ScaffoldModel();

        this.worldViewModel = new WorldViewModel(currModel, this.state, this);
    }

    setState(state: ClickOpState) {
        this.state = state;
        this.worldViewModel = new WorldViewModel(this.isCurrent ? this.currModel : this.targetModel, state, this)
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
                this.currModel.addRailToPort(fd.coord, fd.ports[3], loader.create(S60RailStraight));

                const tb = loader.create(S60TrainBuilder);
                tb.coord.unsafeSetParent(this.currModel.coord, new THREE.Vector3(0.105, -0.022, 0));
                this.currModel.addRail(tb);

                this.currModel.attachTrainToRail(tb, fd);
            }
            {
                const fd = loader.create(S60RailFeederWide);
                fd.coord.unsafeSetParent(this.targetModel.coord, new THREE.Vector3(0.1, 0, 0));
                this.targetModel.addRail(fd);
                this.targetModel.addRailToPort(fd.coord, fd.ports[1], loader.create(S60RailStraight));

                const tb = loader.create(S60TrainBuilder);
                tb.coord.unsafeSetParent(this.targetModel.coord, new THREE.Vector3(0.105, -0.022, 0));
                this.targetModel.addRail(tb);

                this.targetModel.attachTrainToRail(tb, fd);
            }
        }).then(_ => {
            this.updatePlan();
            this.rebind();
        });
    }

    stepExecCurrentPlan() {
        let sqs = this.plan.getSeqTimeOrdered();
        if (this.execNumComplete < sqs.length) {
            const [wid, seq] = sqs[this.execNumComplete];
            this.workerPool.sendActionSeq(seq, this.workerPool.typeToAddr.get(wid));
            this.execTime += seq.getDurationSec();
            this.execNumComplete += 1;
        }
    }

    skipExecStep() {
        let sqs = this.plan.getSeqTimeOrdered();
        if (this.execNumComplete < sqs.length) {
            const [wid, seq] = sqs[this.execNumComplete];
            this.execTime += seq.getDurationSec();
            this.execNumComplete += 1;
        }
    }

    execCurrentPlan() {
        this.execTimers =
            this.plan.getSeqTimeOrdered().map(([wid, seq]) => {
                return <NodeJS.Timer><any>setTimeout(() => {
                    this.execNumComplete += 1;
                    this.workerPool.sendActionSeq(seq, this.workerPool.typeToAddr.get(wid));
                }, seq.getT0() * 1e3);
            });

        const t0 = new Date();
        this.execTime = 0;
        this.execInterval = setInterval(() => {
            this.execTime = (<any>new Date() - <any>t0) * 1e-3;
        }, 100);
    }

    stopExec() {
        this.execTimers.forEach(t => clearTimeout(t));
        this.execTimers = [];

        clearInterval(this.execInterval);
        this.execInterval = null;

        this.execNumComplete = 0;
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
        this.worldViewModel = new WorldViewModel(this.isCurrent ? this.currModel : this.targetModel, this.state, this)
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

    getShowPhysics(): boolean {
        return this.showPhysics;
    }

    onModelUpdated() {
        this.updatePlan();
        this.rebind();
    }

    getLoader(): ScaffoldThingLoader {
        return this.loader;
    }

    private rebind() {
        this.view.bindViewModel(this.worldViewModel);
    }
}
