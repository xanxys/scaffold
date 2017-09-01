const PRIM_COLOR = 0x3498db;
const PRIM_COLOR_HOVER = 0x286090;

import $ from 'jquery';
import _ from 'underscore';
import Vue from 'vue/dist/vue.js';
import {
    Line
} from 'vue-chartjs';

import PaneControl from './pane-control.vue';

// Need to use window.require: https://github.com/railsware/bozon/issues/40
const SerialPort = window.require('serialport');

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

let port_model = {
    isOpen: false
};

// We need port_model indirection to notify changes to vue.js
const sp_path = '/dev/ttyUSB0';
port_model.path = sp_path;
let port = new SerialPort(sp_path, {
    baudRate: 115200
}, err => {
    if (err !== null) {
        console.log('serial port error', err);
    } else {
        console.log('serial port ok');
        port_model.isOpen = true;
    }
});
const parser = new SerialPort.parsers.Readline();
port.pipe(parser);
parser.on('data', data => {
    data = data.trim();
    flash_status();
    if (data.startsWith(':7801')) {
        let payload_hex = data.slice(':7801'.length, -2 /* csum */ );
        let payload = decode_hex(payload_hex);
        let payload_json = null;
        try {
            payload_json = JSON.parse(payload);
        } catch (e) {
            model.workers[0].messages.unshift('CORRUPT' + payload);
            return;
        }
        if (payload_json !== null) {
            model.handle_payload(payload_json);
        }
    }
});

function flash_status() {
    let el = $('#conn-icon');
    el.addClass('text-muted');
    setTimeout(() => {
        el.removeClass('text-muted');
    }, 100);
}

function decode_hex(hex) {
    let result = '';
    for (let ix = 0; ix < hex.length; ix += 2) {
        result += String.fromCharCode(parseInt(hex.substr(ix, 2), 16));
    }
    return result;
}

function encode_hex(bytes) {
    return _.map(bytes, b => (b >> 4).toString(16) + (b & 0xf).toString(16)).join('').toUpperCase();
}

function send_command(command) {
    let twelite_command = [0x78, 0x01].concat(_.map(command, ch => ch.charCodeAt(0)));

    let final_command = ':' + encode_hex(twelite_command) + 'X\r\n';
    console.log('send', final_command);
    port.write(final_command);
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

        this.workers = [{
            type: 'builder',
            loco: {
                sensor: 123,
                on_rail: 0,
                pos: 0.3,
            },
            builder: {
                dump: 'RH',
                driver: false,
            },
            out: [
                [0, 0],
                [0, 0, 0]
            ],
            human_id: 1,
            hw_id: "a343fd",
            messages: [],
            readings: [],
            power: {}
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

    handle_payload(payload) {
        let worker = this.workers[0];

        let handled = true;
        if (payload.ty === 'STATUS') {
            worker.out = payload.out;
            let vcc = payload.system['vcc/mV'];
            let bat = payload.system['bat/mV'];
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
        } else if (payload.ty === 'SENSOR_CACHE') {
            worker.readings = this.workers[0].readings.concat(payload.val);
        } else {
            handled = false;
        }
        worker.messages.unshift({
            payload: payload,
            msg: JSON.stringify(payload, null, 2),
            ok: handled
        });
    }

}

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
    data: model,
    methods: {
        command(msg) {
            send_command(msg);
        },

        update_info() {
            send_command('p');
        },

        extend() {
            send_command('e500a29,500t-60,300b22s-20,5000t50s-100,400b10,500s0t70T30,300t0a11');
        },

        shorten() {
            send_command('e500a29,800t-70,300b21,3000s70b22t-30,600b10s0t60T30,500t0a11');
        },

        scr_up() {
            send_command('e300a11');
        },

        scr_down() {
            send_command('e300a29');
        },

        d_up() {
            send_command('e400b10');
        },

        d_down() {
            send_command('e400b20');
        },
        d_downdown() {
            send_command('e400b22');
        },
        t_step_f() {
            send_command('e100t-70,1!t0');
        },

        t_step_b() {
            send_command('e100t70,1!t0');
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
        port: port_model,
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
        active_pane: "Plan"
    },
    methods: {
        update_pane(new_active) {
            if (this.active_pane === 'Plan') {
              $('#tab_plan').hide();
              client.stop();
            } else if (this.active_pane === 'Nodes') {
              $('#tab_workers').hide();
            }

            this.active_pane = new_active;

            if (new_active === 'Plan') {
                $('#tab_plan').show();
                client.start();
            } else if (this.active_pane === 'Nodes') {
                $('#tab_workers').show();
            }
        }
    }
});
