import * as THREE from 'three';
import * as LoaderFactory from 'three-stl-loader';
import { AABB, aabbCollision, Coordinates } from './geometry';

let STLLoader: any = LoaderFactory(THREE);

export class ScaffoldThingLoader {
    private stlLoader: any;
    readonly cadModels: Map<string, THREE.Geometry> = new Map();
    private loadingDone: Promise<any>;

    constructor() {
        this.stlLoader = new STLLoader();
        // TODO: Derive these from classes.
        const modelNames = [
            'S60C-RS', 'S60C-RR', 'S60C-RH',
            'S60C-FDW-RS', 'S60C-FDW-RS_stage',
            'S60C-TB', 'S60C-TB_darm', 'S60C-TB_mhead',
        ];
        this.loadingDone = Promise.all(modelNames.map(name => this.loadModel(name)));
    }

    // This API is so hard to use. Get rid of it.
    createAsync<T extends ScaffoldThing>(newable: TypedNewable<T>): Promise<T> {
        return this.loadingDone.then(_ => {
            return new newable(this.cadModels['S60C-' + newable.type]);
        });
    }

    loaded(): Promise<ScaffoldThingLoader> {
        return this.loadingDone.then(_ => this);
    }

    /** Only usable in with... future. Consider separating to different class. */
    create<T extends ScaffoldThing>(newable: TypedNewable<T>): T {
        return new newable(this.cadModels['S60C-' + newable.type]);
    }

    private loadModel(name) {
        return new Promise(resolve => {
            const t0 = new Date();
            this.stlLoader.load('./models/' + name + '.stl', geom => {
                geom.scale(1e-3, 1e-3, 1e-3);
                this.cadModels[name] = geom;
                resolve(geom);
            });
        });
    }
}

interface TypedNewable<T> {
    type: string;
    new(geom: THREE.Geometry): T;
}

/**
 * Scaffold inferred / target world model.
 * 
 * Captures lowest level of physics scaffold cares.
 * Currently, that is static rigid inteference models & rail connections.
 * 
 * Things inside this is mutable, to make rendering more performant.
 * However, multiple instances of this can exist esp. for planning / simulation.
 * 
 * Assumes z=0 is floor.
 */
export class ScaffoldModel {
    coord: Coordinates;
    private things: Array<ScaffoldThing>;

    constructor() {
        this.coord = new Coordinates("world");
        this.things = [];
    }

    encode(): any {
        return {
            rails: this.things.map(rail => rail.encode())
        };
    }

    static decode(obj: any): ScaffoldModel {
        const model = new ScaffoldModel();
        return model;
    }

    attachTrainToRail(tb: S60TrainBuilder, rail: S60RailFeederWide) {
        rail.attachedBy = tb;
        tb.attachedTo = rail;
    }

    getThings(): Array<ScaffoldThing> {
        return this.things;
    }

    findByType<T extends ScaffoldThing>(type: TypedNewable<T>): T {
        return <T>this.getThings().find(thing => thing.type === type.type);
    }

    findAllByType<T extends ScaffoldThing>(type: TypedNewable<T>): Array<T> {
        return <Array<T>>this.getThings().filter(thing => thing.type === type.type);
    }

    addRail(rail: ScaffoldThing) {
        this.things.push(rail);
    }

    removeRail(rail: ScaffoldThing) {
        const ix = this.things.findIndex(r => r === rail);
        if (ix >= 0) {
            this.things.splice(ix, 1);
        }
    }

    // Incorrect semantics. Ports must belong to ScaffoldThing or ScaffoldSubComponent.
    // UI specific parts should be moved to viewmodel.
    getOpenPorts(): Array<any> {
        let portPoints = [];
        this.things.forEach(rail => {
            portPoints = portPoints.concat(rail.ports.map(port => {
                return {
                    rail: rail,
                    port: port,
                    pos: rail.coord.convertP(port.pos, this.coord),
                    normal: rail.coord.convertD(port.up, this.coord)
                };
            }));
        });

        // Get open ports. Open == having no other port in proximity.
        const eps = 1e-2;
        return portPoints.filter((port, ix) =>
            portPoints.every((otherPort, otherIx) => {
                return ix === otherIx || port.pos.distanceTo(otherPort.pos) > eps;
            })
        );
    }

