import * as THREE from 'three';
import { worldToThreeVec } from '../math/Frames.js';

/**
 * Build a solid (mesh-based) arrow so we can control apparent thickness.
 * Arrow is built in its local frame pointing along +Y, then rotated to `dir`.
 */
function makeArrow({
    dir,
    length,
    color,
    shaftRadius = 0.01,
    headRadius = 0.03,
    headLength = 0.25,
}) {
    const group = new THREE.Group();

    const direction = dir.clone();
    const dirLen = direction.length();
    if (dirLen < 1e-9) return group;
    direction.divideScalar(dirLen);

    const mat = new THREE.MeshBasicMaterial({ color });

    const shaftLength = Math.max(0, length - headLength);
    if (shaftLength > 0) {
        const shaftGeom = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 16);
        const shaft = new THREE.Mesh(shaftGeom, mat);
        shaft.position.set(0, shaftLength / 2, 0);
        group.add(shaft);
    }

    const headGeom = new THREE.ConeGeometry(headRadius, headLength, 20);
    const head = new THREE.Mesh(headGeom, mat);
    head.position.set(0, shaftLength + headLength / 2, 0);
    group.add(head);

    // Rotate +Y to desired direction.
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    group.quaternion.copy(q);

    return group;
}

export function createThreeFrameAxes({ length = 5 } = {}) {
    const g = new THREE.Group();
    g.name = 'ThreeFrameAxes_T';

    g.add(makeArrow({ dir: new THREE.Vector3(1, 0, 0), length, color: 0xff0000 })); // +x (red)
    g.add(makeArrow({ dir: new THREE.Vector3(0, 1, 0), length, color: 0x00ff00 })); // +y (green)
    g.add(makeArrow({ dir: new THREE.Vector3(0, 0, 1), length, color: 0x0000ff })); // +z (blue)

    return g;
}

export function createWorldFrameAxes({ length = 3, shaftRadius = 0.03, headRadius = 0.07 } = {}) {
    const g = new THREE.Group();
    g.name = 'WorldFrameAxes_W';

    // World (ENU): East = +X, North = +Y, Up = +Z
    const east_T = worldToThreeVec(new THREE.Vector3(1, 0, 0)).normalize();
    const north_T = worldToThreeVec(new THREE.Vector3(0, 1, 0)).normalize();
    const up_T = worldToThreeVec(new THREE.Vector3(0, 0, 1)).normalize();

    g.add(makeArrow({ dir: north_T, length, color: 0x00ffff, shaftRadius, headRadius, headLength: 0.35 })); // North (cyan)
    g.add(makeArrow({ dir: east_T, length, color: 0xff00ff, shaftRadius, headRadius, headLength: 0.35 }));  // East (magenta)
    g.add(makeArrow({ dir: up_T, length, color: 0xffff00, shaftRadius, headRadius, headLength: 0.35 }));    // Up (yellow)

    return g;
}

export function createBodyFrameAxes({ length = 2, shaftRadius = 0.02, headRadius = 0.05 } = {}) {
    const g = new THREE.Group();
    g.name = 'BodyFrameAxes_B';

    // Body (FRD): Forward = +X, Right = +Y, Down = +Z
    // User requested Forward, Right, and *Up*; Up is -Z in FRD.
    g.add(makeArrow({ dir: new THREE.Vector3(1, 0, 0), length, color: 0x000000, shaftRadius, headRadius })); // Forward (black)
    g.add(makeArrow({ dir: new THREE.Vector3(0, 1, 0), length, color: 0xffffff, shaftRadius, headRadius })); // Right (white)
    g.add(makeArrow({ dir: new THREE.Vector3(0, 0, -1), length, color: 0x808080, shaftRadius, headRadius })); // Up (gray)

    return g;
}
