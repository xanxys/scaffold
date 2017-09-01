<template>
<h2>{{name}}
  <button class="btn btn-default" style="float: right"><span class="glyphicon glyphicon-triangle-right"></span></button>
</h2>
</template>

<script>
export default {
    props: ['name'],
    data() {
        return {
            message: 'Hello World'
        }
    }
}
</script>
