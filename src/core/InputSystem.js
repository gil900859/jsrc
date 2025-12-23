export class InputSystem {
    constructor() {
        this.STORAGE_KEY = "rc_sim_v2_config";
        this.gpIndex = -1;
        this.isCalibrating = false;
        
        // Default Config
        this.config = {
            mappings: {
                roll: { axis: 0, invert: false },
                pitch: { axis: 1, invert: true },
                throttle: { axis: 2, invert: false },
                yaw: { axis: 5, invert: false }
            },
            calibration: {} 
        };
        
        // Initialize 16 axes with default -1..1 calibration
        for(let i=0; i<16; i++) {
            this.config.calibration[i] = { min: -1.0, max: 1.0 };
        }
        
        this.load();
        
        window.addEventListener("gamepadconnected", (e) => {
            this.gpIndex = e.gamepad.index;
            console.log("Gamepad connected:", e.gamepad.id);
        });
    }

    load() {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if(raw) {
            try {
                const data = JSON.parse(raw);
                if(data.mappings) this.config.mappings = data.mappings;
                if(data.calibration) this.config.calibration = data.calibration;
            } catch(e) { 
                console.error("Config load failed", e); 
            }
        }
    }

    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.config));
    }

    /**
     * The single source of truth for axis data.
     * Logic Flow: Raw Gamepad -> Calibration (Normalization) -> Inversion
     */
    getValue(actionName) {
        if(this.gpIndex === -1) {
            // Default: Throttle at bottom (-1), others centered (0)
            return (actionName === 'throttle') ? -1.0 : 0.0;
        }

        const gp = navigator.getGamepads()[this.gpIndex];
        if(!gp) return 0;

        const map = this.config.mappings[actionName];
        if(!map || map.axis === -1) return 0;

        let raw = gp.axes[map.axis];
        if(raw === undefined) return 0;

        // 1. Calibration Step (Recording)
        if(this.isCalibrating) {
            if(raw < this.config.calibration[map.axis].min) this.config.calibration[map.axis].min = raw;
            if(raw > this.config.calibration[map.axis].max) this.config.calibration[map.axis].max = raw;
            return raw; // Return raw during calibration for visual feedback
        }

        // 2. Normalization Step (Apply Calibration)
        const cal = this.config.calibration[map.axis];
        const range = cal.max - cal.min;
        let val = 0;
        
        if(range > 0.0001) {
            const pct = (raw - cal.min) / range; // 0..1
            val = (pct * 2) - 1; // -1..1
        }

        // 3. Inversion Step
        if(map.invert) {
            val *= -1;
        }

        return Math.max(-1, Math.min(1, val));
    }
    
    startCalibration() {
        this.isCalibrating = true;
        const gp = navigator.getGamepads()[this.gpIndex];
        if(gp) {
            gp.axes.forEach((val, i) => {
                this.config.calibration[i] = { min: val, max: val };
            });
        }
    }

    stopCalibration() {
        this.isCalibrating = false;
        this.save();
    }
}