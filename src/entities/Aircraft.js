import * as THREE from 'three';

export class Aircraft {
    constructor() {
        this.group = new THREE.Group();
        
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
    }

    setModels(visualGroup, fmodelGroup) {
        this.visualModel = visualGroup;
        this.fModel = fmodelGroup;

        this.group.add(this.visualModel);
        this.group.add(this.fModel);

        // Build caches for both
        this.visualCache = this._buildCache(this.visualModel);
        this.fModelCache = this._buildCache(this.fModel);

        this.updateView();
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

    update(inputSystem) {
        if (!this.visualModel || !this.fModel) return;

        // Determine which set of meshes to articulate
        const activeCache = this.showFlightModel ? this.fModelCache : this.visualCache;

        this.surfaceConfig.forEach(config => {
            const mesh = activeCache[config.name];
            if (!mesh) return;

            if (config.isProp) {
                const thr = inputSystem.getValue('throttle');
                // Use the shaft axis calculated by the loader (shortest vector)
                const axis = mesh.userData.hingeAxis || new THREE.Vector3(1, 0, 0);
                // Propeller rotation speed based on throttle input (-1..1)
                const speed = (thr + 1.1) * 0.4; 
                mesh.rotateOnAxis(axis, speed);
            } else {
                const val = inputSystem.getValue(config.input);
                const multiplier = config.multiplier || 1;
                const angle = val * multiplier * config.scale;

                if (mesh.userData.hingeAxis) {
                    // Apply absolute rotation around the calculated hinge axis
                    mesh.quaternion.setFromAxisAngle(mesh.userData.hingeAxis, angle);
                } else {
                    // Fallback to local Z rotation
                    mesh.rotation.z = angle;
                }
            }
        });
    }
}