<template>
<h2>{{name}}
  <button v-bind:class="{active: active === name}" v-on:click="activate" class="btn btn-default" style="float: right" title="Expand details"><span class="glyphicon glyphicon-chevron-right"></span></button>
</h2>
</template>

<script>
export default {
    props: ['name', 'active'],
    data() {
        return {}
    },
    methods: {
        activate() {
            this.active = this.name;
            this.$emit('change', this.name);
        }
    }
}
</script>

<style>
button {
  transition: opacity 0.1s linear;
}

button.active {
    z-index: 100;
    position: relative;

    opacity: 0;
    transform: scale(3) translate(100px, 0);
    transition: opacity 0.3s linear, transform 0.3s ease-in;
}
</style>
