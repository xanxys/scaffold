<template>
<h2 style="margin-top:0">{{name}}
  <button :class="{active: active === name}" @click="activate" class="pane-button btn btn-default" style="float: right" title="Expand details"><span class="glyphicon glyphicon-chevron-right"></span></button>
</h2>
</template>

<script>
export default {
    props: ['name', 'active'],
    data() {
        return {};
    },
    methods: {
        activate() {
            this.$emit('change', this.name);
        }
    }
}
</script>

<style>
button.pane-button  {
  transition: opacity 0.1s linear;
}

button.pane-button.active {
    z-index: 100;
    position: relative;

    opacity: 0;
    height: 0;  /* to prevent hiding other elements */
    padding: 0; /* to prevent hiding other elements */
    transform: scale(3) translate(100px, 0);
    transition: opacity 0.3s linear, transform 0.3s ease-in;
}
</style>
