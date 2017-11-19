
import _ from 'underscore';
import * as THREE from 'three';
import * as LoaderFactory from 'three-stl-loader';
import TrackballControls from 'three.trackball';
import {ScaffoldModel, S60RailStraight} from './scaffold-model';

let STLLoader: any = LoaderFactory(THREE);

const PRIM_COLOR = 0x3498db;
const PRIM_COLOR_HOVER = 0x286090;

// ViewModel / View.
// Since we update all frame all the time, we don't care about MVVM framework / bindings etc.
export default class View3DClient {
    model: ScaffoldModel;

    // Unabstracted jQuery UI things.
    windowElem: any;
    viewportElem: any;
    addRsElem: any;

    // internal control state.
    animating: boolean;

    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    scene: THREE.Scene;
    scaffold_view: any;
    controls: any;

    texture_loader: any;
    stl_loader: any;
    cad_models: any;
    cache_point_geom: THREE.BufferGeometry;

    constructor(model, windowElem, viewportElem, addRsElem) {
        this.model = model;
        this.windowElem = windowElem;
        this.viewportElem = viewportElem;
        this.addRsElem = addRsElem;

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
        this.stl_loader = new STLLoader();

        // Model derived things.
        this.add_table();

        this.cad_models = {};
        let load_state = {
            total: 4,
            loaded: 0
        };
        _.each(['S60C-T', 'S60C-RS', 'S60C-RR', 'S60C-RH', 'S60C-FDW-RS'], (name) => {
            this.stl_loader.load('./models/' + name + '.stl', (geom) => {
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
        this.viewportElem.width(800);
        this.viewportElem.height(600);
        this.viewportElem.append(this.renderer.domElement);

        this.reinitialize_controls();

        this.windowElem.resize(() => {
            this.update_projection();
        });

        let add_rs = false;

        let prev_hover_object = null;
        this.viewportElem.mousemove(ev => {
            let ev_pos_normalized = new THREE.Vector2(
                ev.offsetX / this.viewportElem.width() * 2 - 1, -(ev.offsetY / this.viewportElem.height() * 2 - 1));

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

        this.viewportElem.click(ev => {
            let ev_pos_normalized = new THREE.Vector2(
                ev.offsetX / this.viewportElem.width() * 2 - 1, -(ev.offsetY / this.viewportElem.height() * 2 - 1));

            let raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(ev_pos_normalized, this.camera);
            let isects = raycaster.intersectObject(this.scene, true);
            if (isects.length === 0 || isects[0].object.name !== 'ui') {
                return;
            }

            let obj = isects[0].object;

            if (add_rs) {
                let rail = new S60RailStraight();
                rail.coord.unsafeSetParent(this.model.coord, new THREE.Vector3(0, 0.12, 0));
                this.model.rails.push(rail);
                this.regen_scaffold_view();
                
                add_rs = false;
            }
        });

        this.addRsElem.click(ev => {
            add_rs = true;
        });

        this.update_projection();
    }

    // This needs to be called when the element is visibled (i.e. tab is switched.)
    // Otherwise control.js internal DOM element size is meesed up and gets broken.
    reinitialize_controls() {
        this.controls = new TrackballControls(this.camera, this.renderer.domElement);
        this.controls.noZoom = false;
        this.controls.noPan = false;
        this.controls.zoomSpeed = 0.1;
        this.controls.maxDistance = 2;
    }

    regen_scaffold_view() {
        this.scaffold_view.remove(this.scaffold_view.children);

        _.each(this.model.rails, rail => {
            let mesh = new THREE.Mesh(this.cad_models['S60C-' + rail.type]);
            mesh.material = new THREE.MeshLambertMaterial({});
            mesh.position.copy(rail.cadCoord.convertP(new THREE.Vector3(0,0,0), this.model.coord));
            this.scene.add(mesh);
        });
        _.each(this.model.workers, worker => {
            let mesh = new THREE.Mesh(this.cad_models['S60C-T']);
            mesh.material = new THREE.MeshLambertMaterial({
                color: PRIM_COLOR
            });
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
        this.camera.aspect = 800 / 600;
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
