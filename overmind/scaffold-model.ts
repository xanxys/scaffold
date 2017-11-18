
// TODO: Figure out proper way to do this.
declare const THREE : any;

// Scaffold inferred / target world model.
// Captures lowest level of physics scaffold cares.
// Currently, that is static rigid inteference models & rail connections.
//
// Things inside this is mutable, to make rendering more performant.
// However, multiple instances of this can exist esp. for planning / simulation.
//
// Assumes z=0 is floor.
export default class ScaffoldModel {
    things: Array<ScaffoldThing>;
    rails: Array<any>;


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

// A thing (mostly rigid) that should be tracked in scaffold world model.
// Can have internal state.
interface ScaffoldThing {
    ports: Array<any>;
}
