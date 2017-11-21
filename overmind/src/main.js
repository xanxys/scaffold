import $ from 'jquery';

global.jQuery = $;
require('bootstrap');

import Vue from 'vue/dist/vue.js';
import Bridge from './comm.ts';
import WorkerPool from './worker-pool.ts';
import {WorldView, WorldViewModel} from './view-3d-client.ts';
import {ScaffoldModel} from './scaffold-model.ts';

// Components
import TheToolbar from './the-toolbar.vue';
Vue.component('the-toolbar', TheToolbar);

import WorkerCard from './worker-card.vue';
Vue.component('worker-card', WorkerCard);

import PlanSummary from './plan-summary.vue';
Vue.component('plan-summary', PlanSummary);

import PaneControl from './pane-control.vue';
Vue.component('pane-control', PaneControl);

import {Line} from 'vue-chartjs';
Vue.component('line-chart', {
    extends: Line,
    props: ['data', 'options'],
    mounted() {
        this.render();
    },
    methods: {
        render() {
            let xydata = this.data.map((v, ix) => ({
                x: ix,
                y: v
            }));
            this.renderChart({
                labels: this.data.map((v, ix) => ix),
                datasets: [{
                    label: "T",
                    data: xydata,
                    borderColor: "rgba(100,180,220,1)",
                    backgroundColor: "rgba(100,180,220,0.3)",
                }]
            }, {
                cubicInterpolationMode: "monotone",
                responsive: false,
                maintainAspectRatio: false
            });
            console.log(xydata);
        }
    },
    watch: {
        data: function() {
            this._chart.destroy();
            this.render();
        }
    }
});

const bridge = new Bridge(packet => {
    flash_status();
    if (packet.datagram !== null) {
        worker_pool.handle_datagram(packet);
    }
});

function flash_status() {
    let el = $('#conn-icon');
    el.addClass('text-muted');
    setTimeout(() => {
        el.removeClass('text-muted');
    }, 100);
}

const worker_pool = new WorkerPool();

let model = new ScaffoldModel();

let viewModel = new WorldViewModel(model, $('#add_rs'), $('#add_rh'), $('#add_rr'));
let worldView = new WorldView(model, $(window), $('#viewport'), viewModel);
viewModel.bindView(worldView);

worldView.start();

new Vue({
    el: '#tab_workers',
    data: {
        pool: worker_pool,
        raw_enabled: false
    },
    methods: {
        set_raw_enabled(st) {
            this.raw_enabled = st;
        }
    }
});

new Vue({
    el: '#app',
    data: {
        bridge: bridge,
    },
});

new Vue({
    el: '#sidepanel',
    data: {
        active_pane: "Workers",
        model: model,
        worker_pool: worker_pool,
        unit_ref_now: new Date(),
    },
    created() {
        this.timer = setInterval(() => this.unit_ref_now = new Date(), 800);
    },
    computed: {
        has_uninit() {
            return this.worker_pool.last_uninit !== null;
        },
        uninit_desc() {
            if (this.worker_pool.last_uninit === null) {
                return "All workers have good addresses so far.";
            } else {
                let stale = this.unit_ref_now - this.worker_pool.last_uninit;
                return "SrcAddr=0 observed ${staleness*1e-3} seconds ago.";
            }
        },
    },
    methods: {
        update_pane(new_active) {
            if (this.active_pane === 'Plan') {
                $('#tab_plan').hide();
                worldView.stop();
            } else if (this.active_pane === 'Workers') {
                $('#tab_workers').hide();
            }

            this.active_pane = new_active;

            if (new_active === 'Plan') {
                $('#tab_plan').show();
                worldView.reinitialize_controls();
                worldView.start();
            } else if (this.active_pane === 'Workers') {
                $('#tab_workers').show();
            }
        }
    }
});

global.send_command = (c, a) => bridge.send_command(c, a);
