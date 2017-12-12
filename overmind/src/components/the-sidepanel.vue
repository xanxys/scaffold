<template>
    <nav id="sidepanel" style="background-color: #333; height: 100%; display: flex; flex-direction: column">
        <div class="tab-unselected">
            <pane-control name="Plan" :active="activePane" @change="update_pane"/>
            <div id="plan">
                <plan-summary :model="model"/>
            </div>
        </div>

        <div class="tab-selected">
            <pane-control name="Workers" :active="activePane" @change="update_pane"/>
            <div id="workers">
                <table>
                <tbody>
                    <tr v-for="worker in workerPool.workers">
                    <td>
                        <h4><img width="25" height="25" :src="'data:image/png;base64,' + worker.identicon.toString()"/> {{worker.wtype}} <span style="font-size:80%; color: lightgray">{{worker.addr}}</span></h4>
                    </td>
                    </tr>
                </tbody>
                </table>
                <div :class="{'alert': true, 'alert-info': !has_uninit, 'alert-danger': has_uninit}" role="alert">{{uninit_desc}}</div>
            </div>
        </div>

        <div class="tab-unselected">
            <pane-control name="Settings" :active="activePane" @change="update_pane"/>
        </div>

        <div class="tab-unselected" style="flex-grow: 1">
        </div>
    </nav>
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
            activePane: "Workers",
            unitRefNow: new Date(),
        };
    },
    created() {
        this.timer = setInterval(() => this.unitRefNow = new Date(), 800);
    },
    computed: {
        has_uninit() {
            return this.workerPool.lastUninit !== null;
        },
        uninit_desc() {
            if (this.workerPool.lastUninit === null) {
                return "All workers have good addresses so far.";
            } else {
                let stale = this.unitRefNow - this.workerPool.lastUninit;
                return "SrcAddr=0 observed ${staleness*1e-3} seconds ago.";
            }
        },
    },
    methods: {
        update_pane(newActive) {
            switch(this.activePane) {
                case 'Plan':
                    $('#tab_plan').hide();
                    this.worldView.stop();
                    break;
                case 'Workers':
                    $('#tab_workers').hide();
                    break;
                case 'Settings':
                    $('#tab_settings').hide();
                    break;
            }

            this.activePane = newActive;

            switch (newActive) {
                case 'Plan':
                    $('#tab_plan').show();
                    this.worldView.reinitializeControls();
                    this.worldView.start();
                    break;
                case 'Workers':
                    $('#tab_workers').show();
                    break;
                case 'Settings':
                    $('#tab_settings').show();
                    break;
            }
        }
    }
}
</script>

<style>
.tab-selected {
    background-color: #444;
    box-shadow: -10px 0px 10px black;
    padding: 8px 16px 8px;
}

.tab-unselected {
    box-shadow: -10px 0px 10px -10px black inset;  /* shadowed by right edge */
    padding: 16px;
    padding: 8px 16px 8px;

    border-bottom: 1px #222 solid; /* faint card separator */
}
</style>
