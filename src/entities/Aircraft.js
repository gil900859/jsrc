import * as THREE from 'three';
import { worldToThreeQuat, worldToThreeVec, q_BM } from '../math/Frames.js';

export class Aircraft {
    constructor() {
        // Render root in Three.js coordinates (T).
        // This node carries the aircraft pose coming from simulation state (World ENU).
        this.root_T = new THREE.Group();

        // Model root that applies the fixed Model->Body correction once.
        // Children under this node are expected to be authored in AC3D model coordinates (M).
        this.ac3dRoot_B = new THREE.Group();
        this.ac3dRoot_B.quaternion.copy(q_BM);
        this.root_T.add(this.ac3dRoot_B);

        // --- Authoritative simulation state (explicit frames) ---
        // State lives only in World (W) and Body (B) frames.
        // Rendering reads an interpolated pose derived from this state.

        // q_WB: attitude quaternion (Body -> World).
        // Default: aircraft pointing North and upright.
        // World frame (W) is ENU:  +X=East, +Y=North, +Z=Up.
        // Body frame (B) is FRD:  +X=Forward, +Y=Right, +Z=Down.
        // We want:
        //   Forward_B (+X) -> North_W (+Y)
        //   Right_B   (+Y) -> East_W  (+X)
        //   Down_B    (+Z) -> Down_W  (-Z)
        // This keeps the airplane "up side up" (Up_B = -Z_B aligns with Up_W = +Z).
        const q_WB_init = new THREE.Quaternion();
        {
            const f_W = new THREE.Vector3(0, 1, 0);   // North
            const r_W = new THREE.Vector3(1, 0, 0);   // East
            const d_W = new THREE.Vector3(0, 0, -1);  // Down

            // Columns are the images of the body basis vectors expressed in World.
            // (i.e., this is the Body->World rotation.)
            const m = new THREE.Matrix4().makeBasis(f_W, r_W, d_W);
            q_WB_init.setFromRotationMatrix(m);
        }

        // Previous/current state for render interpolation.
        this.statePrev = {
            position_W: new THREE.Vector3(0, 0, 0),
            velocity_W: new THREE.Vector3(0, 0, 0),
            q_WB: q_WB_init.clone(),
            omega_B: new THREE.Vector3(0, 0, 0),
        };
        this.stateCurr = {
            position_W: new THREE.Vector3(0, 0, 0),
            velocity_W: new THREE.Vector3(0, 0, 0),
            q_WB: q_WB_init.clone(),
            omega_B: new THREE.Vector3(0, 0, 0),
        };

        // Scratch outputs (hooks for force-based physics / debugging)
        this.accel_W = new THREE.Vector3(0, 0, 0);
        this.alpha_B = new THREE.Vector3(0, 0, 0);
        
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
        this.maxPitchRateDeg = 70;  // about +Y_B (Right)
        this.maxYawRateDeg = 30;    // about +Z_B (Down)

        // --- Simple throttle -> forward speed model (kinematic for now) ---
        // throttleCmd is expected in [-1, +1]. We remap to [0, 1] and scale.
        // Units are meters/second.
        this.maxForwardSpeedMps = 20;
        this.maxForwardAccelMps2 = 8; // acceleration limit so speed doesn't jump instantly

        // Constant gravity in World ENU (+Z is up, so gravity is negative Z).
        this.gravityMps2 = 9.81;

        // Simple lift model so forward motion can counter gravity.
        // At trim speed, lift is approximately 1g when wings are level.
        this.trimLiftSpeedMps = 14;
        this.maxLiftAccelMps2 = 16;

        // Flat-earth ground plane to prevent infinite falling through terrain.
        this.groundHeightM = 0;
    }

    // Convenience accessors (treat as read-only outside physics stepping)
    get position_W() { return this.stateCurr.position_W; }
    get velocity_W() { return this.stateCurr.velocity_W; }
    get q_WB() { return this.stateCurr.q_WB; }
    get omega_B() { return this.stateCurr.omega_B; }

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

        // Apply initial pose (explicit).
        this.applyRenderPose(1.0);
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

