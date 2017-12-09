<template>
    <div>
        <div class="timeline" style="display: flex; flex-direction: column">
            <div v-for="worker in workers" :key="worker.name" class="timeline-worker">
                <span class="timeline-header">{{worker.name}}</span>
                <span style="position: relative">
                    <div class="timeline-action" v-for="task in worker.tasks" style="position:absolute; top: 0" :style="{left: task.init + 'px', width: task.dur + 'px'}">{{task.name}}</div>
                </span>
            </div>
        </div>
        <button class="btn btn-primary" @click="simStart">Sim Start</button>
        <button class="btn btn-primary" @click="simStop">Sim Stop</button>
        |
        <button class="btn btn-danger" @click="exec">Exec</button>|
        <span>T={{timeSec.toFixed(2)}}s</span>
    </div>
</template>

<script>
import Vue from 'vue';

export default {
    props: ['viewmodel'],
    components: {
    },
    data() {
        const scale = 25.0;
        return {
            simInterval: null,
            timeOrigin: new Date(),
            timeNow: new Date(),
            workers: [
                {
                    name: "W1",
                    tasks: [{
                        name: "up",
                        init: 3 * scale,
                        dur: 5 * scale
                    },{
                        name: "fasten",
                        init: 8 * scale,
                        dur: 10 * scale
                    }
                ]
                },
                {
                    name: "F1",
                    tasks: [{
                        name: "up",
                        init: 0 * scale,
                        dur: 5 * scale
                    },{
                        name: "fasten",
                        init: 5 * scale,
                        dur: 3 * scale
                    }
                ]
                },
            ]
        };
    },
    computed: {
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