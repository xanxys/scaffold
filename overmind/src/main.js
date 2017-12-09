import $ from 'jquery';

global.jQuery = $;
require('bootstrap');

import Vue from 'vue/dist/vue.js';
import { WorkerBridge } from './comm.ts';
import WorkerPool from './worker-pool.ts';
import { WorldView, WorldViewModel } from './view-3d-client.ts';

import * as THREE from 'three';
import { ScaffoldModel, S60RailStraight, S60RailHelix, S60RailRotator, ScaffoldThing, S60RailFeederWide, S60TrainBuilder } from './scaffold-model';
import {FeederPlanner1D} from './planner.ts';

// Components
import TheToolbar from './the-toolbar.vue';
Vue.component('the-toolbar', TheToolbar);

import TheSidepanel from './the-sidepanel.vue';
Vue.component('the-sidepanel', TheSidepanel);

import ThePlanToolbar from './the-plan-toolbar.vue';
Vue.component('the-plan-toolbar', ThePlanToolbar);

import Timeline from './timeline.vue';
Vue.component('timeline', Timeline);

import TheTabWorker from './the-tab-worker.vue';
Vue.component('the-tab-worker', TheTabWorker);

const bridge = new WorkerBridge();

// TODO: Move to the-toolbar.vue
function flash_status() {
    let el = $('#conn-icon');
    el.addClass('text-muted');
    setTimeout(() => {
        el.removeClass('text-muted');
    }, 100);
}

const workerPool = new WorkerPool();
const model = new ScaffoldModel();

function initModel() {
    let rs = new S60RailStraight();
    rs.coord.unsafeSetParent(model.coord, new THREE.Vector3(0, 0, 0.02));
    model.things.push(rs);

    let fd = new S60RailFeederWide();
    fd.coord.unsafeSetParent(model.coord, new THREE.Vector3(0.1, 0, 0));
    model.things.push(fd);

    let tb = new S60TrainBuilder();
    tb.coord.unsafeSetParent(model.coord, new THREE.Vector3(0, 0, 0.1));
    model.things.push(tb);

    const planner = new FeederPlanner1D(model, fd, tb);
}
initModel();

const viewModel = new WorldViewModel(model, $('#add_rs'), $('#add_rh'), $('#add_rr'));

let appVm = new Vue({
    el: '#app',
    data: {
        bridge: bridge,
        model: model,
        workerPool: workerPool,
        worldView: worldView,
        worldViewModel: viewModel,
    },
});

bridge.open(
    br => {
        appVm.$forceUpdate();
    },
    packet => {
        flash_status();
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
