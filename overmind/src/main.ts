declare const global: any;

import * as $ from 'jquery';
import * as Vue from 'vue/dist/vue.js';
import { PlanViewModel } from './plan-viewmodel';
import { WorldView } from './world-view';

import { WorkerBridge } from './comm';
import { WorkerPool } from './worker-pool';
import { ScaffoldModel } from './scaffold-model';

export function runMain(parsedArgs: any) {
    console.log('command line args', parsedArgs);

    const bridge = new WorkerBridge(parsedArgs['fake-packet']);
    const workerPool = new WorkerPool();
    const model = new ScaffoldModel();
    const planViewModel = new PlanViewModel(model, bridge);

    let appVm = new Vue({
        el: '#app',
        data: {
            bridge: bridge,
            model: model,
            workerPool: workerPool,
            worldView: null,
            planViewModel: planViewModel,
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
    const worldView = new WorldView($(window), $('#viewport'));
    planViewModel.bindView(worldView);
    worldView.startRenderer();
    worldView.start();

    appVm._data.worldView = worldView;


    // For console debugging.
    global.sendCommand = (c, a) => bridge.sendCommand(c, a);
}
