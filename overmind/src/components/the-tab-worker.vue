<template>
    <div id="tab_workers" class="container-fluid">
        <a v-if="!rawEnabled" style="color: #f0ad4e" href="#" @click="setRawEnabled(true)">
            <i class="material-icons">warning</i>Show raw actions
        </a>
        <a v-if="rawEnabled"  style="color: #eee" href="#" @click="setRawEnabled(false)">Hide raw actions</a>
        <worker-card v-for="worker in pool.workers" :key="worker.addr" :worker="worker" :show_raw="rawEnabled"/>
    </div>
</template>

<script>
import Vue from 'vue';

import WorkerCard from './worker-card.vue';

export default {
    props: ['pool'],
    components: {
        'worker-card': WorkerCard
    },
    data() {
        return {
            rawEnabled: false
        };
    },
    methods: {
        setRawEnabled(st) {
            this.rawEnabled = st;
        }
    }
}
</script>
