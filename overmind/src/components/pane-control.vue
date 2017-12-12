<template>
<h2 style="margin-top:0">{{name}}
  <button :class="{active: active === name}" @click="activate" class="pane-button btn btn-default" style="float: right" title="Expand details"><span class="glyphicon glyphicon-chevron-right"></span></button>
</h2>
</template>

<script>
var $ = require('jquery');

export default {
    props: ['name', 'active'],
    data() {
        return {};
    },
    methods: {
        activate() {
            ['plan', 'workers'].forEach(name => $('#' + name).parent().removeClass('tab-selected').addClass('tab-unselected'));
            $('#' + this.name.toLowerCase()).parent().removeClass('tab-unselected').addClass('tab-selected');
            this.$emit('change', this.name);
        }
    }
}
</script>

<style>
button.pane-button  {
}

button.pane-button.active {
    display: none;
}
</style>
