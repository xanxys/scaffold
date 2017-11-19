
// TODO: Figure out proper way to do this.
declare const THREE : any;

namespace THREE {
    export interface Vector3 {

    }
}

// Scaffold inferred / target world model.
// Captures lowest level of physics scaffold cares.
// Currently, that is static rigid inteference models & rail connections.
//
// Things inside this is mutable, to make rendering more performant.
// However, multiple instances of this can exist esp. for planning / simulation.
//
// Assumes z=0 is floor.
export default class ScaffoldModel {
    coord: Coordinates;
    rails: Array<ScaffoldThing>;

    constructor() {
        this.coord = new Coordinates();

        /*
        let rs = new S60RailStraight();
        rs.coord.relationTo(this.coord).align().fix();
        */

        this.rails = [
            new S60RailStraight(),
            new S60RailStraight(),
        ];

        this.rails[0].coord.unsafeSetParent(this.coord, new THREE.Vector3(0, 0, 0));
        this.rails[1].coord.unsafeSetParent(this.coord, new THREE.Vector3(0, 0.06, 0));
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

    // Returns (pos, human readable error string).
    // If no error, return [].
    checkErrors(): Array<[THREE.Vector3, string]> {
        return [];
    }
}

// A thing (mostly rigid) that should be tracked in scaffold world model.
// Can have internal state.
interface ScaffoldThing {
    type: string;
    coord: Coordinates;
    ports: Array<Port>;
    bound: AABB;
}

// Something that is connected to wireless network and can act on comands.
interface Active {
}

class S60RailStraight implements ScaffoldThing {
    type: string;
    coord: Coordinates;
    ports: Array<Port>;
    bound: AABB;
    
    constructor() {
        this.type = "RS";
        this.coord = new Coordinates();
        this.ports = [];
        this.bound = new AABB(new THREE.Vector3(-0.015, -0.03, 0), new THREE.Vector3(0.015, 0.03, 0.02));
    }
}

class S60RailFeederWide {

}

class S60Builder {

}

class Port {
    coord: Coordinates;
    up: THREE.Vector3;
    fwd: THREE.Vector3;
}

class AABB {
    constructor(public min: THREE.Vector3, public max: THREE.Vector3) {
    }

    center(): THREE.Vector3 {
        return this.max.clone().add(this.min).multiplyScalar(0.5);
    }

}

// Describes a single coordinate system in the world.
class Coordinates {

    private parent: Coordinates;
    private offset: THREE.Vector3;

    // TODO: Replace with more friendly interface once relationBuilder is done.
    unsafeSetParent(parent: Coordinates, offset: THREE.Vector3) {
        this.parent = parent;
        this.offset = offset;
    }

    relationTo(parent: Coordinates): CoordinatesRelationBuilder {
        return new CoordinatesRelationBuilder();
    }

    convertP(pos: THREE.Vector3, target: Coordinates) : THREE.Vector3 {
        if (target === this) {
            return pos;
        } else {
            if (this.parent === null) {
                throw "Failed to convert between Coordinates";
            } else {
                return this.parent.convertP(pos.clone().add(this.offset), target);
            }
        }
    }

    covnertD(dir: THREE.Vector3, target: Coordinates) : THREE.Vector3 {
        return dir;
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
