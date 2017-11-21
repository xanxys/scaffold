import $ from 'jquery';

global.jQuery = $;
require('bootstrap');

import Vue from 'vue/dist/vue.js';
import {WorkerBridge} from './comm.ts';
import WorkerPool from './worker-pool.ts';
import {WorldView, WorldViewModel} from './view-3d-client.ts';
import {ScaffoldModel} from './scaffold-model.ts';

// Components
import TheToolbar from './the-toolbar.vue';
Vue.component('the-toolbar', TheToolbar);

import TheSidepanel from './the-sidepanel.vue';
Vue.component('the-sidepanel', TheSidepanel);

import TheTabWorker from './the-tab-worker.vue';
Vue.component('the-tab-worker', TheTabWorker);

const bridge = new WorkerBridge(packet => {
    flash_status();
    if (packet.datagram !== null) {
        worker_pool.handle_datagram(packet);
    }
});

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

let appVm = new Vue({
    el: '#app',
    data: {
        bridge: bridge,
        model: model,
        workerPool: workerPool,
        worldView: worldView,
    },
});

//// HUGE HACK
// Something about WebGL needs this to be placed after new Vue(...).
// Otherwise <canvas> will be inserted to DOM but shows nothing.
// But worldview needs to be bound to the app component.
// As a workaround, access internal data object of the component instance to bind later.
const viewModel = new WorldViewModel(model, $('#add_rs'), $('#add_rh'), $('#add_rr'));
const worldView = new WorldView(model, $(window), $('#viewport'), viewModel);
viewModel.bindView(worldView);
worldView.startRenderer();
worldView.start();

appVm._data.worldView = worldView;


// For console debugging.
global.send_command = (c, a) => bridge.send_command(c, a);
