import * as THREE from 'three';

/**
 * Coordinate frame utilities.
 *
 * Frames (right-handed):
 *  - W: World / simulation frame (ENU): +X East, +Y North, +Z Up
 *  - B: Aircraft body frame (FRD): +x Forward, +y Right, +z Down
 *  - T: Three.js render frame: +X right, +Y up, +Z out of screen
 *  - M: Raw AC3D model authored frame (as imported)
 *
 * Quaternion naming:
 *  - q_AB maps vectors expressed in B into A.
 *    (i.e. v_A = q_AB ⊗ v_B ⊗ q_AB^{-1})
 */

// ---- World (ENU) <-> Three.js (T) ----
// To keep the mapping a proper rotation (det = +1), we use:
//   xT = xE
//   yT = zU
//   zT = -yN
// This keeps Three's +Y as "Up" and makes +Z point "South" in ENU terms.

export function worldToThreeVec(v_W) {
  return new THREE.Vector3(v_W.x, v_W.z, -v_W.y);
}

export function threeToWorldVec(v_T) {
  return new THREE.Vector3(v_T.x, -v_T.z, v_T.y);
}

// Constant basis-change rotation: W -> T.
// Matrix columns are images of W basis expressed in T:
//   eX_W -> (1,0,0)_T
//   eY_W -> (0,0,-1)_T
//   eZ_W -> (0,1,0)_T
const R_TW = new THREE.Matrix4().set(
  1, 0, 0, 0,
  0, 0, 1, 0,
  0, -1, 0, 0,
  0, 0, 0, 1
);

export const q_TW = new THREE.Quaternion().setFromRotationMatrix(R_TW);

/**
 * Convert a body attitude quaternion (q_WB) into Three.js (q_TB).
 * q_WB: maps Body -> World. q_TW: maps World -> Three.
 * Result q_TB maps Body -> Three.
 */
export function worldToThreeQuat(q_WB) {
  return new THREE.Quaternion().multiplyQuaternions(q_TW, q_WB);
}

// ---- Model (AC3D) -> Body (FRD) ----
// Observed authored model basis:
//   forward ≈ -X_M, up ≈ +Y_M, left ≈ +Z_M
// Desired Body FRD:
//   x_B forward, y_B right, z_B down
// Mapping (Model -> Body):
//   x_B = -x_M
//   y_B = -z_M
//   z_B = -y_M
const R_BM = new THREE.Matrix4().set(
  -1, 0, 0, 0,
   0, 0, -1, 0,
   0, -1, 0, 0,
   0, 0, 0, 1
);

/** Fixed quaternion mapping Model -> Body (q_BM). */
export const q_BM = new THREE.Quaternion().setFromRotationMatrix(R_BM);
