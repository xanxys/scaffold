import * as THREE from 'three';
import * as LoaderFactory from 'three-stl-loader';
import * as TrackballControls from 'three.trackball';
import { ScaffoldModel, S60RailStraight, S60RailHelix, S60RailRotator } from './scaffold-model';

let STLLoader: any = LoaderFactory(THREE);

const PRIM_COLOR = 0x3498db;
const PRIM_COLOR_HOVER = 0x286090;

enum ClickOpState {
    None,
    AddRs,
    AddRh,
    AddRr,
}

export class WorldViewModel {
    private state = ClickOpState.None;
    private view: WorldView

    constructor(private model, addRsElem, addRhElem, addRrElem) {
        addRsElem.click(ev => {
            this.state = ClickOpState.AddRs;
        });
        addRhElem.click(ev => {
            this.state = ClickOpState.AddRh;
        });
        addRrElem.click(ev => {
            this.state = ClickOpState.AddRr;
        });
    }

    bindView(view: WorldView) {
        this.view = view;
    }

    onClickUiObject(obj: any) {
        let newRail = null;
        switch (this.state) {
            case ClickOpState.AddRs:
                newRail = new S60RailStraight();
                break;
            case ClickOpState.AddRh:
                newRail = new S60RailHelix();
                break;
            case ClickOpState.AddRr:
                newRail = new S60RailRotator();
                break;
        }

        if (newRail !== null) {
            let orgRail = obj.userData.rail;
            let orgPort = obj.userData.port;
            newRail.coord.unsafeSetParentWithRelation(this.model.coord, orgRail.coord)
                .alignPt(newRail.ports[0].pos, orgPort.pos)
                .alignDir(newRail.ports[0].fwd, orgPort.fwd.clone().multiplyScalar(-1))
                .alignDir(newRail.ports[0].up, orgPort.up)
                .build();
            this.model.rails.push(newRail);
            this.view.regen_scaffold_view();
        }
    }
}

// Renders ScaffoldModel directly, but uses WorldViewModel for model edit / other UI interactions.
export class WorldView {
    private static readonly WIDTH = 1000;
    private static readonly HEIGHT = 800;

    model: ScaffoldModel;

    // Unabstracted jQuery UI things.
    windowElem: any;
    viewportElem: any;

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

    viewModel: WorldViewModel;

    constructor(model, windowElem, viewportElem, viewModel) {
        this.model = model;
        this.windowElem = windowElem;
        this.viewportElem = viewportElem;
        this.viewModel = viewModel;

        this.camera = new THREE.PerspectiveCamera(75, WorldView.WIDTH / WorldView.HEIGHT, 0.01, 7);
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
        const model_names = ['S60C-T', 'S60C-RS', 'S60C-RR', 'S60C-RH', 'S60C-FDW-RS'];
        Promise.all(model_names.map(name => this.loadModel(name))).then(geoms => this.regen_scaffold_view());

        this.scaffold_view = new THREE.Object3D();
        this.scene.add(this.scaffold_view);

        this.windowElem.resize(() => {
            this.update_projection();
        });

        let add_rs = false;

        let prev_hover_object = null;
        this.viewportElem.mousemove(ev => {
            const isect = this.getIntersection(ev);
            let curr_hover_object = null;
            if (isect != undefined) {
                curr_hover_object = isect.object;
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
            const isect = this.getIntersection(ev);
            if (isect == undefined) {
                return;
            }
            this.viewModel.onClickUiObject(isect.object);
        });

        this.update_projection();
    }

    private getIntersection(ev: MouseEvent): any {
        const ev_pos_normalized = new THREE.Vector2(
            ev.offsetX / this.viewportElem.width() * 2 - 1, -(ev.offsetY / this.viewportElem.height() * 2 - 1));

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ev_pos_normalized, this.camera);
        const isects = raycaster.intersectObject(this.scene, true);

        if (isects.length > 0 && isects[0].object.name === 'ui') {
            return isects[0];
        }
    }

    startRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });

        this.renderer.setSize(WorldView.WIDTH, WorldView.HEIGHT);
        this.renderer.setClearColor('#aac');
        this.viewportElem.width(WorldView.WIDTH);
        this.viewportElem.height(WorldView.HEIGHT);
        this.viewportElem.append(this.renderer.domElement);

        this.reinitialize_controls();
    }

    loadModel(name) {
        return new Promise(resolve => {
            this.stl_loader.load('./models/' + name + '.stl', geom => {
                geom.scale(1e-3, 1e-3, 1e-3);
                this.cad_models[name] = geom;
                resolve(geom);
            });
        });
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

        this.model.rails.forEach(rail => {
            let mesh = new THREE.Mesh(this.cad_models['S60C-' + rail.type]);
            mesh.material = new THREE.MeshLambertMaterial({});
            mesh.applyMatrix(rail.cadCoord.getTransformTo(this.model.coord));
            this.scene.add(mesh);
        });

        this.cache_point_geom = new THREE.SphereBufferGeometry(0.006, 16, 12);
        this.model.get_points().forEach(point => {
            if (!point.open) {
                return;
            }
            let mesh = new THREE.Mesh();
            mesh.name = 'ui';
            mesh.userData = {
                rail: point.rail,
                port: point.port
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
        this.camera.aspect = WorldView.WIDTH / WorldView.HEIGHT;
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
