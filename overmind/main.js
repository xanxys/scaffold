const PRIM_COLOR = 0x3498db;
const PRIM_COLOR_HOVER = 0x286090;

import $ from 'jquery';

global.jQuery = $;
require('bootstrap');

import _ from 'underscore';
import Vue from 'vue/dist/vue.js';
import {
    Line
} from 'vue-chartjs';

import PaneControl from './pane-control.vue';
import Bridge from './comm.js';
import md5 from 'md5';
import Identicon from 'identicon.js';


Vue.component('pane-control', PaneControl);

Vue.component('line-chart', {
    extends: Line,
    props: ['data', 'options'],
    mounted() {
        this.render();
    },
    methods: {
        render() {
            let xydata = _.map(this.data, (v, ix) => ({
                x: ix,
                y: v
            }));
            this.renderChart({
                labels: _.map(this.data, (v, ix) => ix),
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

const bridge = new Bridge(packet => {
    flash_status();
    if (packet.datagram !== null) {
        worker_pool.handle_datagram(packet);
    }
});

function flash_status() {
    let el = $('#conn-icon');
    el.addClass('text-muted');
    setTimeout(() => {
        el.removeClass('text-muted');
    }, 100);
}

// Scaffold inferred / target world model.
// Assumes z=0 is floor.
class ScaffoldModel {

    constructor() {
        const unit = 0.06;

        this.rails = [{
            type: "RS",
            center: new THREE.Vector3(0, 0, 0.03),
            ori: new THREE.Vector3(0, 0, 1),
            id: 0,
            support: true,
        }, {
            type: "RS",
            center: new THREE.Vector3(0, unit, 0.03),
            ori: new THREE.Vector3(0, 0, 1),
            id: 1,
            support: false,
        }];
    }

    get_worker_pos() {}

    get_points() {
        return [{
            open: true,
            pos: new THREE.Vector3(0, 0, 0.03),
            normal: new THREE.Vector3(0, 0, 1)
        }, {
            open: true,
            pos: new THREE.Vector3(0, 0.06 * 2, 0.03),
            normal: new THREE.Vector3(0, 0, 1)
        }];
    }
}


class WorkerPool {
    constructor() {
        this.workers = [];
        this.last_uninit = null;
    }

    handle_datagram(packet) {
        if (packet.src === 0) {
            this.last_uninit = new Date();
            return;
        }

        let worker = this.workers.find(w => w.addr === packet.src);
        if (worker !== undefined) {
            this.handle_datagram_in_worker(worker, packet);
        } else {
            let worker = {
                addr: packet.src,
                wtype: null,
                identicon: new Identicon(md5(packet.src), {saturation: 0.5, background: [200, 200, 200, 255], size: 50}),
                messages: [],
                out: [],
                power: {},
                readings: [],
            };
            this.handle_datagram_in_worker(worker, packet);
            this.workers.push(worker);
        }
    }

    handle_datagram_in_worker(worker, packet) {
        console.log(packet);
        let message = {
            status: 'known', // known, unknown, corrupt
            timestamp: packet.src_ts / 1e3,
        };
        if (packet.data === null) {
            message.status = 'corrupt';
            message.head = 'CORRUPT JSON';
            message.desc = packet.datagram;
        } else if (packet.data.ty === undefined) {
            message.status = 'corrupt';
            message.head = 'MISSING TYPE';
            message.desc = JSON.stringify(payload, null, 2);
        } else {
            let data = packet.data;
            message.head = data.ty;
            message.desc = JSON.stringify(data, null, 2);

            if (data.ty === 'STATUS') {
                worker.wtype = data.wtype;
                worker.out = data.out;
                let vcc = data.system['vcc/mV'];
                let bat = data.system['bat/mV'];
                if (vcc < bat) {
                    // Known power init failure mode.
                    worker.power.classes = {
                        "bg-danger": true
                    };
                } else if (bat < 3300) {
                    worker.power.classes = {
                        "bg-warning": true
                    };
                } else {
                    worker.power.classes = {
                        "bg-primary": true
                    };
                }
                worker.power.desc = bat + 'mV (Vcc=' + vcc + 'mV)';
            } else if (data.ty === 'SENSOR_CACHE') {
                worker.readings = worker.readings.concat(data.val);
            } else {
                message.status = 'unknown';
                message.head = `?${data.ty}?`;
            }
        }
        worker.messages.unshift(message);
    }
}

const worker_pool = new WorkerPool();

// ViewModel / View.
// Since we update all frame all the time, we don't care about MVVM framework / bindings etc.
class View3DClient {
    constructor(model) {
        var _this = this;
        this.model = model;

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 7);
        this.camera.up = new THREE.Vector3(0, 0, 1);
        this.camera.position.x = 0.3;
        this.camera.position.y = 0.3;
        this.camera.position.z = 0.3;
        this.camera.lookAt(new THREE.Vector3(0, 0, 0));

        this.scene = new THREE.Scene();

        let sunlight = new THREE.DirectionalLight(0xcccccc);
        sunlight.position.set(0, 0, 1).normalize();
        this.scene.add(sunlight);

        this.scene.add(new THREE.AmbientLight(0x333333));

        let bg = new THREE.Mesh(
            new THREE.IcosahedronGeometry(5, 1),
            new THREE.MeshBasicMaterial({
                wireframe: true,
                color: '#ccc'
            }));
        this.scene.add(bg);

        this.texture_loader = new THREE.TextureLoader();
        this.stl_loader = new THREE.STLLoader();

        // Model derived things.
        this.add_table();

        this.cad_models = {};
        let load_state = {
            total: 4,
            loaded: 0
        };
        _.each(['S60C-T', 'S60C-RS', 'S60C-RR', 'S60C-RH'], (name) => {
            _this.stl_loader.load('./models/' + name + '.stl', (geom) => {
                geom.scale(1e-3, 1e-3, 1e-3);
                this.cad_models[name] = geom;
                load_state.loaded++;
                if (load_state.loaded === load_state.total) {
                    this.regen_scaffold_view();
                }
            });
        });

        this.scaffold_view = new THREE.Object3D();
        this.scene.add(this.scaffold_view);

        // start canvas
        this.renderer = new THREE.WebGLRenderer({
            antialias: true
        });

        this.renderer.setSize(800, 600);
        this.renderer.setClearColor('#aac');
        $('#viewport').width(800);
        $('#viewport').height(600);
        $('#viewport').append(this.renderer.domElement);

        this.controls = new THREE.TrackballControls(this.camera, this.renderer.domElement);
        this.controls.noZoom = false;
        this.controls.noPan = false;
        this.controls.zoomSpeed = 0.1;
        this.controls.maxDistance = 2;

        $(window).resize(() => {
            _this.update_projection();
        });

        let add_rs = false;

        let prev_hover_object = null;
        $('#viewport').mousemove(ev => {
            let ev_pos_normalized = new THREE.Vector2(
                ev.offsetX / $('#viewport').width() * 2 - 1, -(ev.offsetY / $('#viewport').height() * 2 - 1));

            let raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(ev_pos_normalized, this.camera);
            let isects = raycaster.intersectObject(this.scene, true);
            let curr_hover_object = null;
            if (isects.length > 0 && isects[0].object.name === 'ui') {
                curr_hover_object = isects[0].object;
            }

            if (curr_hover_object !== prev_hover_object) {
                if (curr_hover_object !== null) {
                    // on enter
                    curr_hover_object.material.color.set(PRIM_COLOR_HOVER);
                } else {
                    // on leave
                    prev_hover_object.material.color.set(PRIM_COLOR);
                }
            }
            prev_hover_object = curr_hover_object;
        });

        $('#viewport').click(ev => {
            let ev_pos_normalized = new THREE.Vector2(
                ev.offsetX / $('#viewport').width() * 2 - 1, -(ev.offsetY / $('#viewport').height() * 2 - 1));

            let raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(ev_pos_normalized, this.camera);
            let isects = raycaster.intersectObject(this.scene, true);
            if (isects.length === 0 || isects[0].object.name !== 'ui') {
                return;
            }

            let obj = isects[0].object;

            if (add_rs) {
                // obj.
                _this.model.rails.push({
                    type: "RS",
                    center: new THREE.Vector3(0, 0.12, 0.03),
                    ori: new THREE.Vector3(0, 0, 1),
                    id: 2,
                });
                _this.regen_scaffold_view();
            }
            add_rs = false;
        });

        $('#add_rs').click(ev => {
            add_rs = true;
        });

        this.update_projection();
    }

    regen_scaffold_view() {
        this.scaffold_view.remove(this.scaffold_view.children);

        _.each(this.model.rails, rail => {
            let mesh = new THREE.Mesh(this.cad_models['S60C-' + rail.type]);
            mesh.material = new THREE.MeshLambertMaterial({});
            mesh.position.copy(rail.center);
            this.scene.add(mesh);
        });
        _.each(this.model.workers, worker => {
            let mesh = new THREE.Mesh(this.cad_models['S60C-T']);
            mesh.material = new THREE.MeshLambertMaterial({
                color: PRIM_COLOR
            });
            mesh.position.z = this.model.zofs;
            this.scene.add(mesh);
        });

        this.cache_point_geom = new THREE.SphereBufferGeometry(0.006, 16, 12);
        _.each(this.model.get_points(), point => {
            if (!point.open) {
                return;
            }
            let mesh = new THREE.Mesh();
            mesh.name = 'ui';
            mesh.userData = {};
            mesh.geometry = this.cache_point_geom;
            mesh.material = new THREE.MeshBasicMaterial({
                color: PRIM_COLOR,
                opacity: 0.5,
                transparent: true,
            });
            mesh.position.copy(point.pos);
            this.scene.add(mesh);
        });
    }

    add_table() {
        let table_material = new THREE.MeshLambertMaterial({
            map: this.texture_loader.load('texture/wood.jpg')
        });

        table_material.map.wrapS = table_material.map.wrapT = THREE.RepeatWrapping;
        table_material.map.repeat.set(2, 2);

        const table_thickness = 0.03;
        let table = new THREE.Mesh(new THREE.BoxGeometry(1, 1, table_thickness), table_material);
        table.position.z = -table_thickness / 2;
        table.receiveShadow = true;
        this.scene.add(table);
    }

    update_projection() {
        //this.renderer.setSize($('#viewport').width(), $('#viewport').height());
        this.camera.aspect = 800 / 600; // $('#viewport').width() / $('#viewport').height();
        this.camera.updateProjectionMatrix();
    }

    /* UI Utils */
    _animate() {
        // note: three.js includes requestAnimationFrame shim
        if (!this.animating) {
            return;
        }
        requestAnimationFrame(() => this._animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    start() {
        this.animating = true;
        this._animate();
    }

    stop() {
        this.animating = false;
    }
}

let model = new ScaffoldModel();
let client = new View3DClient(model);
client.start();

new Vue({
    el: '#tab_workers',
    data: worker_pool,
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
            return this.workers[0].readings.concat([]); // copy
        }
    }
});


new Vue({
    el: '#conn-status',
    data: {
        port: bridge,
    },
    computed: {
        status() {
            if (this.port.isOpen) {
                return 'connected';
            } else {
                return 'cutoff'
            }
        },
        status_class() {
            if (this.port.isOpen) {
                return 'text-success';
            } else {
                return 'text-muted';
            }
        },
        path() {
            return this.port.path;
        }
    }
});

new Vue({
    el: '#sidepanel',
    data: {
        active_pane: "Plan",
        worker_pool: worker_pool,
        unit_ref_now: new Date(),
    },
    created() {
      this.timer = setInterval(() => this.unit_ref_now = new Date(), 800);
    },
    computed: {
      has_uninit() {
        return this.worker_pool.last_uninit !== null;
      },
      uninit_desc() {
        if (this.worker_pool.last_uninit === null) {
          return "All workers have good addresses so far.";
        } else {
          let stale = this.unit_ref_now - this.worker_pool.last_uninit;
          return "SrcAddr=0 observed ${staleness*1e-3} seconds ago.";
        }
      },
    },
    methods: {
        update_pane(new_active) {
            if (this.active_pane === 'Plan') {
                $('#tab_plan').hide();
                client.stop();
            } else if (this.active_pane === 'Workers') {
                $('#tab_workers').hide();
            }

            this.active_pane = new_active;

            if (new_active === 'Plan') {
                $('#tab_plan').show();
                client.start();
            } else if (this.active_pane === 'Workers') {
                $('#tab_workers').show();
            }
        }
    }
});

global.send_command = bridge.send_command;

bridge.send_command('p');
