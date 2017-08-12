const PRIM_COLOR = 0x3498db;
const PRIM_COLOR_HOVER = 0x286090;

const $ = require('jquery');
const _ = require('underscore');
const SerialPort = require('serialport');

let port_model = {isOpen: false};

// We need port_model indirection to notify changes to vue.js
const sp_path = '/dev/ttyUSB0';
port_model.path = sp_path;
let port = new SerialPort(sp_path, {baudRate: 115200}, err => {
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
    let payload_hex = data.slice(':7801'.length, -2 /* csum */);
    let payload = decode_hex(payload_hex);
    model.workers[0].messages.unshift(payload);
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
  let twelite_command =
    [0x78, 0x01].concat(_.map(command, ch => ch.charCodeAt(0)));

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
            human_id: 1,
            hw_id: "a343fd",
            messages: [],
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
            mesh.userData = {
            };
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
    animate() {
        // note: three.js includes requestAnimationFrame shim
        let _this = this;
        requestAnimationFrame(function() {
            _this.animate();
        });
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

let model = new ScaffoldModel();
let client = new View3DClient(model);
client.animate();

new Vue({
    el: '#workers',
    data: model,
    methods: {
      update_info() {
        send_command('p');
      },

      scr_up() {
        send_command('e1b250');
        send_command('e1a50');
      },

      scr_down() {
        send_command('e1b20');
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
