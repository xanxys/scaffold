<template>
    <div>
        <div>
        CURR TARG
        </div>
        <div class="timeline" style="display: flex; flex-direction: column">
            <table>
                <tr v-for="worker in workers" :key="worker.name" class="timeline-worker">
                    <td>
                        <span class="timeline-header">{{worker.name}}</span>
                    </td>
                    <td>
                        <span style="position: relative">
                            <div class="timeline-action" v-for="task in worker.tasks"
                                style="position:absolute; "
                                :title="task.longDesc"
                                :style="{left: (pxPerSec * task.init) + 'px', width: (pxPerSec * task.dur) + 'px'}">{{task.name}}</div>
                        </span>
                    </td>
                </tr>
            </table>
        </div>
        <button class="btn btn-primary" @click="simStart">Sim Start</button>
        <button class="btn btn-primary" @click="simStop">Sim Stop</button>
        <span>T={{timeSec.toFixed(2)}}s</span>
        <div v-if="viewmodel.errorMsg" class="alert alert-warning">{{viewmodel.errorMsg}}</div>
        <div v-if="viewmodel.infoMsg" class="alert alert-info">{{viewmodel.infoMsg}}</div>
        <div v-if="viewmodel.infoMsg">
            <button class="btn btn-start" @click="exec">Exec</button>
            <button class="btn btn-start" @click="execStep">Exec(Step)</button>
            <button class="btn btn-danger" @click="stop">Stop</button>
            Step={{viewmodel.execNumComplete}}
        </div>
    </div>
</template>

<script>
import Vue from 'vue';

export default {
    props: ['viewmodel'],
    components: {
    },
    data() {
        return {
            simInterval: null,
            timeOrigin: new Date(),
            timeNow: new Date(),
        };
    },
    computed: {
        pxPerSec() {
            const pl = this.viewmodel.plan;
            if (!pl) {
                return 100;
            }
            const maxWidth = 1000;
            return maxWidth / pl.getTotalTime();
        },
        workers() {
            const pl = this.viewmodel.plan;
            if (!pl) {
                return [];
            }

            const m = pl.getSeqPerWorker();
            let results = [];
            m.forEach((seqs, addr) => {
                const workerName = addr;
                results.push({
                    name: workerName,
                    tasks: seqs.map(tAndSq => {
                        return {
                            name: tAndSq.getLabel(),
                            init: tAndSq.getT0(),
                            dur: tAndSq.getDurationSec(),
                            longDesc: tAndSq.getFullDesc(),
                        };
                    }),
                });
            });
            return results;
        },
        timeSec() {
            return (this.timeNow - this.timeOrigin) * 1e-3;
        }
    },
    methods: {
        simStart() {
            if (this.simInterval) {
                clearInterval(this.simInterval);
            }
            this.timeOrigin = new Date();
            this.simInterval = setInterval(() => {
                this.timeNow = new Date();
                this.viewmodel.setTime(this.timeSec);
            }, 50);
        },
        simStop() {
            if (this.simInterval) {
                clearInterval(this.simInterval);
                this.simInterval = null;
            }
        },
        exec() {
            // TODO: Show time indicator (text & bar)
            this.viewmodel.execCurrentPlan();
        },
        execStep() {
            this.viewmodel.stepExecCurrentPlan();
        },
        stop() {
            // TODO: Stop indicator at curr ext
            this.viewmodel.stopExec();
        }
    }
}
</script>

<style>
.timeline-worker {
    height: 35px;
    border-top: 1px solid white;
    padding-top: 5px;
    padding-bottom: 5px;
}

.timeline-header {
    padding-right: 2em;
}

.timeline-action {
    border: 1px solid #8ca;
    background-color: #888;
}
</style>