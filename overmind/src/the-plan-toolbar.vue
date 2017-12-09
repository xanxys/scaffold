<template>
    <div style="display:flex; align-items: center">
        <i class="material-icons">add_box</i>
        <button @click="addRs" class="btn btn-default" :class="{'active': isAddRs}">RS</button>
        <button @click="addRh" class="btn btn-default" :class="{'active': isAddRh}">RH</button>
        <button @click="addRr" class="btn btn-default" :class="{'active': isAddRr}">RR</button>
        <button @click="remove" class="btn btn-default" :class="{'active': isRemove}"><i class="material-icons">delete_forever</i></button>
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
        return {
        };
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
    },
    computed: {
        isAddRs() {
            return this.viewmodel.state === ClickOpState.AddRs;
        },
        isAddRh() {
            return this.viewmodel.state === ClickOpState.AddRh;
        },
        isAddRr() {
            return this.viewmodel.state === ClickOpState.AddRr;
        },
        isRemove() {
            return this.viewmodel.state === ClickOpState.Remove;
        }
    }
}
</script>
