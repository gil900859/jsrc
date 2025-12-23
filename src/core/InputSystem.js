// dev/src/core/InputSystem.js
export class InputSystem {
    constructor() {
        this.STORAGE_KEY = "rc_sim_v2_config";
        this.gpIndex = -1;
        this.isCalibrating = false;
        
        // Keyboard State
        this.keys = {};
        this.keyboardThrottle = -1.0; // Starts at bottom

        // Default Config
        this.config = {
            inputSource: 'keyboard', // 'keyboard' or 'gp-0', 'gp-1', etc.
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
        this.initKeyboard();

        window.addEventListener("gamepadconnected", (e) => {
            console.log("Gamepad connected:", e.gamepad.id);
            this.updateGpIndex();
        });

        window.addEventListener("gamepaddisconnected", () => {
            this.updateGpIndex();
        });
    }

    initKeyboard() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            
            // Throttle 1-9 logic
            if (e.key >= '1' && e.key <= '9') {
                const val = parseInt(e.key);
                // Map 1..9 to -1.0..1.0
                // 1 -> -1.0, 5 -> 0.0, 9 -> 1.0
                this.keyboardThrottle = -1.0 + ((val - 1) * (2.0 / 8.0));
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
    }

    updateGpIndex() {
        if (this.config.inputSource.startsWith('gp-')) {
            this.gpIndex = parseInt(this.config.inputSource.split('-')[1]);
        } else {
            this.gpIndex = -1;
        }
    }

    load() {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if(raw) {
            try {
                const data = JSON.parse(raw);
                if(data.inputSource) this.config.inputSource = data.inputSource;
                if(data.mappings) this.config.mappings = data.mappings;
                if(data.calibration) this.config.calibration = data.calibration;
                this.updateGpIndex();
            } catch(e) { 
                console.error("Config load failed", e); 
            }
        }
    }

    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.config));
    }

    getValue(actionName) {
        if (this.config.inputSource === 'keyboard') {
            return this.getKeyboardValue(actionName);
        }
        return this.getGamepadValue(actionName);
    }

    getKeyboardValue(actionName) {
        const sensitivity = 0.75;

        switch(actionName) {
            case 'roll':
                if (this.keys['ArrowLeft']) return -sensitivity;
                if (this.keys['ArrowRight']) return sensitivity;
                return 0;
            case 'pitch':
                // Up arrow = Stick Forward (typically negative pitch value/nose down)
                if (this.keys['ArrowUp']) return sensitivity;
                if (this.keys['ArrowDown']) return -sensitivity;
                return 0;
            case 'yaw':
                if (this.keys['BracketLeft']) return -sensitivity;
                if (this.keys['BracketRight']) return sensitivity;
                return 0;
            case 'throttle':
                return this.keyboardThrottle;
            default:
                return 0;
        }
    }

    getGamepadValue(actionName) {
        const gp = navigator.getGamepads()[this.gpIndex];
        if(!gp) {
            return (actionName === 'throttle') ? -1.0 : 0.0;
        }

        const map = this.config.mappings[actionName];
        if(!map || map.axis === -1) return 0;

        let raw = gp.axes[map.axis];
        if(raw === undefined) return 0;

        // 1. Calibration Step (Recording)
        if(this.isCalibrating) {
            if(raw < this.config.calibration[map.axis].min) this.config.calibration[map.axis].min = raw;
            if(raw > this.config.calibration[map.axis].max) this.config.calibration[map.axis].max = raw;
            return raw;
        }

        // 2. Normalization Step
        const cal = this.config.calibration[map.axis];
        const range = cal.max - cal.min;
        let val = 0;
        
        if(range > 0.0001) {
            const pct = (raw - cal.min) / range;
            val = (pct * 2) - 1;
        }

        // 3. Inversion Step
        if(map.invert) val *= -1;

        return Math.max(-1, Math.min(1, val));
    }
    
    startCalibration() {
        if (this.config.inputSource === 'keyboard') return;
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
