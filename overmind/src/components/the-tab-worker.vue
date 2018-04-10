<template>
    <div class="container-fluid">
        <worker-card v-for="worker in pool.workers" :key="worker.addr" :worker="worker"/>
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
        return {};
    },
    methods: {
    }
}
</script>
