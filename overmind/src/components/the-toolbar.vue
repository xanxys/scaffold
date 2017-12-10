<template>
    <nav class="navbar navbar-default" style="background-color: #222; margin-bottom: 0px">
        <div class="container-fluid">
            <div class="navbar-header" >
                <a class="navbar-brand" href="#">S60C</a>
            </div>
            <div class="collapse navbar-collapse" id="nav">
                <ul class="nav navbar-nav">
                    <li id="conn-status"><p class="navbar-text"><span :class="status_class"><i :class="{'text-muted': isFlashing}" class="material-icons">wifi_tethering</i>{{status}}</span> {{path}}</p></li>

                    <li><a href="#" @click="refreshNow" title="Refresh now"><span style="padding-top: 7px" class="glyphicon glyphicon-refresh"></span></a></li>
                    <li class="dropdown" style="margin-left:-10px; padding-top:9px">
                        <a class="dropdown-toggle" data-toggle="dropdown" role="button">{{refresh_ago}}<span class="caret"></span></a>
                        <ul class="dropdown-menu">
                            <li><a href="#" @click="setRefPeriod(5)">Refresh every 5sec</a></li>
                            <li><a href="#" @click="setRefPeriod(15)">Refresh every 15sec</a></li>
                            <li role="separator" class="divider"></li>
                            <li><a href="#" @click="setRefPeriod(null)">Disable Auto-refresh</a></li>
                        </ul>
                    </li>
                </ul>
            </div>
        </div>
    </nav>
</template>

<script>
export default {
    props: ['bridge'],
    data() {
        return {
            refNow: new Date(),
            lastRefresh: null,
            period: 15
        };
    },
    created() {
        this.timer = setInterval(() => {
            this.refNow = new Date();
            if (this.lastRefresh == null || (this.period != null && this.refNow - this.lastRefresh > this.period * 1e3)) {
                this.refreshNow();
            }
        }, 1000);
    },
    computed: {
        refresh_ago() {
            let autoref = (this.period !== null) ? `(auto: every ${this.period} sec)` : '(auto disabled)'
            if (this.lastRefresh !== null) {
                let deltaSec = Math.floor(Math.max(0, this.refNow - this.lastRefresh) * 1e-3);
                return `Last refreshed ${deltaSec} sec ago ${autoref}`;
            } else {
                return `Never refreshed ${autoref}`;
            }
        },
        status() {
            if (this.bridge.isOpen) {
                return 'connected';
            } else {
                return 'fake replay'
            }
        },
        status_class() {
            if (this.bridge.isOpen) {
                return 'text-success';
            } else {
                return 'text-muted';
            }
        },
        path() {
            return this.bridge.path;
        },
        isFlashing() {
            const now = new Date();
            return (this.bridge.latestPacket && now > this.bridge.latestPacket && now - this.bridge.latestPacket < 0.1);
        }
    },
    methods: {
        refreshNow() {
            this.bridge.sendCommand('p');
            this.lastRefresh = new Date();
        },
        setRefPeriod(period) {
            this.period = period;
        }
    }
}
</script>

<style>
</style>
