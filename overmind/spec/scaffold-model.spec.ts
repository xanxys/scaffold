
// cf. https://stackoverflow.com/questions/39020022/angular-2-unit-tests-cannot-find-name-describe/39945169#39945169
import {} from 'jasmine';
import {RelationBuilder} from "../scaffold-model";

import * as THREE from 'three';

function expectTransforms(trans: THREE.Matrix4, from: THREE.Vector3, to: THREE.Vector3) {
    let toObserved = from.clone().applyMatrix4(trans);
    expect(toObserved.distanceTo(to)).toBeLessThanOrEqual(1e-5);
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
});
