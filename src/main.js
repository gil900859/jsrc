import { Simulator } from './core/Simulator.js';
import { InputSystem } from './core/InputSystem.js';
import { UIManager } from './core/UIManager.js';
import { AC3DLoader } from './loaders/AC3DLoader.js';
import { Aircraft } from './entities/Aircraft.js';

class App {
    constructor() {
        // Initialize Systems
        this.simulator = new Simulator();
        this.inputSystem = new InputSystem();

        // Initialize Entities
        this.aircraft = new Aircraft();
        this.simulator.add(this.aircraft.root_T);

        // Initialize UI (Needs aircraft reference for the toggle button)
        this.uiManager = new UIManager(this.inputSystem, this.aircraft);
        
        this.ac3dLoader = new AC3DLoader();

        // --- Simulation timing ---
        // Render runs at requestAnimationFrame rate.
        // Physics runs at a fixed timestep using an accumulator.
        this.fixedDt = 1 / 120; // seconds
        this.maxSubStepsPerFrame = 10; // avoid spiral-of-death on long hitches
        this._accumulator = 0;
        this._lastT = performance.now();

        this.init();
    }

    async init() {
        try {
            const visualPath = 'models/AileronTrainer/data/body.ac';
            const fmodelPath = 'models/AileronTrainer/data/fmodel.ac';

            console.log("Loading models...");
            
            // Load both models in parallel
            const [visualGroup, fmodelGroup] = await Promise.all([
                this.ac3dLoader.load(visualPath),
                this.ac3dLoader.load(fmodelPath)
            ]);
            
            this.aircraft.setModels(visualGroup, fmodelGroup);
            
            console.log("Aircraft models initialized.");
        } catch (e) {
            console.error("Failed to load aircraft models:", e);
        }

        // Start Loop
        this.run();
    }

    run() {
        const loop = () => {
            requestAnimationFrame(loop);

            // Render delta time in seconds (clamped to avoid huge jumps when tab is backgrounded)
            const now = performance.now();
            let frameDt = (now - this._lastT) / 1000.0;
            this._lastT = now;
            frameDt = Math.max(0, Math.min(0.05, frameDt));

            // 1) Input sampling (render-rate)
            // Update keyboard smoothing (no-op for gamepad)
            this.inputSystem.update(frameDt);

            // 2) Fixed-timestep physics stepping
            this._accumulator += frameDt;
            let substeps = 0;
            while (this._accumulator >= this.fixedDt && substeps < this.maxSubStepsPerFrame) {
                this.aircraft.stepPhysics(this.inputSystem, this.fixedDt);
                this._accumulator -= this.fixedDt;
                substeps++;
            }

            // 3) Render / animation (render-rate, interpolated)
            const alpha = (this.fixedDt > 0) ? (this._accumulator / this.fixedDt) : 1;
            this.aircraft.applyRenderPose(alpha);
            this.aircraft.updateVisuals(this.inputSystem, frameDt);
            
            // 4) UI (visualizers and HUD)
            this.uiManager.update();

            // 5) Render Scene
            this.simulator.render(this.aircraft.root_T.position);
        };
        loop();
    }
}

// Start Application
new App();