<template>
    <div>
        <the-plan-toolbar :viewmodel="viewmodel"></the-plan-toolbar>
        <div style="display: flex">
            <div id="viewport"></div>
            <div>
                <section v-if="showFdwProperty">
                    <h4>FDW-RS Properties</h4>
                    FDW.stagePos = {{viewmodel.selectedFdw.stagePos}}
                    <br/>
                    <button class="btn btn-info" @click="decPropFdw"><i class="material-icons">remove</i></button>
                    <button class="btn btn-info" @click="incPropFdw"><i class="material-icons">add</i></button>

                    <br/>
                    Will also affect:
                    <ul>
                        <li>TB (coupled by rail)</li>
                    </ul>
                </section>
                <section v-if="showTbProperty">
                    <h4>TB Properties</h4>
                    TB.stagePos = 1.0 ??
                    <br/>
                    <button class="btn btn-info" @click="decProp"><i class="material-icons">remove</i></button>
                    <button class="btn btn-info" @click="incProp"><i class="material-icons">add</i></button>
                </section>
            </div>
        </div>
        <button @click="toggleMode" class="btn btn-default">
                <i class="material-icons">compare_arrows</i>{{isCurrent ? "Showing Current" : "Showing Future"}}
        </button>
        <timeline :viewmodel="viewmodel"></timeline>
    </div>
</template>

<script>
import Vue from 'vue';
import { ClickOpState } from '../world-view';

export default {
    props: ['viewmodel'],
    components: {
    },
    data() {
        return {
        };
    },
    methods: {
        decPropFdw() {
            this.viewmodel.selectedFdw.stagePos -= 1;
            this.viewmodel.updatePlan();
        },
        incPropFdw() {
            this.viewmodel.selectedFdw.stagePos += 1;
            this.viewmodel.updatePlan();
        },
        toggleMode() {
            this.viewmodel.setIsCurrent(!this.viewmodel.getIsCurrent());
        },
    },
    computed: {
        showFdwProperty() {
            return this.viewmodel.selectedFdw !== null;
        },
        showTbProperty() {
            return this.viewmodel.selectedTb !== null;
        },
        isCurrent() {
            return this.viewmodel.getIsCurrent();
        },
    }
}
</script>
