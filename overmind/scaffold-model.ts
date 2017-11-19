
import * as THREE from 'three';

// Scaffold inferred / target world model.
// Captures lowest level of physics scaffold cares.
// Currently, that is static rigid inteference models & rail connections.
//
// Things inside this is mutable, to make rendering more performant.
// However, multiple instances of this can exist esp. for planning / simulation.
//
// Assumes z=0 is floor.
export class ScaffoldModel {
    coord: Coordinates;
    rails: Array<ScaffoldThing>;
    workers: Array<any>;

    constructor() {
        this.coord = new Coordinates();

        this.rails = [
            new S60RailStraight(),
            new S60RailStraight(),
        ];

        this.rails[0].coord.unsafeSetParent(this.coord, new THREE.Vector3(0, 0, 0.02));
        this.rails[1].coord.unsafeSetParent(this.coord, new THREE.Vector3(0, 0.06, 0.02));

        let fd = new S60RailFeederWide();
        fd.coord.unsafeSetParent(this.coord, new THREE.Vector3(0.1, 0, 0));
        this.rails.push(fd);
    }

    get_worker_pos() {}

    get_points() {
        let port_points = [];
        this.rails.forEach(rail => {
            port_points = port_points.concat(rail.ports.map(port => {
                return {
                    open: true,
                    pos: rail.coord.convertP(port.pos, this.coord),
                    normal: rail.coord.convertD(port.up, this.coord)
                };
            })); 
        });
        console.log(port_points);
        return port_points;
    }

    // Returns (pos, human readable error string).
    // If no error, return [].
    checkErrors(): Array<[THREE.Vector3, string]> {
        let errors = [];

        const size = this.rails.length;
        for (let i = 0; i < size; i++) {
            for (let j = i + 1; j < size; j++) {
                let collision_pt = aabb_collision(this.rails[i].bound, this.rails[j].bound);
                if (collision_pt !== null) {
                    errors.push([collision_pt, "collision"]);
                }
            }
        }
        return errors;
    }
}

// A thing (mostly rigid) that should be tracked in scaffold world model.
// Can have internal state.
export interface ScaffoldThing {
    type: string;
    coord: Coordinates;
    ports: Array<Port>;
    bound: AABB;

    cadCoord: Coordinates;
}

// Something that is connected to wireless network and can act on comands.
export interface Active {
}

export class S60RailStraight implements ScaffoldThing {
    type: string;
    coord: Coordinates;
    ports: Array<Port>;
    bound: AABB;

    // TODO: refactor cad reference into this class?
    cadCoord: Coordinates;
    
    constructor() {
        this.type = "RS";
        this.coord = new Coordinates();
        this.ports = [
            new Port(new THREE.Vector3(0, -0.03, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0)),
            new Port(new THREE.Vector3(0, 0.03, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0))
        ];
        this.bound = new AABB(new THREE.Vector3(-0.015, -0.03, 0), new THREE.Vector3(0.015, 0.03, 0.02));

        this.cadCoord = new Coordinates();
        this.cadCoord.unsafeSetParent(this.coord, new THREE.Vector3(0, -0.03, 0));
    }
}

export class S60RailFeederWide implements ScaffoldThing {
    type: string;
    coord: Coordinates;
    ports: Array<Port>;
    bound: AABB;

    cadCoord: Coordinates;
    
    constructor() {
        this.type = "FDW-RS";
        this.coord = new Coordinates();
        this.ports = [];
        this.bound = new AABB(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.22, 0.045, 0.067));

        this.cadCoord = new Coordinates();
        this.cadCoord.unsafeSetParent(this.coord, new THREE.Vector3(0, 0, 0.038),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    }
}

class S60Builder {

}

class Port {
    constructor(public pos: THREE.Vector3, public up: THREE.Vector3, public fwd: THREE.Vector3) {
    }
}

class AABB {
    constructor(public min: THREE.Vector3, public max: THREE.Vector3) {
    }

    center(): THREE.Vector3 {
        return this.max.clone().add(this.min).multiplyScalar(0.5);
    }

    size(): THREE.Vector3 {
        return this.max.clone().sub(this.min);
    }
}

function aabb_collision(a: AABB, b: AABB): THREE.Vector3 | undefined {
    function collision(amin, amax, bmin, bmax): number | undefined {
        let imin = Math.max(amin, bmin);
        let imax = Math.min(amax, bmax);
        return (imin > imax) ? null : (imin + imax) * 0.5;
    }

    let ix = collision(a.min.x, a.max.x, b.min.x, b.min.x);
    if (ix === null) {
        return null;
    }
    let iy = collision(a.min.y, a.max.y, b.min.y, b.min.y);
    if (iy === null) {
        return null;
    }
    let iz = collision(a.min.z, a.max.z, b.min.z, b.min.z);
    if (iz === null) {
        return null;
    }
    return new THREE.Vector3(ix, iy, iz);
}

// Describes a single coordinate system in the world.
class Coordinates {

    private parent: Coordinates;

    private orient: THREE.Quaternion;
    private offset: THREE.Vector3;

    // TODO: Replace with more friendly interface once relationBuilder is done.
    unsafeSetParent(parent: Coordinates, offset: THREE.Vector3, orient?: THREE.Quaternion) {
        this.parent = parent;
        this.offset = offset;
        this.orient = orient || new THREE.Quaternion(0, 0, 0, 1);
    }

    relationTo(parent: Coordinates): CoordinatesRelationBuilder {
        return new CoordinatesRelationBuilder();
    }

    convertP(pos: THREE.Vector3, target: Coordinates): THREE.Vector3 {
        if (target === this) {
            return pos;
        } else {
            if (this.parent === null) {
                throw "Failed to convert between Coordinates";
            } else {
                return this.parent.convertP(
                    pos.clone().applyQuaternion(this.orient).add(this.offset), target);
            }
        }
    }

    convertD(dir: THREE.Vector3, target: Coordinates): THREE.Vector3 {
        return dir.clone().applyQuaternion(this.orient);
    }

    getTransformTo(target: Coordinates): THREE.Matrix4 {
        if (target == this) {
            return new THREE.Matrix4();
        } else {
            if (this.parent === null) {
                throw "Failed to convert between Coordinates";
            } else {
                let fToParent = new THREE.Matrix4().makeRotationFromQuaternion(this.orient).setPosition(this.offset);
                return fToParent.premultiply(this.parent.getTransformTo(target));
            }
        }
    }
}

class CoordinatesRelationBuilder {

    // TODO: Implement these.
    orient(origDir: THREE.Vector3, targDir: THREE.Vector3): CoordinatesRelationBuilder {
        return this;
    }

    align(origPos: THREE.Vector3, targDir: THREE.Vector3): CoordinatesRelationBuilder {
        return this;
    }

    fix() {
    }
}
