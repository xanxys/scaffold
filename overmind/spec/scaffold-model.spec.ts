
// cf. https://stackoverflow.com/questions/39020022/angular-2-unit-tests-cannot-find-name-describe/39945169#39945169
import {} from 'jasmine';
import {RelationBuilder} from "../scaffold-model";

import * as THREE from 'three';

function expectVectorIsSame(obs: THREE.Vector3, exp: THREE.Vector3) {
    let d = obs.distanceTo(exp);
    expect(d).toBeLessThanOrEqual(1e-5,
        `(${obs.x}, ${obs.y}, ${obs.z})[observed] ≃ (${exp.x}, ${exp.y}, ${exp.z})[expected], but distance = ${d}`);
}

function expectTransforms(trans: THREE.Matrix4, from: THREE.Vector3, to: THREE.Vector3) {
    let toObserved = from.clone().applyMatrix4(trans);
    expectVectorIsSame(toObserved, to);
}

describe("RelationBuilder", () => {
    it("Identity transform works", () => {
        let trans = new RelationBuilder()
            .alignDir(new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0))
            .alignDir(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0))
            .alignPt(new THREE.Vector3(1, 2, 3), new THREE.Vector3(1, 2, 3))
            .getTransformToRef();
        
        let v = new THREE.Vector3(4, 5, 6);
        expectTransforms(trans, v, v);
    });

    it("Translation-only transform works", () => {
        let offset = new THREE.Vector3(-2, 1, 3);

        let trans = new RelationBuilder()
            .alignDir(new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0))
            .alignDir(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0))
            .alignPt(new THREE.Vector3(1, 2, 3), new THREE.Vector3(1, 2, 3).add(offset))
            .getTransformToRef();

        let v = new THREE.Vector3(4, 5, 6);
        expectTransforms(trans, v, v.clone().add(offset));
    });

    it("Rotation-only transform works", () => {
        let offset = new THREE.Vector3(-2, 1, 3);

        let trans = new RelationBuilder()
            .alignDir(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0))
            .alignDir(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1))
            .alignPt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0))
            .getTransformToRef();

        expectTransforms(trans, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
        expectTransforms(trans, new THREE.Vector3(4, 5, 6), new THREE.Vector3(6, 4, 5));
    });

    it("No-translation in rotation transform works", () => {
        let offset = new THREE.Vector3(-2, 1, 3);

        let trans = new RelationBuilder()
            .alignDir(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0))
            .alignDir(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1))
            .alignPt(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0))
            .getTransformToRef();

        expectTransforms(trans, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
        expectTransforms(trans, new THREE.Vector3(4, 5, 6), new THREE.Vector3(6, 4, 5));
    });

    it("Z-axis 180 degree rotation preserves Z", () => {
        /*
         ---|---> <---|----
            O   1 1   O
        */
        let trans = new RelationBuilder()
            // 180 degree rotation along Z axis.
            .alignDir(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1))
            .alignDir(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0))
            // 
            .alignPt(new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0))
            .getTransformToRef();

        expectTransforms(trans, new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0));
        expectTransforms(trans, new THREE.Vector3(2, 0, 0), new THREE.Vector3(0, 0, 0));
        expectTransforms(trans, new THREE.Vector3(1, 0, 5), new THREE.Vector3(1, 0, 5));
    });
});