    // This is pure UI thing and should be moved to viewmodel.
    getDeletionPoints(): Array<any> {
        return this.things.map(rail => ({
            rail: rail,
            pos: rail.coord.convertP(rail.bound.center(), this.coord),
        }));
    }

    getEditPoints(): Array<any> {
        const res = [];
        this.things.forEach(thing => {
            if (thing.type === 'FDW-RS' || thing.type === 'TB') {
                res.push({
                    pos: thing.coord.convertP(thing.bound.center(), this.coord),
                    thing: thing,
                });
            }
        })
        return res;
    }

    // Returns (pos, human readable error string).
    // If no error, return [].
    checkErrors(): Array<[THREE.Vector3, string]> {
        let errors = [];

        const size = this.things.length;
        for (let i = 0; i < size; i++) {
            for (let j = i + 1; j < size; j++) {
                let collisionPt = aabbCollision(this.things[i].bound, this.things[j].bound);
                if (collisionPt !== null) {
                    errors.push([collisionPt, "collision"]);
                }
            }
        }
        return errors;
    }
}

/**
 * A thing (mostly rigid) that should be tracked in scaffold world model.
 * Can have internal state.
 */
export interface ScaffoldThing {
    readonly type: string;

    coord: Coordinates;
    ports: Array<Port>;
    bound: AABB;

    cadCoord: Coordinates;
    readonly cadModel: THREE.Geometry;

    //getCadModel(): THREE.Geometry;
    // getCadModelSub(sub: string): THREE.Geometry;

    getRailSegments(): Array<RailSegment>;

    encode(): any;
}

/**
 * Something that is connected to wireless network and can act on comands.
 */
export class Active {
    addr?: number;
}

export class S60RailStraight implements ScaffoldThing {
    static readonly type = "RS";
    readonly type = "RS";
    coord: Coordinates;
    ports: Array<Port>;
    bound: AABB;

    // TODO: refactor cad reference into this class?
    cadCoord: Coordinates;

    constructor(readonly cadModel: THREE.Geometry) {
        this.coord = new Coordinates("RS");
        this.ports = [
            new Port(new THREE.Vector3(0, -0.03, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0)),
            new Port(new THREE.Vector3(0, 0.03, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0))
        ];
        this.bound = new AABB(new THREE.Vector3(-0.015, -0.03, 0), new THREE.Vector3(0.015, 0.03, 0.02));

        this.cadCoord = new Coordinates();
        this.cadCoord.unsafeSetParent(this.coord, new THREE.Vector3(0, -0.03, 0));
    }

    getCadModel() {
        return this.cadModel;
    }

    getCadModelSub(_) {
        return null;
    }

    getRailSegments(): Array<RailSegment> {
        return [
            new RailSegment(
                new THREE.Vector3(0, -0.03, 0),
                new THREE.Vector3(0, 0.03, 0),
                new THREE.Vector3(0, 0, 1))
        ];
    }

    encode(): any {
        return {
            'type': 'RS',
        };
    }
}

export class S60RailHelix implements ScaffoldThing {
    static readonly type = "RH";
    readonly type = "RH";

    coord: Coordinates;
    ports: Array<Port>;
    bound: AABB;

    cadCoord: Coordinates;

