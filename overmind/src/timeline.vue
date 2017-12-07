<template>
    <div class="timeline" style="display: flex; flex-direction: column">
        <div v-for="worker in workers" class="timeline-worker">
            <span class="timeline-header">{{worker.name}}</span>
            <span style="position: relative">
                <div class="timeline-action" v-for="task in worker.tasks" style="position:absolute; top: 0" v-bind:style="{left: task.init + 'px', width: task.dur + 'px'}">{{task.name}}</div>
            </span>
        </div>
    </div>
</template>

<script>
import Vue from 'vue';

export default {
    props: [],
    components: {
    },
    data() {
        const scale = 25.0;
        return {
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
    methods: {
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