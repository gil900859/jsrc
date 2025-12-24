import { Simulator } from './core/Simulator.js';
import { InputSystem } from './core/InputSystem.js';
import { UIManager } from './core/UIManager.js';
import { AC3DLoader } from './loaders/AC3DLoader.js';
import { Aircraft } from './entities/Aircraft.js';
import { createThreeFrameAxes, createWorldFrameAxes } from './visual/VectorIndicators.js';

class App {
    constructor() {
        // Initialize Systems
        this.simulator = new Simulator();
        this.inputSystem = new InputSystem();

        // --- Frame indicators ---
        // 1) Three.js (T) axes at the origin: +x red, +y green, +z blue
        this.simulator.add(createThreeFrameAxes({ length: 5 }));

        // 2) World (W / ENU) axes at the origin: North cyan, East magenta, Up yellow
        // Thicker + shorter to differentiate from Three.js axes
        this.simulator.add(createWorldFrameAxes({ length: 3, shaftRadius: 0.03, headRadius: 0.07 }));
        
        // Initialize Entities
        this.aircraft = new Aircraft();
        this.simulator.add(this.aircraft.root_T);

        // Initialize UI (Needs aircraft reference for the toggle button)
        this.uiManager = new UIManager(this.inputSystem, this.aircraft);
        
        this.ac3dLoader = new AC3DLoader();

        // Animation timing
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

            // Delta time in seconds (clamped to avoid huge jumps when tab is backgrounded)
            const now = performance.now();
            let dt = (now - this._lastT) / 1000.0;
            this._lastT = now;
            dt = Math.max(0, Math.min(0.05, dt));
            
            // 1. Update UI (Visualizers and HUD)
            this.uiManager.update();

            // 2. Update Aircraft Visuals (Control surfaces/Props)
            // This now articulates the visible model
            this.aircraft.update(this.inputSystem, dt);

            // 3. Render Scene
            this.simulator.render();
        };
        loop();
    }
}

// Start Application
new App();