    constructor(readonly cadModel: THREE.Geometry) {
        this.coord = new Coordinates("RH");
        this.ports = [
            new Port(new THREE.Vector3(0, -0.03, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0)),
            new Port(new THREE.Vector3(0, 0.03, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0))
        ];
        this.bound = new AABB(new THREE.Vector3(-0.02, -0.03, -0.02), new THREE.Vector3(0.02, 0.03, 0.02));

        this.cadCoord = new Coordinates();
        this.cadCoord.unsafeSetParent(this.coord, new THREE.Vector3(0, -0.025, 0));
    }

    getRailSegments(): Array<RailSegment> {
        return [
            new RailSegment(
                new THREE.Vector3(0, -0.03, 0),
                new THREE.Vector3(0, 0.03, 0),
                new THREE.Vector3(1 / Math.sqrt(2), 0, -1 / Math.sqrt(2)))
        ];
    }

    encode(): any {
        return {
            'type': 'RH',
        };
    }
}

export class S60RailRotator implements ScaffoldThing {
    static readonly type = "RR";
    readonly type = "RR";

    coord: Coordinates;
    ports: Array<Port>;
    bound: AABB;

    cadCoord: Coordinates;

    constructor(readonly cadModel: THREE.Geometry) {
        this.coord = new Coordinates("RR");
        this.ports = [
            new Port(new THREE.Vector3(0, -0.03, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0)),
            new Port(new THREE.Vector3(0, 0.03, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)),
            new Port(new THREE.Vector3(-0.03, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0)),
            new Port(new THREE.Vector3(0.03, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)),
        ];
        this.bound = new AABB(new THREE.Vector3(-0.03, -0.03, -0.01), new THREE.Vector3(0.03, 0.03, 0.02));

        this.cadCoord = new Coordinates();
        this.cadCoord.unsafeSetParent(this.coord, new THREE.Vector3(0, -0.03, 0));
    }

    getRailSegments(): Array<RailSegment> {
        return [
            new RailSegment(
                new THREE.Vector3(0, -0.03, 0),
                new THREE.Vector3(0, 0.03, 0),
                new THREE.Vector3(0, 0, 1)),
            new RailSegment(
                new THREE.Vector3(-0.03, 0, 0),
                new THREE.Vector3(0.03, 0, 0),
                new THREE.Vector3(0, 0, 1)),
        ];
    }

    encode(): any {
        return {
            'type': 'RR',
        };
    }
}

export class S60RailFeederWide implements ScaffoldThing, Active {
    static readonly type = "FDW-RS";
    readonly type = "FDW-RS";
    coord: Coordinates;
    ports: Array<Port>;
    bound: AABB;

    cadCoord: Coordinates;

    addr?: number;

    static readonly NUM_PORTS = 5;
    static readonly GAP_WIDE = 60e-3; // distance between 0-1
    static readonly GAP_NARROW = 35e-3;  // distance between i-(i+1) for i>=1
    paramx: number;  // 0: aligned exactly at 0th stack. 165: last stack.

    // TODO: Abstract this?
    attachedBy?: S60TrainBuilder = null;

    constructor(readonly cadModel: THREE.Geometry) {
        this.coord = new Coordinates("FDW");
        this.ports = [0, 0.06, 0.06 + 0.035, 0.06 + 0.035 * 2, 0.06 + 0.035 * 3].map(xoffset => {
            return new Port(
                new THREE.Vector3(0.135 - xoffset, -0.022, 0.067),
                new THREE.Vector3(0, -1, 0),
                new THREE.Vector3(0, 0, 1));
        });
        this.bound = new AABB(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.22, 0.045, 0.067));

