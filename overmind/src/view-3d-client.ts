import * as THREE from 'three';
import * as LoaderFactory from 'three-stl-loader';
import * as OrthoTrackballControls from './ortho-trackball-controls.js';
import { ScaffoldModel, S60RailStraight, S60RailHelix, S60RailRotator, ScaffoldThing, S60TrainBuilder, S60RailFeederWide, ScaffoldThingLoader } from './scaffold-model';
import { Plan, Planner, FeederPlanner1D } from './planner';

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
 * A viewmodel used by both View3DClient, the-plan-toolbar, and timeline.
 */
export class WorldViewModel {
    private state = ClickOpState.None;
    private view: WorldView;
    private showPhysics = false;

    private loader: ScaffoldThingLoader;
    private planner?: Planner;
    plan?: Plan = undefined;

    private targetModel: ScaffoldModel;

    constructor(private currModel) {
        this.loader = new ScaffoldThingLoader();
        this.targetModel = new ScaffoldModel();
    }

    setState(state: ClickOpState) {
        this.state = state;
        this.view.regenScaffoldView(state);
    }

    genFeederPlan() {
        Promise.all([
            this.loader.create(S60RailStraight).then(rs => {
                rs.coord.unsafeSetParent(this.currModel.coord, new THREE.Vector3(0, 0, 0.02));
                this.currModel.addRail(rs);
            }),
            this.loader.create(S60RailFeederWide).then(fd => {
                fd.coord.unsafeSetParent(this.currModel.coord, new THREE.Vector3(0.1, 0, 0));
                this.currModel.addRail(fd);
            }),
            this.loader.create(S60TrainBuilder).then(tb => {
                tb.coord.unsafeSetParent(this.currModel.coord, new THREE.Vector3(0.105, -0.022, 0));
                this.currModel.addRail(tb);
            }),
        ]).then(_ => {
            this.planner = new FeederPlanner1D(this.currModel, this.targetModel);
            this.plan = this.planner.getPlan();
            this.view.regenScaffoldView(ClickOpState.None);
        });
    }

    setTime(tSec: number) {
        if (this.planner !== null) {
            this.planner.setTime(tSec);
        }
    }

    togglePhysics() {
        this.showPhysics = !this.showPhysics;
    }

    bindView(view: WorldView) {
        this.view = view;
    }

    onClickUiObject(obj: any) {
        switch (this.state) {
            case ClickOpState.AddRs:
                this.loader.create(S60RailStraight).then(r => this.addRail(obj, r));
                break;
            case ClickOpState.AddRh:
                this.loader.create(S60RailHelix).then(r => this.addRail(obj, r));
                break;
            case ClickOpState.AddRr:
                this.loader.create(S60RailRotator).then(r => this.addRail(obj, r));
                break;
            case ClickOpState.Remove:
                this.removeRail(obj);
                break;
        }
    }

    getShowPhysics(): boolean {
        return this.showPhysics;
    }

    private addRail(obj: any, newRail: ScaffoldThing) {
        let orgRail = obj.userData.rail;
        let orgPort = obj.userData.port;
        newRail.coord.unsafeSetParentWithRelation(this.currModel.coord, orgRail.coord)
            .alignPt(newRail.ports[0].pos, orgPort.pos)
            .alignDir(newRail.ports[0].fwd, orgPort.fwd.clone().multiplyScalar(-1))
            .alignDir(newRail.ports[0].up, orgPort.up)
            .build();
        this.currModel.addRail(newRail);
        this.view.regenScaffoldView(this.state);
    }

    private removeRail(obj: any) {
        this.currModel.removeRail(obj.userData.rail);
        this.view.regenScaffoldView(this.state);
    }
}

/**
 * Renders ScaffoldModel directly, but uses WorldViewModel for model edit / other UI interactions.
 * 
 * ScaffoldModel & THREE.Object3D Hierarchy Mapping:
 * 
 * ScaffoldThing and its subcomponents ------------------------ Object3D - CAD model
 *                                                                 |-- attached physical elements
 */
export class WorldView {
    private static readonly WIDTH = 1000;
    private static readonly HEIGHT = 600;

    private static readonly LAYER_DEFAULT = 1;

    // Layers where intersectible objects resides.
    private static readonly LAYER_UI = 2;

    // Layers where intersectible && clickable objects resides.
    private static readonly LAYER_CLICKABLE = 3;

    // Layers where abstract physical elements / interactions (ports, rail segment bindings etc.) are shown.
    private static readonly LAYER_PHYSICS = 4;

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

    realtimeBindings: Array<any> = [];

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
            'S60C-FDW-RS_stage',
            'S60C-TB_darm', 'S60C-TB_mhead',
        ];
        Promise.all(model_names.map(name => this.loadModel(name)));

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
        this.realtimeBindings = [];
        this.model.getThings().forEach(thing => {
            let obj = null;
            let type = (<any>thing.constructor).type;
            if (type === 'FDW-RS') {
                const mesh = new THREE.Mesh(thing.cadModel);
                mesh.material = new THREE.MeshLambertMaterial({});

                // TODO: Migrate these into ScaffoldModel intead of having hierarchy here.
                const stage = new THREE.Mesh(this.cadModels['S60C-FDW-RS_stage']);
                stage.material = new THREE.MeshLambertMaterial({ 'color': new THREE.Color(0x888888) });
                this.realtimeBindings.push({ apply: () => stage.position.x = (<S60RailFeederWide>thing).paramx });

                mesh.add(stage);
                obj = mesh;
            } else if (type === 'TB') {
                const mesh = new THREE.Mesh(thing.cadModel);
                mesh.material = new THREE.MeshLambertMaterial({});
                attachAxisGuide(mesh);

                // TODO: Migrate these into ScaffoldModel intead of having hierarchy here.
                const darm = new THREE.Mesh(this.cadModels['S60C-TB_darm']);
                darm.material = new THREE.MeshLambertMaterial({ 'color': new THREE.Color(0x888888) });
                darm.rotateZ(Math.PI / 2);
                darm.rotateX(Math.PI / 2);
                darm.position.set(-5e-3, 0.03, 0.02);
                mesh.add(darm);

                // TODO: Migrate these into ScaffoldModel intead of having hierarchy here.
                const mhead = new THREE.Mesh(this.cadModels['S60C-TB_mhead']);
                mhead.material = new THREE.MeshLambertMaterial({ 'color': new THREE.Color(0x888888) });
                mhead.rotateZ(Math.PI / 2);
                mhead.rotateX(Math.PI / 2);
                mhead.position.set(0.028, 0.03, 0.03);
                mesh.add(mhead);

                obj = mesh;
            } else {
                let mesh = new THREE.Mesh(thing.cadModel);
                mesh.material = new THREE.MeshLambertMaterial({});
                obj = mesh;
            }
            obj.applyMatrix(thing.cadCoord.getTransformTo(this.model.coord));
            this.scaffoldView.add(obj);
        });
        // Run initial bindings to update model positions.
        this.realtimeBindings.forEach(binding => binding.apply());

        this.cachePointGeom = new THREE.SphereBufferGeometry(0.006, 16, 12);

        // TODO: These UI elems should be children of scaffold objects.
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

    private animate() {
        // note: three.js includes requestAnimationFrame shim
        if (!this.animating) {
            return;
        }
        requestAnimationFrame(() => this.animate());

        this.controls.update();
        this.realtimeBindings.forEach(binding => binding.apply());

        if (this.viewModel.getShowPhysics()) {
            this.camera.layers.enable(WorldView.LAYER_PHYSICS);
        } else {
            this.camera.layers.disable(WorldView.LAYER_PHYSICS);
        }

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
