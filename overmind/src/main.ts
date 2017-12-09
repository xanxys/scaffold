declare const global: any;

import * as $ from 'jquery';
import * as Vue from 'vue/dist/vue.js';
import { WorldView, WorldViewModel } from './view-3d-client';

import { WorkerBridge } from './comm';
import WorkerPool from './worker-pool';
import { ScaffoldModel } from './scaffold-model';

export function runMain() {
    const bridge = new WorkerBridge();
    const workerPool = new WorkerPool();
    const model = new ScaffoldModel();
    const viewModel = new WorldViewModel(model);

    let appVm = new Vue({
        el: '#app',
        data: {
            bridge: bridge,
            model: model,
            workerPool: workerPool,
            worldView: null,
            worldViewModel: viewModel,
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
