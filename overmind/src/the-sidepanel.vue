<template>
    <div id="sidepanel" class="col-md-3" style="background-color: #333; height: 100%; box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23)">
        <pane-control name="Plan" v-bind:active="active_pane" v-on:change="update_pane"/>
        <div id="plan">
            <plan-summary v-bind:model="model"/>
        </div>

        <pane-control name="Workers" v-bind:active="active_pane" v-on:change="update_pane"/>
        <div id="workers">
            <table>
            <tbody>
                <tr v-for="worker in workerPool.workers">
                <td>
                    <h4><img width="25" height="25" v-bind:src="'data:image/png;base64,' + worker.identicon.toString()"/> {{worker.wtype}} <span style="font-size:80%; color: lightgray">{{worker.addr}}</span></h4>
                </td>
                </tr>
            </tbody>
            </table>
            <div v-bind:class="{'alert': true, 'alert-info': !has_uninit, 'alert-danger': has_uninit}" role="alert">{{uninit_desc}}</div>
        </div>
    </div>
</template>

<script>
import Vue from 'vue';
import $ from 'jquery';

import PlanSummary from './plan-summary.vue';
import PaneControl from './pane-control.vue';

export default {
    props: ['model', 'workerPool', 'worldView'],
    components: {
        'plan-summary': PlanSummary,
        'pane-control': PaneControl,
    },
    data() {
        return {
            active_pane: "Workers",
            unit_ref_now: new Date(),
        };
    },
    created() {
        this.timer = setInterval(() => this.unit_ref_now = new Date(), 800);
    },
    computed: {
        has_uninit() {
            return this.workerPool.last_uninit !== null;
        },
        uninit_desc() {
            if (this.workerPool.last_uninit === null) {
                return "All workers have good addresses so far.";
            } else {
                let stale = this.unit_ref_now - this.workerPool.last_uninit;
                return "SrcAddr=0 observed ${staleness*1e-3} seconds ago.";
            }
        },
    },
    methods: {
        update_pane(new_active) {
            if (this.active_pane === 'Plan') {
                $('#tab_plan').hide();
                this.worldView.stop();
            } else if (this.active_pane === 'Workers') {
                $('#tab_workers').hide();
            }

            this.active_pane = new_active;

            if (new_active === 'Plan') {
                $('#tab_plan').show();
                this.worldView.reinitialize_controls();
                this.worldView.start();
            } else if (this.active_pane === 'Workers') {
                $('#tab_workers').show();
            }
        }
    }
}
</script>
