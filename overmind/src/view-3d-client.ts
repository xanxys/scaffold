import * as THREE from 'three';
import * as LoaderFactory from 'three-stl-loader';
import * as OrthoTrackballControls from './ortho-trackball-controls.js';
import { ScaffoldModel, S60RailStraight, S60RailHelix, S60RailRotator, ScaffoldThing } from './scaffold-model';

let STLLoader: any = LoaderFactory(THREE);

const PRIM_COLOR = 0x3498db;
const PRIM_COLOR_HOVER = 0x286090;

export enum ClickOpState {
    None,
    AddRs,
    AddRh,
    AddRr,
    Remove,
}

/**
 * A viewmodel used by both View3DClient and the-plan-toolbar.
 */
export class WorldViewModel {
    private state = ClickOpState.None;
    private view: WorldView

    constructor(private model) {
    }

    setState(state: ClickOpState) {
        this.state = state;
        this.view.regenScaffoldView(state);
    }

    bindView(view: WorldView) {
        this.view = view;
    }

    onClickUiObject(obj: any) {
        switch (this.state) {
            case ClickOpState.AddRs:
                this.addRail(obj, new S60RailStraight());
                break;
            case ClickOpState.AddRh:
                this.addRail(obj, new S60RailHelix());
                break;
            case ClickOpState.AddRr:
                this.addRail(obj, new S60RailRotator());
                break;
            case ClickOpState.Remove:
                this.removeRail(obj);
                break;
        }
    }

    private addRail(obj: any, newRail: ScaffoldThing) {
        let orgRail = obj.userData.rail;
        let orgPort = obj.userData.port;
        newRail.coord.unsafeSetParentWithRelation(this.model.coord, orgRail.coord)
            .alignPt(newRail.ports[0].pos, orgPort.pos)
            .alignDir(newRail.ports[0].fwd, orgPort.fwd.clone().multiplyScalar(-1))
            .alignDir(newRail.ports[0].up, orgPort.up)
            .build();
        this.model.addRail(newRail);
        this.view.regenScaffoldView(this.state);
    }

    private removeRail(obj: any) {
        this.model.removeRail(obj.userData.rail);
        this.view.regenScaffoldView(this.state);
    }
}

/**
 * Renders ScaffoldModel directly, but uses WorldViewModel for model edit / other UI interactions.
 */
export class WorldView {
    private static readonly WIDTH = 1000;
    private static readonly HEIGHT = 600;

    private static readonly LAYER_DEFAULT = 1;

    // Layers where intersectible objects resides.
    private static readonly LAYER_UI = 2;

    // Layers where intersectible && clickable objects resides.
    private static readonly LAYER_CLICKABLE = 3;

    model: ScaffoldModel;

    // Unabstracted jQuery UI things.
    windowElem: any;
    viewportElem: any;

    // internal control state.
    animating: boolean;

    renderer: THREE.WebGLRenderer;
    camera: THREE.OrthographicCamera;
    scene: THREE.Scene;
    scaffoldView: any;
    controls: any;

    textureLoader: any;
    stlLoader: any;
    cadModels: Map<string, THREE.Geometry>;
    cachePointGeom: THREE.BufferGeometry;

    viewModel: WorldViewModel;

    constructor(model, windowElem, viewportElem, viewModel) {
        this.model = model;
        this.windowElem = windowElem;
        this.viewportElem = viewportElem;
        this.viewModel = viewModel;

        let aspect = WorldView.WIDTH / WorldView.HEIGHT;
        this.camera = new THREE.OrthographicCamera(
            -0.5 * aspect, 0.5 * aspect, 0.5, -0.5, -1, 100);
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

        this.textureLoader = new THREE.TextureLoader();
        this.stlLoader = new STLLoader();

        // Model derived things.
        this.addTable();

        this.cadModels = new Map();
        const model_names = [
            'S60C-T', 'S60C-RS', 'S60C-RR', 'S60C-RH',
            'S60C-FDW-RS_fixed', 'S60C-FDW-RS_stage',
            'S60C-TB_fixed', 'S60C-TB_darm', 'S60C-TB_mhead',
        ];
        Promise.all(model_names.map(name => this.loadModel(name))).then(geoms => this.regenScaffoldView(ClickOpState.None));

        this.scaffoldView = new THREE.Object3D();
        this.scene.add(this.scaffoldView);

        this.windowElem.resize(() => {
            this.updateProjection();
        });

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

        this.updateProjection();
    }

    private getIntersection(ev: MouseEvent): any {
        const ev_pos_normalized = new THREE.Vector2(
            ev.offsetX / this.viewportElem.width() * 2 - 1, -(ev.offsetY / this.viewportElem.height() * 2 - 1));

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ev_pos_normalized, this.camera);

        const maskIsect = new THREE.Layers();
        maskIsect.set(WorldView.LAYER_UI);

        const maskClickable = new THREE.Layers();
        maskClickable.set(WorldView.LAYER_CLICKABLE);

        const targets = [];
        this.scene.traverse(object => {
            if (object.layers.test(maskIsect)) {
                targets.push(object);
            }
        });
        const isects = raycaster.intersectObjects(targets);

        if (isects.length > 0 && isects[0].object.layers.test(maskClickable)) {
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

        this.reinitializeControls();
    }

    private loadModel(name) {
        return new Promise(resolve => {
            this.stlLoader.load('./models/' + name + '.stl', geom => {
                geom.scale(1e-3, 1e-3, 1e-3);
                this.cadModels[name] = geom;
                resolve(geom);
            });
        });
    }

