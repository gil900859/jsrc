// dev/src/core/UIManager.js
export class UIManager {
    constructor(inputSystem, aircraft) {
        this.inputSystem = inputSystem;
        this.aircraft = aircraft;
        
        // DOM Cache
        this.modal = document.getElementById('settings-modal');
        this.mappingContainer = document.getElementById('mapping-container');
        this.btnCalibrate = document.getElementById('btn-calibrate');
        this.btnToggleModel = document.getElementById('btn-toggle-model');
        this.calStatus = document.getElementById('cal-status');
        this.statusText = document.getElementById('status');
        this.inputSourceSelect = document.getElementById('input-source-select');
        
        this.initEvents();
        this.updateGamepadList();
    }

    initEvents() {
        document.getElementById('btn-config').onclick = () => { 
            this.modal.style.display = 'flex'; 
            this.buildMappingUI();
        };
        
        document.getElementById('btn-close').onclick = () => { 
            this.modal.style.display = 'none'; 
            this.inputSystem.save();
        };
        
        document.getElementById('btn-reset').onclick = () => {
            if(confirm("Reset all controls?")) {
                localStorage.removeItem(this.inputSystem.STORAGE_KEY);
                location.reload();
            }
        };

        this.btnToggleModel.onclick = () => {
            const isFModel = this.aircraft.toggleView();
            this.btnToggleModel.innerText = isFModel ? "✈ View: Flight Model" : "✈ View: Visual Model";
            this.btnToggleModel.style.background = isFModel ? "#525" : "#255";
        };

        this.btnCalibrate.onclick = () => this.toggleCalibration();

        this.inputSourceSelect.onchange = (e) => {
            this.inputSystem.config.inputSource = e.target.value;
            this.inputSystem.updateGpIndex();
            this.inputSystem.save();
            this.buildMappingUI(); // Refresh UI visibility
        };

        window.addEventListener("gamepadconnected", () => this.updateGamepadList());
        window.addEventListener("gamepaddisconnected", () => this.updateGamepadList());
    }

    updateGamepadList() {
        const currentSource = this.inputSystem.config.inputSource;
        
        // Clear and add Keyboard at top
        this.inputSourceSelect.innerHTML = `<option value="keyboard">Keyboard</option>`;
        
        const gps = navigator.getGamepads();
        let connectedCount = 0;

        for (let i = 0; i < gps.length; i++) {
            if (gps[i]) {
                const opt = document.createElement('option');
                opt.value = `gp-${i}`;
                opt.innerText = `Gamepad ${i}: ${gps[i].id.substring(0, 20)}...`;
                this.inputSourceSelect.appendChild(opt);
                connectedCount++;
            }
        }

        this.inputSourceSelect.value = currentSource;

        if (currentSource === 'keyboard') {
            this.statusText.innerText = "Input: Keyboard";
            this.statusText.style.color = "#0af";
        } else {
            const gp = navigator.getGamepads()[this.inputSystem.gpIndex];
            this.statusText.innerText = gp ? "Input: " + gp.id.substring(0, 15) + "..." : "Gamepad Disconnected";
            this.statusText.style.color = gp ? "#0f0" : "#f00";
        }
    }

    toggleCalibration() {
        if (this.inputSystem.config.inputSource === 'keyboard') return;

        if(!this.inputSystem.isCalibrating) {
            this.inputSystem.startCalibration();
            this.btnCalibrate.innerText = "STOP & SAVE";
            this.btnCalibrate.style.background = "#a33";
            this.calStatus.innerText = "Move sticks to all extents...";
            this.calStatus.className = "cal-active";
        } else {
            this.inputSystem.stopCalibration();
            this.btnCalibrate.innerText = "Start Calibration";
            this.btnCalibrate.style.background = "";
            this.calStatus.innerText = "Calibration Saved.";
            this.calStatus.className = "";
        }
    }

    buildMappingUI() {
        this.mappingContainer.innerHTML = '';
        
        const isKeyboard = this.inputSystem.config.inputSource === 'keyboard';
        
        if (isKeyboard) {
            this.mappingContainer.innerHTML = `
                <div style="color: #aaa; font-size: 0.9em; line-height: 1.6em;">
                    <strong>Keyboard Controls:</strong><br>
                    • Right Stick: Arrow Keys<br>
                    • Rudder: [ and ] keys<br>
                    • Throttle: 1-9 keys<br>
                    <p style="color: #666; font-style: italic;">Channel mapping is only available for Gamepads.</p>
                </div>
            `;
            this.btnCalibrate.disabled = true;
            this.btnCalibrate.style.opacity = 0.5;
            return;
        }

        this.btnCalibrate.disabled = false;
        this.btnCalibrate.style.opacity = 1.0;

        ['roll', 'pitch', 'yaw', 'throttle'].forEach(key => {
            const map = this.inputSystem.config.mappings[key];
            const row = document.createElement('div');
            row.style.marginBottom = "10px";
            row.innerHTML = `
                <label style="display:inline-block; width:80px; text-transform:capitalize;">${key}</label>
                <select id="map-ax-${key}" style="width:60px">
                    <option value="-1">None</option>
                    ${Array.from({length:12}, (_,i)=>`<option value="${i}">Ax ${i}</option>`).join('')}
                </select>
                <label><input type="checkbox" id="map-inv-${key}"> Inv</label>
                <span id="ui-val-${key}" style="float:right; font-family:monospace; color:#0f0">0.00</span>
            `;
            this.mappingContainer.appendChild(row);

            const sel = row.querySelector('select');
            const chk = row.querySelector('input');
            sel.value = map.axis;
            chk.checked = map.invert;

            sel.onchange = (e) => { this.inputSystem.config.mappings[key].axis = parseInt(e.target.value); };
            chk.onchange = (e) => { this.inputSystem.config.mappings[key].invert = e.target.checked; };
        });
    }

    update() {
        const roll = this.inputSystem.getValue('roll');
        const pitch = this.inputSystem.getValue('pitch');
        const yaw = this.inputSystem.getValue('yaw');
        const throttle = this.inputSystem.getValue('throttle');

        if(this.modal.style.display !== 'none') {
            ['roll', 'pitch', 'yaw', 'throttle'].forEach(key => {
                const el = document.getElementById(`ui-val-${key}`);
                if(el) el.innerText = this.inputSystem.getValue(key).toFixed(2);
            });
        }
        
        // Always update dots if visualizer elements exist
        this.moveDot('v-dot-left', yaw, throttle);
        this.moveDot('v-dot-right', roll, pitch);
    }

    moveDot(id, x, y) {
        const el = document.getElementById(id);
        if(!el) return;
        el.style.left = (50 + (x * 50)) + "%";
        el.style.top  = (50 - (y * 50)) + "%";
    }
}