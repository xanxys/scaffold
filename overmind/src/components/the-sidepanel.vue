<template>
    <nav id="sidepanel" style="background-color: #333; height: 100%; display: flex; flex-direction: column">
        <div class="tab" :class="{'tab-selected': activePane === 'Plan'}">
            <pane-control name="Plan" :active="activePane" @change="update_pane"/>
            <div id="plan">
                <plan-summary :model="model"/>
            </div>
        </div>

        <div class="tab" :class="{'tab-selected': activePane === 'Workers'}">
            <pane-control name="Workers" :active="activePane" @change="update_pane"/>
            <div id="workers">
                <span class="engrave">ACTIVE</span>
                <table>
                <tbody>
                    <tr v-for="worker in workerPool.workers">
                    <td>
                        <h4><img width="25" height="25" :src="'data:image/png;base64,' + worker.identicon.toString()"/> {{worker.wtype}} <span style="font-size:80%; color: lightgray">{{worker.addr}}</span></h4>
                    </td>
                    </tr>
                </tbody>
                </table>
                <span class="engrave">INACTIVE</span>
                <table>
                <tbody>
                    <tr v-for="worker in workerPool.inactiveWorkers">
                    <td>
                        <h4><img width="25" height="25" :src="'data:image/png;base64,' + worker.identicon.toString()"/> {{worker.wtype}} <span style="font-size:80%; color: lightgray">{{worker.addr}}</span></h4>
                    </td>
                    </tr>
                </tbody>
                </table>
                <div v-if="hasUninit" class="alert alert-danger" role="alert">{{uninitDesc}}</div>
            </div>
        </div>

        <div class="tab" style="flex-grow: 1">
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
            activePane: "Plan",
            unitRefNow: new Date(),
        };
    },
    created() {
        this.timer = setInterval(() => this.unitRefNow = new Date(), 800);
    },
    computed: {
        hasUninit() {
            return this.workerPool.lastUninit !== null;
        },
        uninitDesc() {
            let stale = this.unitRefNow - this.workerPool.lastUninit;
            return "SrcAddr=0 observed ${staleness*1e-3} seconds ago.";
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
            }
        }
    }
}
</script>

<style>
.tab.tab-selected {
    background-color: #444;
    box-shadow: -10px 0px 10px black;
    padding: 8px 16px 8px;
}

.tab {
    box-shadow: -10px 0px 10px -10px black inset;  /* shadowed by right edge */
    padding: 16px;
    padding: 8px 16px 8px;

    border-bottom: 1px #222 solid; /* faint card separator */
}

.engrave {
    color: #aaa;
    font-weight: bold;
}
</style>
