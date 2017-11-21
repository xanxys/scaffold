<template>
    <div id="tab_workers">
        <a v-if="!raw_enabled" style="color: #f0ad4e" href="#" v-on:click="set_raw_enabled(true)"><i class="material-icons">warning</i>Show raw actions</a>
        <a v-if="raw_enabled"  style="color: #eee" href="#" v-on:click="set_raw_enabled(false)">Hide raw actions</a>
        <worker-card v-for="worker in pool.workers" v-bind:worker="worker" v-bind:show_raw="raw_enabled"/>
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
            raw_enabled: false
        };
    },
    methods: {
        set_raw_enabled(st) {
            this.raw_enabled = st;
        }
    }
}
</script>
