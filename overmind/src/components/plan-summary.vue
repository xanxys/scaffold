<template>
    <table class="table">
        <div v-if="counts.length === 0">Nothing</div>
        <tr v-for="entry in counts">
            <td>{{entry.name}}</td>
            <td>{{entry.count}}</td>
        </tr>
    </table>
</template>

<script>
export default {
    props: ['model'],
    data() {
        return {
        };
    },
    methods: {
        
    },
    computed: {
        counts() {
            let cnt = new Map();
            this.model.getThings().forEach(thing => cnt.set(thing.constructor.type, 1 + (cnt.get(thing.type) || 0)));

            let data = [];
            for (let [ty, c] of cnt) {
                data.push({name: ty, count: c});
            }
            return data;
        }
    }
}
</script>

<style>
</style>
