<template>
<div class="material-card-1" style="margin-bottom: 8px">
    <div class="panel-heading" style="overflow:hidden">
        <h3 style="margin-top: 8px; float: left"><img width="32" height="32" v-bind:src="'data:image/png;base64,' + worker.identicon.toString()"/> {{worker.wtype}} <span style="font-size:70%; color: lightgray">{{worker.addr}}</span></h3>
        <button style="float:right" v-on:click='update_info' class="btn btn-default" title="refresh now">
          <span class="glyphicon glyphicon-refresh"></span>
        </button>
    </div>
    <div class="panel-body row">
        <div class="col-md-2">
          <div v-bind:class="worker.power.classes">
            <span class="glyphicon glyphicon-off"></span> {{worker.power.desc}}
          </div>
          <b>{{desc_plan}}</b>
        </div>

        <div class="col-md-4">
          <div v-if="worker.wtype === 'builder'">
            <button v-on:click='extend()' class="btn btn-default" title="Attach new rail and screw it. Run from origin.">
              Extend
            </button>
            <button v-on:click='shorten()' class="btn btn-default" title="Remove rail and screw. Run from origin.">
              Shorten
            </button>
          </div>
          <div v-if="worker.wtype === 'feeder'">
          </div>

          <div v-if="show_raw">
            <!-- Top Panel -->
            <div v-if="worker.wtype === 'feeder'" style="overflow:hidden">
              <h4>Gripper</h4>
              <button v-on:click="command('e1000v80V70,v0')" class="btn btn-default">
                V Origin
              </button>
              <button v-on:click="command('e150v80,1v0')" class="btn btn-default">
                V<span class="glyphicon glyphicon-arrow-up"></span>
              </button>
              <button v-on:click="command('e150v-80,1v0')" class="btn btn-default">
                V<span class="glyphicon glyphicon-arrow-down"></span>
              </button>
              <br/>

              <button v-on:click="command('e1c11')" class="btn btn-default">
                open
              </button>
              <button v-on:click="command('e1c20')" class="btn btn-default">
                close
              </button>
              <br/>

              <button v-on:click="command('e500r30')" class="btn btn-default">
                Rvert
              </button>
              <button v-on:click="command('e500r18')" class="btn btn-default">
                Rhorz
              </button>

              <h4>Stock</h4>
              <button v-on:click="command('e1l23')" class="btn btn-default">
                lock
              </button>
              <button v-on:click="command('e1l20')" class="btn btn-default">
                unlock
              </button>

            </div>
            <div v-if="worker.wtype === 'builder'" style="overflow:hidden">
                <div style="float:left">
                    <h4>D</h4>
                    <button v-on:click="command('e400b10')" class="btn btn-default" title="update">
                        <span class="glyphicon glyphicon-arrow-up"></span>
                    </button>
                    <br/>

                    <button v-on:click="command('e400b20')" class="btn btn-default" title="update">
                      <span class="glyphicon glyphicon-arrow-down"></span>
                    </button> {{worker.out[0][1]}}
                    <br/>
                    <button v-on:click="command('e400b22')" class="btn btn-warning" title="update">
                      <span class="glyphicon glyphicon-arrow-down"></span>
                    </button>
                </div>
                <div style="float:left">
                    <h4>SCR</h4>
                    <button v-on:click="command('e300a11')" class="btn btn-default" title="update">
                      <span class="glyphicon glyphicon-arrow-up"></span>
                    </button>
                    <br/>
                    <button v-on:click="command('e300a29')" class="btn btn-default" title="update">
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
            <div v-if="worker.wtype === 'builder'">
                <h4>T</h4>
                <button v-on:click="command('e500t-70T30,1!t0')" class="btn btn-primary" title="Find origin forward(500ms)">
                  <span class="glyphicon glyphicon-arrow-up"></span>
                </button>
                <button v-on:click="command('e100t-70,1!t0')" class="btn btn-default" title="go forward for a moment">
                  <span class="glyphicon glyphicon-arrow-up"></span>
                </button>
                {{worker.out[1][0]}}
                <br/>
                <button v-on:click="command('e500t70T30,1!t0')" class="btn btn-primary" title="Find origin baclward(500ms)">
                  <span class="glyphicon glyphicon-arrow-down"></span>
                </button>
                <button v-on:click="command('e100t70,1!t0')" class="btn btn-default" title="go backward for a moment">
                  <span class="glyphicon glyphicon-arrow-down"></span>
                </button>
                O:{{worker.out[1][1]}}

                <line-chart :width="300" :height="200" :data="worker.readings"></line-chart>
            </div>
          </div>
        </div>

        <div class="col-md-3">
          <table class="table">
           <tbody style="max-height: 250px; overflow-y: auto; display: block">
             <tr v-for="msg in worker.messages"
                  v-bind:class="{'success': msg.status == 'command', 'default': msg.status == 'known', 'warning': msg.status == 'unknown', 'danger': msg.status == 'corrupt'}" v-bind:title="msg.desc">
               <td>{{msg.timestamp}}</td>
               <td>{{msg.head}}
                 <div v-if="msg.status != 'known' && msg.status != 'command'">
                   <pre>{{msg.desc}}</pre>
                 </div>
               </td>
             </tr>
           </tbody>
          </table>
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
          this.worker.messages.unshift({
            status: 'command',
            timestamp: null,
            head: msg,
            desc: msg,
          });
          send_command(msg, this.worker.addr);
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
    },
    computed: {
        readings() {
            // return [1, 3,2];
            return this.worker.readings.concat([]); // copy
        },
        desc_plan() {
          // if (this.worker.wtype == '')
          return 'Idle';
        }
    }
}
</script>

<style>
.material-card-1 {
  background-color: #333;
  border-radius: 3px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
}
</style>
