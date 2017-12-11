<template>
<div class="material-card-1" style="margin-bottom: 8px">
    <div class="panel-heading" style="overflow:hidden">
        <h3 style="margin-top: 8px; float: left"><img width="32" height="32" :src="'data:image/png;base64,' + worker.identicon.toString()"/> {{worker.wtype}} <span style="font-size:70%; color: lightgray">{{worker.addr}}</span></h3>
        <button style="float:right" @click='update_info' class="btn btn-default" title="refresh now">
          <span class="glyphicon glyphicon-refresh"></span>
        </button>
    </div>
    <div class="panel-body row">
        <div class="col-md-2">
          <div :class="worker.power.classes">
            <span class="glyphicon glyphicon-off"></span> {{worker.power.desc}}
          </div>
          <b>{{desc_plan}}</b>
        </div>

        <div class="col-md-6">
          <input size="30" v-model="command_palette" @keyup.enter="send_palette"/><br/>
          <br/>
          <div>
            <button class="btn-small btn-default" @click="sortByUsage()"><i class="material-icons">sort</i> Sort by usage</button>
            <div v-for="ch in filteredCommands">
              <button class="btn-small btn-start" @click="runCommandFromHistory(ch)"><i class="material-icons">play_arrow</i></button>
              <input size="12" v-model="ch.memo" @keyup.enter="updateMemo(ch)"/> {{ch.seq}} |
              {{ch.used}} used
              <i class="material-icons" @click="deleteCommand(ch)">remove_circle_outline</i>
            </div>
          </div>
          <br/>

          <div v-if="show_raw">
            <!-- Sensor readings -->
            <div v-if="worker.wtype === 'TB'">
                <line-chart :width="300" :height="200" :data="worker.readings"/>
            </div>
          </div>
        </div>

        <div class="col-md-3">
          <table class="table">
           <tbody style="max-height: 250px; overflow-y: auto; display: block">
             <tr v-for="msg in worker.messages"
                  :key="msg.timestamp"
                  :class="{'success': msg.status == 'command', 'default': msg.status == 'known', 'warning': msg.status == 'unknown', 'danger': msg.status == 'corrupt'}" :title="msg.desc">
               <td>{{msg.timestamp === null ? 'N/A' : msg.timestamp.toFixed(3)}}</td>
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
import Vue from 'vue';
import {Line} from 'vue-chartjs';
import {CommandHistory} from '../command-history';

Vue.component('line-chart', {
    extends: Line,
    props: ['data', 'options'],
    mounted() {
        this.render();
    },
    methods: {
        render() {
            let xydata = this.data.map((v, ix) => ({
                x: ix,
                y: v
            }));
            this.renderChart({
                labels: this.data.map((v, ix) => ix),
                datasets: [{
                    label: "T",
                    data: xydata,
                    borderColor: "rgba(100,180,220,1)",
                    backgroundColor: "rgba(100,180,220,0.3)",
                }]
            }, {
                cubicInterpolationMode: "monotone",
                responsive: false,
                maintainAspectRatio: false
            });
            console.log(xydata);
        }
    },
    watch: {
        data: function() {
            this._chart.destroy();
            this.render();
        }
    }
});

export default {
    props: ['worker', 'show_raw'],
    data() {
      return {
        command_palette: "",
        commandHistory: new CommandHistory(),
      };
    },
    methods: {
        command(msg) {
          msg = msg.replace(' ', '');
          this.worker.messages.unshift({
            status: 'command',
            timestamp: null,
            head: msg,
            desc: msg,
          });
          // TODO: Better to intercept directly from Bridge.
          if (msg[0] === 'e') {
            this.commandHistory.notifyUsed(this.worker.wtype, msg.slice(1));
          }
          sendCommand(msg, this.worker.addr);
        },

        runCommandFromHistory(ch) {
          const command = 'e' + ch.seq;
          this.command(command);
          this.command_palette = command;
        },

        deleteCommand(ch) {
          this.commandHistory.delete(this.worker.wtype, ch.seq);
        },

        updateMemo(ch) {
          this.commandHistory.syncToFile();
        },

        sortByUsage() {
          this.commandHistory.sort(this.worker.wtype);
        },

        send_palette() {
          this.command(this.command_palette);
          this.command_palette = "";
        },

        update_info() {
            this.command('p');
        },
    },
    computed: {
        filteredCommands() {
          return this.commandHistory.getFor(this.worker.wtype);
        },
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