        this.cadCoord = new Coordinates();
        this.cadCoord.unsafeSetParent(this.coord, new THREE.Vector3(0, 0, 0.038),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));

        this.paramx = 0;

        // TODO: Somehow need to propagate coord update to boundBy.
    }

    // integer: 0 = origin. 1 = 1st stop.
    get stagePos(): number {
        if (this.paramx < 60e-3) {
            return Math.round(this.paramx / S60RailFeederWide.GAP_WIDE);
        } else {
            return Math.round((this.paramx - S60RailFeederWide.GAP_WIDE) / S60RailFeederWide.GAP_NARROW) + 1;
        }
    }

    set stagePos(pIx: number) {
        if (pIx < 1) {
            this.paramx = pIx * S60RailFeederWide.GAP_WIDE;
        } else {
            this.paramx = (pIx - 1) * S60RailFeederWide.GAP_NARROW + S60RailFeederWide.GAP_WIDE;
        }

        if (this.attachedBy) {
            const railSeg = this.getRailSegment();
            this.attachedBy.centerOn(railSeg, this.coord);
        }
    }

    private getRailSegment(): RailSegment {
        return new RailSegment(
            new THREE.Vector3(this.paramx + 0.1, -0.03, 0),
            new THREE.Vector3(this.paramx + 0.1, 0.03, 0),
            new THREE.Vector3(0, 0, 1));
    }

    // Not used anywhere for now.
    getRailSegments(): Array<RailSegment> {
        return [
            new RailSegment(
                new THREE.Vector3(this.paramx + 0.1, -0.03, 0),
                new THREE.Vector3(this.paramx + 0.1, 0.03, 0),
                new THREE.Vector3(0, 0, 1))
        ];
    }

    encode(): any {
        return {
            'type': 'FDW-RS',
        };
    }
}

export class S60TrainBuilder implements ScaffoldThing, Active {
    static readonly type = "TB";
    readonly type = "TB";
    coord: Coordinates;
    ports: Array<Port>;
    bound: AABB;

    cadCoord: Coordinates;

    addr?: number;

    // TODO: Abstract this, to refer to RailSegment instead of rail direclty?
    attachedTo?: S60RailFeederWide = null;

    readonly up = new THREE.Vector3(0, 0, 1);
    readonly forward = new THREE.Vector3(0, 1, 0);

    constructor(readonly cadModel: THREE.Geometry) {
        this.coord = new Coordinates("TB");
        this.ports = [];
        this.bound = new AABB(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.22, 0.045, 0.067));

        this.cadCoord = new Coordinates();
        this.cadCoord.unsafeSetParent(this.coord, new THREE.Vector3(0, 0, 0.038),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    }

    centerOn(rs: RailSegment, rsCoord: Coordinates) {
        const rsCenterPos = rs.pos1.clone().add(rs.pos2).multiplyScalar(0.5);

        // Choose rail direction closer to forward (instead of -forward).
        let rsDir = rs.dir;
        if (this.coord.convertD(rsDir, rsCoord).dot(this.forward) < 0) {
            rsDir.multiplyScalar(-1);
        }

        this.coord.adjustWithRelation(rsCoord)
            .alignPt(this.bound.center(), rs.center)
            .alignDir(this.up, rs.up)
            .alignDir(this.forward, rsDir)
            .build();
    }

    getRailSegments(): Array<RailSegment> {
        return [];
    }

    encode(): any {
        return {
            'type': 'TB',
        };
    }
}

/**
 * Bidirectional unbindable connector. This conenction forms foundation of scaffold lattice.
 */
export class Port {
    constructor(public pos: THREE.Vector3, public up: THREE.Vector3, public fwd: THREE.Vector3) {
    }
}

/**
 * Linear piece of rail where trains can couple.
 * 
 * TODO: Support S60C-RH.
 */
class RailSegment {
    constructor(public pos1: THREE.Vector3, public pos2: THREE.Vector3, public up: THREE.Vector3) {
    }

    get center(): THREE.Vector3 {
        return this.pos1.clone().add(this.pos2).multiplyScalar(0.5);
    }

    /** Get rail direction unit vector. Caller must not rely on which direction it's pointing to. */
    get dir(): THREE.Vector3 {
        const delta = (Math.random() > 0.5) ? this.pos1.clone().sub(this.pos2) : this.pos2.clone().sub(this.pos1);
        return delta.normalize();
    }
}