    // --- PHYSICS (fixed-rate) ---
    // Updates only authoritative state. Never touches Three.js scene graph.
    stepPhysics(inputSystem, dt) {
        if (!(dt > 0)) return;

        // Preserve previous state for interpolation.
        this.statePrev.position_W.copy(this.stateCurr.position_W);
        this.statePrev.velocity_W.copy(this.stateCurr.velocity_W);
        this.statePrev.q_WB.copy(this.stateCurr.q_WB);
        this.statePrev.omega_B.copy(this.stateCurr.omega_B);

        // --- Angular motion (kinematic body-rate commands for now) ---
        // Inputs are assumed to be in [-1, +1]. We map them linearly to body rates.
        // Body frame is FRD: +X forward (roll), +Y right (pitch), +Z down (yaw).
        const rollCmd = inputSystem.getValue('roll');
        const pitchCmd = inputSystem.getValue('pitch');
        const yawCmd = inputSystem.getValue('yaw');

        const deg2rad = Math.PI / 180.0;
        const p = rollCmd * this.maxRollRateDeg * deg2rad;
        // Sign convention: Body frame is FRD (+Z is Down). A positive rotation about +Y_B
        // (right-hand rule) pitches the nose *down*.
        // We want stick-back (positive pitchCmd) to pitch the nose *up*, so negate.
        const q = -pitchCmd * this.maxPitchRateDeg * deg2rad;
        const r = yawCmd * this.maxYawRateDeg * deg2rad;

        const desiredOmega_B = new THREE.Vector3(p, q, r);

        // Hook: angular acceleration (for future torque-based physics)
        this.alpha_B.copy(desiredOmega_B).sub(this.stateCurr.omega_B).multiplyScalar(1.0 / dt);
        this.stateCurr.omega_B.copy(desiredOmega_B);

        // Integrate attitude from body angular velocity.
        const omega = this.stateCurr.omega_B;
        const w = omega.length();
        if (w > 1e-8) {
            const axis = omega.clone().multiplyScalar(1.0 / w);
            const angle = w * dt;
            // dq is a body-fixed incremental rotation over dt.
            // q_WB maps Body->World, so right-multiply by dq.
            const dq = new THREE.Quaternion().setFromAxisAngle(axis, angle);
            this.stateCurr.q_WB.multiply(dq).normalize();
        }

        // --- Translational motion (throttle -> desired forward velocity) ---
        // This is still a simple kinematic model, but it is expressed through
        // velocity and acceleration hooks so force-based physics can replace it.
        const throttleCmd = inputSystem.getValue('throttle');
        const throttle01 = Math.max(0, Math.min(1, (throttleCmd + 1) * 0.5));
        const targetSpeedMps = throttle01 * this.maxForwardSpeedMps;

        // Desired velocity is along body-forward (+X_B) expressed in World ENU.
        const forward_W = new THREE.Vector3(1, 0, 0).applyQuaternion(this.stateCurr.q_WB).normalize();
        const desiredVel_W = forward_W.multiplyScalar(targetSpeedMps);

        // Apply an acceleration limit to approach desired velocity.
        const dv_W = desiredVel_W.clone().sub(this.stateCurr.velocity_W);
        const maxDeltaV = this.maxForwardAccelMps2 * dt;
        if (dv_W.length() > maxDeltaV) {
            dv_W.setLength(maxDeltaV);
        }

        // Hook: linear acceleration includes propulsion, gravity, and simple lift.
        const accelProp_W = dv_W.multiplyScalar(1.0 / dt);
        const gravity_W = new THREE.Vector3(0, 0, -this.gravityMps2);

        const airspeedMps = this.stateCurr.velocity_W.length();
        const liftRatio = Math.min(airspeedMps / this.trimLiftSpeedMps, 2.0);
        const liftAccelMag = Math.min(this.gravityMps2 * liftRatio * liftRatio, this.maxLiftAccelMps2);

        // Body-frame up is -Z_B in FRD. Lift acts along this up direction.
        const up_W = new THREE.Vector3(0, 0, -1).applyQuaternion(this.stateCurr.q_WB).normalize();
        const lift_W = up_W.multiplyScalar(liftAccelMag);

        this.accel_W.copy(accelProp_W).add(gravity_W).add(lift_W);

        // Integrate velocity then position.
        this.stateCurr.velocity_W.addScaledVector(this.accel_W, dt);
        this.stateCurr.position_W.addScaledVector(this.stateCurr.velocity_W, dt);

        // Prevent sinking infinitely below the terrain plane.
        if (this.stateCurr.position_W.z < this.groundHeightM) {
            this.stateCurr.position_W.z = this.groundHeightM;
            if (this.stateCurr.velocity_W.z < 0) this.stateCurr.velocity_W.z = 0;
        }
    }

    // --- RENDER (render-rate) ---
    // Interpolates pose between previous and current physics states and applies it to root_T.
    applyRenderPose(alpha = 1.0) {
        const a = Math.max(0, Math.min(1, alpha));

        const pos_W = this.statePrev.position_W.clone().lerp(this.stateCurr.position_W, a);
        const q_WB = this.statePrev.q_WB.clone().slerp(this.stateCurr.q_WB, a);

        // root_T is in Three.js coordinates. Convert position and attitude from World ENU.
        this.root_T.position.copy(worldToThreeVec(pos_W));
        this.root_T.quaternion.copy(worldToThreeQuat(q_WB));
    }

    // Visual-only articulation (control surfaces, prop spin, etc.).
    // Never modifies authoritative physics state.
    updateVisuals(inputSystem, dt = 0) {
        // If models aren't loaded yet, we're done (axes will still show orientation).
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

    // Backward-compatible convenience for older code paths.
    // Keeps behavior similar to the old variable-timestep update.
    update(inputSystem, dt = 0) {
        if (dt > 0) this.stepPhysics(inputSystem, dt);
        this.applyRenderPose(1.0);
        this.updateVisuals(inputSystem, dt);
    }
}
