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
        this.simulator.add(this.aircraft.group);

        // Initialize UI (Needs aircraft reference for the toggle button)
        this.uiManager = new UIManager(this.inputSystem, this.aircraft);
        
        this.ac3dLoader = new AC3DLoader();

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
            
            // 1. Update UI (Visualizers and HUD)
            this.uiManager.update();

            // 2. Update Aircraft Visuals (Control surfaces/Props)
            // This now articulates the visible model
            this.aircraft.update(this.inputSystem);

            // 3. Render Scene
            this.simulator.render();
        };
        loop();
    }
}

// Start Application
new App();