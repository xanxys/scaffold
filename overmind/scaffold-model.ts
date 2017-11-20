
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
        this.coord = new Coordinates("world");

        this.rails = [
            new S60RailStraight(),
            // new S60RailStraight(),
        ];

        this.rails[0].coord.unsafeSetParent(this.coord, new THREE.Vector3(0, 0, 0.02));
        // this.rails[1].coord.unsafeSetParent(this.coord, new THREE.Vector3(0, 0.06, 0.02));

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
                    rail: rail,
                    port: port,
                    pos: rail.coord.convertP(port.pos, this.coord),
                    normal: rail.coord.convertD(port.up, this.coord)
                };
            })); 
        });
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
        this.coord = new Coordinates("RS");
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
    private transToParent: THREE.Matrix4;

    constructor(public name?: string) {}

    // TODO: Replace with more friendly interface once relationBuilder is done.
    unsafeSetParent(parent: Coordinates, offset: THREE.Vector3, orient?: THREE.Quaternion) {
        this.parent = parent;
        let trans = new THREE.Matrix4().identity();
        if (orient !== undefined) {
            trans.makeRotationFromQuaternion(orient);
        }
        trans.setPosition(offset);
        this.transToParent = trans;
    }

    // unsafeSetParentInRelationTo(parent: Coordinates, offset: THREE.V)

    /**
     * Usage:
     * newCoord.unsafeSetParentWithRelation(someRandomSharedParent, existingRef)
     *   .alignX(newX, existingX)
     *   .build();
     */
    unsafeSetParentWithRelation(parent: Coordinates, ref: Coordinates): RelationBuilder {
        return new RelationBuilder(transFromNewToRef => {
            this.transToParent = transFromNewToRef.clone().premultiply(ref.getTransformTo(parent));
            this.parent = parent;
        });
    }

    convertP(pos: THREE.Vector3, target: Coordinates): THREE.Vector3 {
        if (target === this) {
            return pos;
        } else {
            if (this.parent === null) {
                throw "Failed to convert between Coordinates";
            } else {
                return this.parent.convertP(pos.clone().applyMatrix4(this.transToParent), target);
            }
        }
    }

    convertD(dir: THREE.Vector3, target: Coordinates): THREE.Vector3 {
        return dir.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(this.transToParent));
    }

    getTransformTo(target: Coordinates): THREE.Matrix4 {
        if (target == this) {
            return new THREE.Matrix4();
        } else {
            if (this.parent === null) {
                throw "Failed to convert between Coordinates";
            } else {
                return this.transToParent.clone().premultiply(this.parent.getTransformTo(target));
            }
        }
    }
}

/**
 * Constraints based transform calculator, to intuitively align two objects' Coordinates.
 */
export class RelationBuilder {

    private ptPair: [THREE.Vector3, THREE.Vector3];
    private dirPairs: Array<[THREE.Vector3, THREE.Vector3]> = [];

    constructor(private afterBuild?: ((trans :THREE.Matrix4) => any)) {}

    alignPt(ptNew: THREE.Vector3, ptRef: THREE.Vector3): RelationBuilder {
        this.ptPair = [ptNew, ptRef];
        return this;
    }

    /**
     * You need to call this exactly twice with different (ideally orthogonal) vectors
     * in order to properly specify orientation.
     */
    alignDir(dirNew: THREE.Vector3, dirRef: THREE.Vector3): RelationBuilder {
        this.dirPairs.push([dirNew, dirRef]);
        return this;
    }

    build() {
        this.afterBuild(this.getTransformToRef());
    }

    /**
     * @returns transform M such that (M*new = ref and satifies given constraints).
     */ 
    getTransformToRef(): THREE.Matrix4 {
        if (this.dirPairs.length !== 2) {
            throw "Under- or over- constrained RelationBuilder. Needs exactly 2 alignDir() calls.";
        }

        // Apply orthogonalization.
        this.dirPairs.push([
            new THREE.Vector3().crossVectors(this.dirPairs[0][0], this.dirPairs[1][0]).normalize(),
            new THREE.Vector3().crossVectors(this.dirPairs[0][1], this.dirPairs[1][1]).normalize(),
        ]);
        this.dirPairs[0] = [
            new THREE.Vector3().copy(this.dirPairs[0][0]).normalize(),
            new THREE.Vector3().copy(this.dirPairs[0][1]).normalize()
        ];
        this.dirPairs[1] = [
            new THREE.Vector3().crossVectors(this.dirPairs[2][0], this.dirPairs[0][0]).normalize(),
            new THREE.Vector3().crossVectors(this.dirPairs[2][1], this.dirPairs[0][1]).normalize(),
        ];

        // dirs are now orth-normal unit vectors.
        // We want to get rotation R such that,
        // R (dir0N dir1N dir2N) = (dir0R dir1R dir2R)  (dir are column vectors).
        // R = MR * MN^-1
        let mNew = this.columns(this.dirPairs[0][0], this.dirPairs[1][0], this.dirPairs[2][0]);
        let mRef = this.columns(this.dirPairs[0][1], this.dirPairs[1][1], this.dirPairs[2][1]);
        let mNewInv = new THREE.Matrix4().getInverse(mNew, true);

        let mTrans = mRef.multiply(mNewInv);

        // Now resole point alignment constraint.
        // (mTrans, mOfs) * ptN = ptR
        // mOfs = ptR - mTrans * ptN
        let mOfs = this.ptPair[1].clone().sub(this.ptPair[0].applyMatrix4(mTrans));
        return mTrans.setPosition(mOfs);
    }

    private columns(v0: THREE.Vector3, v1: THREE.Vector3, v2: THREE.Vector3): THREE.Matrix4 {
        return new THREE.Matrix4().set(
            v0.x, v1.x, v2.x, 0,
            v0.y, v1.y, v2.y, 0,
            v0.z, v1.z, v2.z, 0,
            0, 0, 0, 1
        );
    }
}
