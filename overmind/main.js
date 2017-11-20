import $ from 'jquery';

global.jQuery = $;
require('bootstrap');

import Vue from 'vue/dist/vue.js';
import {Line} from 'vue-chartjs';
import Bridge from './comm.ts';
import WorkerPool from './worker-pool.ts';
import View3DClient from './view-3d-client.ts';
import {ScaffoldModel} from './scaffold-model.ts';

// Components.
import PaneControl from './pane-control.vue';
import WorkerCard from './worker-card.vue';
Vue.component('pane-control', PaneControl);
Vue.component('worker-card', WorkerCard);

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
let client = new View3DClient(model, $(window), $('#viewport'), $('#add_rs'));
client.start();

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
    el: '#nav',
    data: {
        port: bridge,
        ref_now: new Date(),
        last_refresh: null,
        period: 15
    },
    created() {
        this.timer = setInterval(() => {
            this.ref_now = new Date();
            if (this.last_refresh == null || (this.period != null && this.ref_now - this.last_refresh > this.period * 1e3)) {
                this.refresh_now();
            }
        }, 1000);
    },
    computed: {
        refresh_ago() {
            let autoref = (this.period !== null) ? `(auto: every ${this.period} sec)` : '(auto disabled)'
            if (this.last_refresh !== null) {
                let delta_sec = Math.floor(Math.max(0, this.ref_now - this.last_refresh) * 1e-3);
                return `Last refreshed ${delta_sec} sec ago ${autoref}`;
            } else {
                return `Never refreshed ${autoref}`;
            }
        },
        status() {
            if (this.port.isOpen) {
                return 'connected';
            } else {
                return 'cutoff'
            }
        },
        status_class() {
            if (this.port.isOpen) {
                return 'text-success';
            } else {
                return 'text-muted';
            }
        },
        path() {
            return this.port.path;
        }
    },
    methods: {
        refresh_now() {
            bridge.send_command('p');
            this.last_refresh = new Date();
        },
        set_ref_period(period) {
            this.period = period;
        }
    }
});

new Vue({
    el: '#sidepanel',
    data: {
        active_pane: "Workers",
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
                client.stop();
            } else if (this.active_pane === 'Workers') {
                $('#tab_workers').hide();
            }

            this.active_pane = new_active;

            if (new_active === 'Plan') {
                $('#tab_plan').show();
                client.reinitialize_controls();
                client.start();
            } else if (this.active_pane === 'Workers') {
                $('#tab_workers').show();
            }
        }
    }
});

global.send_command = (c, a) => bridge.send_command(c, a);
