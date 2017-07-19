const prim_color = 0x3498db;

// Scaffold inferred / target world model.
// Assumes z=0 is floor.
class ScaffoldModel {
    constructor() {
        const unit = 0.06;
        this.zofs = 0.03;

        this.rails = [{
            type: "RS",
            center: new THREE.Vector3(0, 0, 0),
            ori: new THREE.Vector3(0, 0, 1),
            id: 0,
        }, {
            type: "RS",
            center: new THREE.Vector3(0, unit, 0),
            ori: new THREE.Vector3(0, 0, 1),
            id: 1,
        }];

        this.workers = [{
            type: 'builder',
            locom: {
                sensor: 123,
                on_rail: 0,
                pos: 0.3,
            },
            builder: {
                dump: 'RH',
                driver: false,
            }
        }];
    }
}

// ViewModel / View.
// Since we update all frame all the time, we don't care about MVVM framework / bindings etc.
class View3DClient {
    // TODO: Might be better to use CGS unit system instead of SI, since
    // 1. physijs doc is poor
    // 2. official examples assume cgs-like unit system, and exhibts slightly stable behavior
    constructor() {
        var _this = this;

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
        this.model = new ScaffoldModel();
        this.add_table();

        this.cad_models = {};
        let load_state = {total: 4, loaded: 0};
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
        $('#viewport').append(this.renderer.domElement);

        this.controls = new THREE.TrackballControls(this.camera, this.renderer.domElement);
        this.controls.noZoom = false;
        this.controls.noPan = false;
        this.controls.zoomSpeed = 0.1;
        this.controls.maxDistance = 2;

        $(window).resize(() => {
            _this.update_projection();
        });

        this.update_projection();
    }

    regen_scaffold_view() {
        this.scaffold_view.remove(this.scaffold_view.children);

        _.each(this.model.rails, rail => {
            let mesh = new THREE.Mesh(this.cad_models['S60C-' + rail.type]);
            mesh.material = new THREE.MeshLambertMaterial({});
            mesh.position.copy(rail.center.clone().add(new THREE.Vector3(0, 0, this.model.zofs)));
            this.scene.add(mesh);
        });
        _.each(this.model.workers, worker => {
            let mesh = new THREE.Mesh(this.cad_models['S60C-T']);
            mesh.material = new THREE.MeshLambertMaterial({
                color: prim_color
            });
            mesh.position.z = this.model.zofs;
            this.scene.add(mesh);
        });
    }

    calc_power_net() {
        let cubes = [];
        _.each(this.scene.children, (elem) => {
            if (elem.type !== "Mesh" || elem.userData["cube"] !== true) {
                return;
            }
            cubes.push(new ImmutableCube(elem));
        });
        let edges = [];
        _.each(cubes, cube => edges.push.apply(edges, cube.get_edges()));

        // Calculate contacts.
        let pairs = [];
        _.each(edges, (e0, i0) => {
            _.each(edges.slice(i0 + 1, edges.length), (e1, i1) => {
                if (e0.touches(e1)) {
                    pairs.push([e0, e1]);
                }
            });
        });
        console.log("edge-edge contacts", pairs.length);

        // Add visualizing objects.

        _.each(pairs, pair => {
            this.add_ephemeral_edge_highlight(pair[0]);
            this.add_ephemeral_edge_highlight(pair[1]);
        });

        // _.each(edges, e => this.add_ephemeral_edge_highlight(e));

    }

    add_ephemeral_edge_highlight(edge) {
        let mat = new THREE.LineBasicMaterial({
            color: "hotpink",
            linewidth: 5,
        });

        let geom = new THREE.Geometry();
        geom.vertices.push(edge.p0);
        geom.vertices.push(edge.p1);

        let obj = new THREE.Line(geom, mat);
        this.scene.add(obj);

        let t0 = Date.now();
        let iv_id = window.setInterval(() => {
            let age_sec = (Date.now() - t0) * 1e-3;
            if (age_sec < 10) {
                mat.color.multiplyScalar(0.9);
            } else {
                this.scene.remove(obj);
                window.clearInterval(iv_id);
            }
        }, 500);
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

let client = new View3DClient();
client.animate();
