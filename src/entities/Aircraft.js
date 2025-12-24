import * as THREE from 'three';
import { worldToThreeQuat, worldToThreeVec, q_BM } from '../math/Frames.js';
import { createBodyFrameAxes } from '../visual/VectorIndicators.js';

export class Aircraft {
    constructor() {
        // Render root in Three.js coordinates (T).
        // This node carries the aircraft pose coming from simulation state (World ENU).
        this.root_T = new THREE.Group();

        // Body (aircraft) frame indicator axes.
        // These attach to root_T (Body pose) so they are NOT affected by the Model->Body correction.
        this.bodyAxes_B = createBodyFrameAxes({ length: 2 });
        this.root_T.add(this.bodyAxes_B);

        // Model root that applies the fixed Model->Body correction once.
        // Children under this node are expected to be authored in AC3D model coordinates (M).
        this.ac3dRoot_B = new THREE.Group();
        this.ac3dRoot_B.quaternion.copy(q_BM);
        this.root_T.add(this.ac3dRoot_B);

        // --- Simulation state (explicit frames) ---
        // position_W: World ENU position of aircraft reference point.
        this.position_W = new THREE.Vector3(0, 0, 0);

        // q_WB: attitude quaternion (Body -> World).
        // Default: aircraft pointing North and upright.
        // World frame (W) is ENU:  +X=East, +Y=North, +Z=Up.
        // Body frame (B) is FRD:  +X=Forward, +Y=Right, +Z=Down.
        // We want:
        //   Forward_B (+X) -> North_W (+Y)
        //   Right_B   (+Y) -> East_W  (+X)
        //   Down_B    (+Z) -> Down_W  (-Z)
        // This keeps the airplane "up side up" (Up_B = -Z_B aligns with Up_W = +Z).
        this.q_WB = new THREE.Quaternion();
        {
            const f_W = new THREE.Vector3(0, 1, 0);   // North
            const r_W = new THREE.Vector3(1, 0, 0);   // East
            const d_W = new THREE.Vector3(0, 0, -1);  // Down

            // Columns are the images of the body basis vectors expressed in World.
            // (i.e., this is the Body->World rotation.)
            const m = new THREE.Matrix4().makeBasis(f_W, r_W, d_W);
            this.q_WB.setFromRotationMatrix(m);
        }
        
        this.visualModel = null;
        this.fModel = null;
        this.showFlightModel = false;

        // Caches for control surfaces for both models
        this.visualCache = {};
        this.fModelCache = {};
        
        // Logical mapping of inputs to model meshes
        // Multiplier for Elevator is set to -1 to ensure stick "back" = Elevator "up"
        this.surfaceConfig = [
            { name: "LAeleron.LAeleron", input: 'roll',     scale: 0.4, multiplier: -1 }, 
            { name: "RAeleron.RAeleron", input: 'roll',     scale: 0.4, multiplier: 1 }, 
            { name: "Elevator.Elevator", input: 'pitch',    scale: 0.4, multiplier: -1 }, 
            { name: "Ruder.Ruder",       input: 'yaw',      scale: 0.4, multiplier: 1 },
            { name: "Propeller.Prop",    input: 'throttle', isProp: true } 
        ];

        // --- Body-rate limits (deg/s) ---
        this.maxRollRateDeg = 80;   // about +X_B (Forward)
        this.maxPitchRateDeg = 50;  // about +Y_B (Right)
        this.maxYawRateDeg = 30;    // about +Z_B (Down)

        // --- Simple throttle -> forward speed model ---
        // throttleCmd is expected in [-1, +1]. We remap to [0, 1] and scale.
        // Units here are meters/second in the World ENU frame.
        this.maxForwardSpeedMps = 20;
        this.maxForwardAccelMps2 = 8; // smoothing so speed doesn't jump instantly
        this.forwardSpeedMps = 0;
    }

    setModels(visualGroup, fmodelGroup) {
        this.visualModel = visualGroup;
        this.fModel = fmodelGroup;

        // Both meshes live under the model root (Model->Body correction applies to both).
        this.ac3dRoot_B.add(this.visualModel);
        this.ac3dRoot_B.add(this.fModel);

        // Build caches for both
        this.visualCache = this._buildCache(this.visualModel);
        this.fModelCache = this._buildCache(this.fModel);

        this.updateView();

        // Apply initial pose (identity, but explicit).
        this._applyPoseToRenderRoot();
    }

    _buildCache(root) {
        const cache = {};
        root.traverse(child => {
            if (child.isMesh) {
                cache[child.name] = child;
            }
        });
        return cache;
    }

    toggleView() {
        this.showFlightModel = !this.showFlightModel;
        this.updateView();
        return this.showFlightModel;
    }

