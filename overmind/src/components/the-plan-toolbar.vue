<template>
    <div>
        <div style="display:flex; align-items: center">
            <i class="material-icons">playlist_add</i>
            <button @click="popForFeederPlan" class="btn btn-default">PopulateForFeederPlan</button>
        </div>
        <div style="display:flex; align-items: center">
            <i class="material-icons">add_box</i>
            <button @click="addRs" class="btn btn-default" :class="{'active': isAddRs}">RS</button>
            <button @click="addRh" class="btn btn-default" :class="{'active': isAddRh}">RH</button>
            <button @click="addRr" class="btn btn-default" :class="{'active': isAddRr}">RR</button>
            <button @click="remove" class="btn btn-default" :class="{'active': isRemove}"><i class="material-icons">delete_forever</i></button>

            <button @click="edit" class="btn btn-default" :class="{'active': isEdit}"><i class="material-icons">mode_edit</i></button>

            <div style="flex-grow: 1"></div> 

            <button @click="togglePhysics" class="btn btn-default">
                <i class="material-icons">layers</i>Toggle Physics Elements
            </button>
        </div>
    </div>
</template>

<script>
import Vue from 'vue';
import { ClickOpState } from '../world-viewmodel';

export default {
    props: ['viewmodel'],
    components: {
    },
    data() {
        return {
        };
    },
    methods: {
        popForFeederPlan() {
            this.viewmodel.popForFeederPlan();
        },
        genFeederPlan() {
            this.viewmodel.genFeederPlan();
        },
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
        },
        edit() {
            this.viewmodel.setState(ClickOpState.None);
        },
        togglePhysics() {
            this.viewmodel.togglePhysics();
        },
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
        },
        isEdit() {
            return this.viewmodel.state === ClickOpState.None;
        }
    }
}
</script>
