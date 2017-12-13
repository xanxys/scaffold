<template>
    <div>
        <the-plan-toolbar :viewmodel="viewmodel"></the-plan-toolbar>
        <div id="viewport"></div>
        <timeline :viewmodel="viewmodel"></timeline>
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
        };
    },
    methods: {
    }
}
</script>