    /**
     * This needs to be called when the element is visibled (i.e. tab is switched.)
     * Otherwise control.js internal DOM element size is meesed up and gets broken.
     */
    reinitializeControls() {
        this.controls = new OrthoTrackballControls(this.camera, this.renderer.domElement);
    }

    regenScaffoldView(state: ClickOpState) {
        // Because of .remove impl, we need to reverse traversal order.
        for (let i = this.scaffoldView.children.length - 1; i >= 0; i--) {
            this.scaffoldView.remove(this.scaffoldView.children[i]);
        }

        const cachePointGeomSmall = new THREE.SphereBufferGeometry(0.003, 16, 12);
        function createSmallPt(color = 0x000000) {
            let mesh = new THREE.Mesh();
            mesh.geometry = cachePointGeomSmall;
            mesh.material = new THREE.MeshBasicMaterial({
                color: color,
                opacity: 0.5,
                transparent: true,
            });
            return mesh;
        }
        function attachAxisGuide(obj) {
            let px = createSmallPt(0xff0000);
            obj.add(px);
            px.position.x = 0.01;

            let py = createSmallPt(0x00ff00);
            obj.add(py);
            py.position.y = 0.01;

            let pz = createSmallPt(0x0000ff);
            obj.add(pz);
            pz.position.z = 0.01;
        }
        this.model.getThings().forEach(thing => {
            let obj = null;
            if (thing.type === 'FDW-RS') {
                const mesh = new THREE.Mesh(this.cadModels['S60C-FDW-RS_fixed']);
                mesh.material = new THREE.MeshLambertMaterial({});

                const stage = new THREE.Mesh(this.cadModels['S60C-FDW-RS_stage']);
                stage.material = new THREE.MeshLambertMaterial({ 'color': new THREE.Color(0x888888) });
                stage.position.x = thing.paramx;

                mesh.add(stage);
                obj = mesh;
            } else if (thing.type === 'TB') {
                const mesh = new THREE.Mesh(this.cadModels['S60C-TB_fixed']);
                mesh.material = new THREE.MeshLambertMaterial({});
                attachAxisGuide(mesh);

                const darm = new THREE.Mesh(this.cadModels['S60C-TB_darm']);
                darm.material = new THREE.MeshLambertMaterial({ 'color': new THREE.Color(0x888888) });
                darm.rotateZ(Math.PI/2);
                darm.rotateX(Math.PI/2);
                darm.position.set(-5e-3, 0.03, 0.02);
                mesh.add(darm);
                
                const mhead = new THREE.Mesh(this.cadModels['S60C-TB_mhead']);
                mhead.material = new THREE.MeshLambertMaterial({ 'color': new THREE.Color(0x888888) });
                mhead.rotateZ(Math.PI/2);
                mhead.rotateX(Math.PI/2);
                mhead.position.set(0.028, 0.03, 0.03);
                mesh.add(mhead);

                obj = mesh;
            } else {
                let mesh = new THREE.Mesh(this.cadModels['S60C-' + thing.type]);
                mesh.material = new THREE.MeshLambertMaterial({});
                obj = mesh;
            }
            obj.applyMatrix(thing.cadCoord.getTransformTo(this.model.coord));
            this.scaffoldView.add(obj);
        });

        this.cachePointGeom = new THREE.SphereBufferGeometry(0.006, 16, 12);

        if (state === ClickOpState.AddRs || state === ClickOpState.AddRh || state === ClickOpState.AddRr) {
            this.model.getOpenPorts().forEach(point => {
                let mesh = new THREE.Mesh();
                mesh.userData = {
                    rail: point.rail,
                    port: point.port
                };
                mesh.geometry = this.cachePointGeom;
                mesh.material = new THREE.MeshBasicMaterial({
                    color: PRIM_COLOR,
                    opacity: 0.5,
                    transparent: true,
                });
                mesh.position.copy(point.pos);
                mesh.layers.enable(WorldView.LAYER_UI);
                mesh.layers.enable(WorldView.LAYER_CLICKABLE);
                this.scaffoldView.add(mesh);
            });
        } else if (state === ClickOpState.Remove) {
            this.model.getDeletionPoints().forEach(point => {
                let mesh = new THREE.Mesh();
                mesh.userData = {
                    rail: point.rail,
                };
                mesh.geometry = this.cachePointGeom;
                mesh.material = new THREE.MeshBasicMaterial({
                    color: "red",
                    opacity: 0.5,
                    transparent: true,
                });
                mesh.position.copy(point.pos);
                mesh.layers.enable(WorldView.LAYER_UI);
                mesh.layers.enable(WorldView.LAYER_CLICKABLE);
                this.scaffoldView.add(mesh);
            });
        }
    }

    private addTable() {
        let tableMaterial = new THREE.MeshLambertMaterial({
            map: this.textureLoader.load('texture/wood.jpg')
        });

        tableMaterial.map.wrapS = THREE.RepeatWrapping;
        tableMaterial.map.wrapT = THREE.RepeatWrapping;
        tableMaterial.map.repeat.set(2, 2);

        const tableThickness = 0.03;
        const table = new THREE.Mesh(new THREE.BoxGeometry(1, 1, tableThickness), tableMaterial);
        table.position.z = -tableThickness / 2;
        table.receiveShadow = true;
        table.layers.enable(WorldView.LAYER_UI);
        this.scene.add(table);
    }

    private updateProjection() {
        this.camera.updateProjectionMatrix();
    }

    /* UI Utils */
    private animate() {
        // note: three.js includes requestAnimationFrame shim
        if (!this.animating) {
            return;
        }
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    start() {
        this.animating = true;
        this.animate();
    }

    stop() {
        this.animating = false;
    }
}
