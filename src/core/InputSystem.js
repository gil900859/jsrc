// dev/src/core/InputSystem.js
export class InputSystem {
    constructor() {
        this.STORAGE_KEY = "rc_sim_v2_config";
        this.gpIndex = -1;
        this.isCalibrating = false;
        
        // Keyboard State
        this.keys = {};
        this.keyboardThrottle = -1.0; // Starts at bottom

        // Smoothed keyboard stick axes (aileron/elevator/rudder).
        // These emulate a spring-centered stick with a max slew rate.
        this.keyboardAxes = { roll: 0.0, pitch: 0.0, yaw: 0.0 };

        // Time (seconds) to go from 0 -> 1 when a key is held, and 1 -> 0 when released.
        // This defines the *relative* rate of change; feel free to tune.
        this.keyboardSlewTimeSec = 0.25;


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


    // Call once per frame with dt (seconds). This only affects keyboard inputs.
    update(dt) {
        if (this.config.inputSource !== 'keyboard') return;
        if (!dt || dt <= 0) return;

        const slew = 1.0 / Math.max(1e-6, this.keyboardSlewTimeSec); // units: per second
        const maxStep = slew * dt;

        const targetRoll =
            (this.keys['ArrowLeft'] ? -1 : 0) + (this.keys['ArrowRight'] ? 1 : 0);
        const targetPitch =
            (this.keys['ArrowUp'] ? 1 : 0) + (this.keys['ArrowDown'] ? -1 : 0);
        const targetYaw =
            (this.keys['BracketLeft'] ? -1 : 0) + (this.keys['BracketRight'] ? 1 : 0);

        // If opposing keys are held simultaneously, neutral wins (target becomes 0).
        const clampTarget = (v) => (v > 0 ? 1 : (v < 0 ? -1 : 0));

        this.keyboardAxes.roll = this._slewTo(this.keyboardAxes.roll, clampTarget(targetRoll), maxStep);
        this.keyboardAxes.pitch = this._slewTo(this.keyboardAxes.pitch, clampTarget(targetPitch), maxStep);
        this.keyboardAxes.yaw = this._slewTo(this.keyboardAxes.yaw, clampTarget(targetYaw), maxStep);
    }

    _slewTo(current, target, maxStep) {
        const delta = target - current;
        if (Math.abs(delta) <= maxStep) return target;
        return current + Math.sign(delta) * maxStep;
    }

    getValue(actionName) {
        if (this.config.inputSource === 'keyboard') {
            return this.getKeyboardValue(actionName);
        }
        return this.getGamepadValue(actionName);
    }

    getKeyboardValue(actionName) {
        switch(actionName) {
            case 'roll':
                return this.keyboardAxes.roll;
            case 'pitch':
                return this.keyboardAxes.pitch;
            case 'yaw':
                return this.keyboardAxes.yaw;
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
