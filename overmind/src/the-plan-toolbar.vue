<template>
    <div style="display:flex; align-items: center">
        <i class="material-icons">add_box</i>
        <button v-on:click="addRs" class="btn btn-default">RS</button>
        <button v-on:click="addRh" class="btn btn-default">RH</button>
        <button v-on:click="addRr" class="btn btn-default">RR</button>
        <button v-on:click="remove" class="btn btn-default"><i class="material-icons">delete_forever</i></button>
    </div>
</template>

<script>
import Vue from 'vue';
import {ClickOpState} from './view-3d-client';

export default {
    props: ['viewmodel'],
    components: {
    },
    data() {
        return {};
    },
    methods: {
        addRs() {
            this.viewmodel.setState(ClickOpState.AddRs);
        },
        addRh() {
            this.viewmodel.setState(ClickOpState.AddRh);
        },
        addRr() {
            this.viewmodel.setState(ClickOpState.AddRr);

        },
        remove() {
            this.viewmodel.setState(ClickOpState.Remove);
        }
    }
}
</script>
