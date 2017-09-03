<template>
<div class="panel panel-info">
    <div class="panel-heading">
        <h2 class="panel-title"><img width="50" height="50" v-bind:src="'data:image/png;base64,' + worker.identicon.toString()"/>{{worker.wtype}} <span style="font-size:80%; color: lightgray">{{worker.addr}}</span></h2>
        <button v-on:click='update_info' class="btn btn-default" title="refresh now">
          <span class="glyphicon glyphicon-refresh"></span>
        </button>
    </div>
    <div class="panel-body row">
        <div class="col-md-2">
          <div v-bind:class="worker.power.classes">
            <span class="glyphicon glyphicon-off"></span> {{worker.power.desc}}
          </div>
          Carrying: RS, screw
        </div>

        <div class="col-md-4">
          <button v-on:click='extend()' class="btn btn-default" title="Attach new rail and screw it. Run from origin.">
            Extend
          </button>
          <button v-on:click='shorten()' class="btn btn-default" title="Remove rail and screw. Run from origin.">
            Shorten
          </button>

          <div v-if="show_raw">
            <!-- Top Panel -->
            <div style="overflow:hidden">
                <div style="float:left">
                    <h4>D</h4>
                    <button v-on:click='d_up()' class="btn btn-default" title="update">
                        <span class="glyphicon glyphicon-arrow-up"></span>
                    </button>
                    <br/>

                    <button v-on:click='d_down()' class="btn btn-default" title="update">
                      <span class="glyphicon glyphicon-arrow-down"></span>
                    </button> {{worker.out[0][1]}}
                    <br/>
                    <button v-on:click='d_downdown()' class="btn btn-warning" title="update">
                      <span class="glyphicon glyphicon-arrow-down"></span>
                    </button>
                </div>
                <div style="float:left">
                    <h4>SCR</h4>
                    <button v-on:click='scr_up()' class="btn btn-default" title="update">
                      <span class="glyphicon glyphicon-arrow-up"></span>
                    </button>
                    <br/>
                    <button v-on:click='scr_down()' class="btn btn-default" title="update">
                      <span class="glyphicon glyphicon-arrow-down"></span>
                    </button> {{worker.out[0][0]}}
                </div>
                <div style="float:left">
                    <h4>S</h4> {{worker.out[1][2]}}
                    <br/>
                    <button v-on:click="command('e1s100')" class="btn btn-default" title="unfasten screw">
                      unlock
                    </button>
                    <button v-on:click="command('e1s0')" class="btn btn-default" title="stop screw">
                      <span class="glyphicon glyphicon-stop"></span>
                    </button>
                    <button v-on:click="command('e1s-100')" class="btn btn-default" title="fasten screw">
                      lock
                    </button>
                </div>
            </div>

            <!-- Train & Sensor readings -->
            <div>
                <h4>T</h4>
                <button v-on:click="command('e500t-70T30,1!t0')" class="btn btn-primary" title="Find origin forward(500ms)">
                  <span class="glyphicon glyphicon-arrow-up"></span>
                </button>
                <button v-on:click='t_step_f()' class="btn btn-default" title="go forward for a moment">
                  <span class="glyphicon glyphicon-arrow-up"></span>
                </button>
                {{worker.out[1][0]}}
                <br/>
                <button v-on:click="command('e500t70T30,1!t0')" class="btn btn-primary" title="Find origin baclward(500ms)">
                  <span class="glyphicon glyphicon-arrow-down"></span>
                </button>
                <button v-on:click='t_step_b()' class="btn btn-default" title="go backward for a moment">
                  <span class="glyphicon glyphicon-arrow-down"></span>
                </button>
                O:{{worker.out[1][1]}}

                <line-chart :width="300" :height="200" :data="worker.readings"></line-chart>
            </div>
          </div>
        </div>

        <div class="col-md-2">
          <div class="panel" v-for="msg in worker.messages" v-bind:class="{'panel-default': msg.status == 'known', 'panel-warning': msg.status == 'unknown', 'panel-danger': msg.status == 'corrupt'}" v-bind:title="msg.desc">
            <div class="panel-heading">
                {{msg.timestamp}}
                <h3 class="panel-title">{{msg.head}}</h3>
            </div>
            <div v-if="msg.status != 'known'">
                <pre>{{msg.desc}}</pre>
            </div>
          </div>
        </div>
    </div>
</div>
</template>

<script>
export default {
    props: ['worker', 'show_raw'],
    data() {
        return {}
    },
    methods: {
        command(msg) {
            bridge.send_command(msg);
        },

        update_info() {
            this.command('p');
        },

        extend() {
            this.command('e500a29,500t-60,300b22s-20,5000t50s-100,400b10,500s0t70T30,300t0a11');
        },

        shorten() {
            this.command('e500a29,800t-70,300b21,3000s70b22t-30,600b10s0t60T30,500t0a11');
        },

        scr_up() {
            this.command('e300a11');
        },

        scr_down() {
            this.command('e300a29');
        },

        d_up() {
            this.command('e400b10');
        },

        d_down() {
            this.command('e400b20');
        },
        d_downdown() {
            this.command('e400b22');
        },
        t_step_f() {
            this.command('e100t-70,1!t0');
        },

        t_step_b() {
            this.command('e100t70,1!t0');
        },
    },
    computed: {
        readings() {
            // return [1, 3,2];
            return this.worker.readings.concat([]); // copy
        }
    }
}
</script>

<style>

</style>