    updateView() {
        if (this.visualModel) this.visualModel.visible = !this.showFlightModel;
        if (this.fModel) this.fModel.visible = this.showFlightModel;
    }

    update(inputSystem, dt = 0) {
        // 1) Integrate attitude from commanded body angular rates.
        // Inputs are assumed to be in [-1, +1]. We map them linearly to body rates.
        // Body frame is FRD: +X forward (roll), +Y right (pitch), +Z down (yaw).
        if (dt > 0) {
            const rollCmd = inputSystem.getValue('roll');
            const pitchCmd = inputSystem.getValue('pitch');
            const yawCmd = inputSystem.getValue('yaw');

            const deg2rad = Math.PI / 180.0;
            const p = rollCmd * this.maxRollRateDeg * deg2rad;
            // Sign convention: Body frame is FRD (+Z is Down). A positive rotation about +Y_B
            // (right-hand rule) pitches the nose *down* (Forward rotates toward Down).
            // We want stick-back (positive pitchCmd in the visualizer) to pitch the nose *up*,
            // so we negate the pitch command when turning it into a body pitch rate.
            const q = -pitchCmd * this.maxPitchRateDeg * deg2rad;
            const r = yawCmd * this.maxYawRateDeg * deg2rad;

            const omega = new THREE.Vector3(p, q, r);
            const w = omega.length();
            if (w > 1e-8) {
                const axis = omega.clone().multiplyScalar(1.0 / w);
                const angle = w * dt;

                // dq represents a body-fixed incremental rotation over dt.
                // q_WB maps Body->World, so we right-multiply by dq.
                const dq = new THREE.Quaternion().setFromAxisAngle(axis, angle);
                this.q_WB.multiply(dq).normalize();
            }

            // 1b) Integrate position from throttle-commanded forward speed.
            // Body frame is FRD, so forward is +X_B.
            const throttleCmd = inputSystem.getValue('throttle');
            const throttle01 = Math.max(0, Math.min(1, (throttleCmd + 1) * 0.5));
            const targetSpeedMps = throttle01 * this.maxForwardSpeedMps;

            // Smooth the commanded speed with an acceleration limit.
            const maxDeltaV = this.maxForwardAccelMps2 * dt;
            const dv = targetSpeedMps - this.forwardSpeedMps;
            if (Math.abs(dv) <= maxDeltaV) {
                this.forwardSpeedMps = targetSpeedMps;
            } else {
                this.forwardSpeedMps += Math.sign(dv) * maxDeltaV;
            }

            // Convert body-forward direction into World ENU, then integrate position.
            const forward_B = new THREE.Vector3(1, 0, 0);
            const forward_W = forward_B.applyQuaternion(this.q_WB).normalize();
            this.position_W.addScaledVector(forward_W, this.forwardSpeedMps * dt);
        }

        // 2) Apply pose to render root every frame.
        this._applyPoseToRenderRoot();

        // 3) If models aren't loaded yet, we're done (axes will still show orientation).
        if (!this.visualModel || !this.fModel) return;

        // Determine which set of meshes to articulate
        const activeCache = this.showFlightModel ? this.fModelCache : this.visualCache;

        this.surfaceConfig.forEach(config => {
            const mesh = activeCache[config.name];
            if (!mesh) return;

            if (config.isProp) {
                const throttleCmd = inputSystem.getValue('throttle');
                // Use the shaft axis calculated by the loader (in model frame M, mesh-local)
                const hingeAxis_M = mesh.userData.hingeAxis_M || new THREE.Vector3(1, 0, 0);
                // Propeller rotation speed based on throttle input (-1..1)
                const speed = (throttleCmd + 1.1) * 0.4;
                mesh.rotateOnAxis(hingeAxis_M, speed);
            } else {
                // These are *control deflection commands* (not attitude):
                //   rollCmd ~ aileron deflection (deltaA)
                //   pitchCmd ~ elevator deflection (deltaE)
                //   yawCmd ~ rudder deflection (deltaR)
                const cmd = inputSystem.getValue(config.input);
                const multiplier = config.multiplier || 1;
                const angle = cmd * multiplier * config.scale;

                if (mesh.userData.hingeAxis_M) {
                    // Apply absolute rotation around the calculated hinge axis (mesh-local, model frame M)
                    mesh.quaternion.setFromAxisAngle(mesh.userData.hingeAxis_M, angle);
                } else {
                    // Fallback to local Z rotation
                    mesh.rotation.z = angle;
                }
            }
        });
    }

    _applyPoseToRenderRoot() {
        // root_T is in Three.js coordinates. Convert position and attitude from World ENU.
        this.root_T.position.copy(worldToThreeVec(this.position_W));
        this.root_T.quaternion.copy(worldToThreeQuat(this.q_WB));
    }
}
