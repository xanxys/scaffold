import * as $ from 'jquery';

import * as Vue from 'vue/dist/vue.js';
import { WorkerBridge } from './comm';
import WorkerPool from './worker-pool';
import { WorldView, WorldViewModel } from './view-3d-client';

import * as THREE from 'three';
import { ScaffoldModel, S60RailStraight, S60RailHelix, S60RailRotator, ScaffoldThing, S60RailFeederWide, S60TrainBuilder } from './scaffold-model';
import { FeederPlanner1D } from './planner';


export function runMain() {
    const bridge = new WorkerBridge();
    const workerPool = new WorkerPool();
    const model = new ScaffoldModel();

    function initModel() {
        let rs = new S60RailStraight();
        rs.coord.unsafeSetParent(model.coord, new THREE.Vector3(0, 0, 0.02));
        model.addRail(rs);

        let fd = new S60RailFeederWide();
        fd.coord.unsafeSetParent(model.coord, new THREE.Vector3(0.1, 0, 0));
        model.addRail(fd);

        let tb = new S60TrainBuilder();
        tb.coord.unsafeSetParent(model.coord, new THREE.Vector3(0, 0, 0.1));
        model.addRail(tb);

        return new FeederPlanner1D(model, fd, tb);
    }
    const planner = initModel();

    const viewModel = new WorldViewModel(model);

    let appVm = new Vue({
        el: '#app',
        data: {
            bridge: bridge,
            model: model,
            workerPool: workerPool,
            worldView: null,
            worldViewModel: viewModel,
            planner: planner,
        },
    });

    bridge.open(
        br => {
            appVm.$forceUpdate();
        },
        packet => {
            if (packet.datagram !== null) {
                workerPool.handleDatagram(packet);
            }
        });

    //// HUGE HACK
    // Something about WebGL needs this to be placed after new Vue(...).
    // Otherwise <canvas> will be inserted to DOM but shows nothing.
    // But worldview needs to be bound to the app component.
    // As a workaround, access internal data object of the component instance to bind later.
    const worldView = new WorldView(model, $(window), $('#viewport'), viewModel);
    viewModel.bindView(worldView);
    worldView.startRenderer();
    worldView.start();

    appVm._data.worldView = worldView;


    // For console debugging.
    global.sendCommand = (c, a) => bridge.sendCommand(c, a);
}
