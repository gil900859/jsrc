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
        
        this.initEvents();
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

        window.addEventListener("gamepadconnected", (e) => {
            this.statusText.innerText = "Gamepad: " + e.gamepad.id.substring(0, 15) + "...";
            this.statusText.style.color = "#0f0";
        });
    }

    toggleCalibration() {
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

        document.getElementById('d-roll').innerText = roll.toFixed(2);
        document.getElementById('d-pitch').innerText = pitch.toFixed(2);
        document.getElementById('d-yaw').innerText = yaw.toFixed(2);
        document.getElementById('d-thr').innerText = throttle.toFixed(2);

        if(this.modal.style.display !== 'none') {
            ['roll', 'pitch', 'yaw', 'throttle'].forEach(key => {
                const el = document.getElementById(`ui-val-${key}`);
                if(el) el.innerText = this.inputSystem.getValue(key).toFixed(2);
            });

            this.moveDot('v-dot-left', yaw, throttle);
            this.moveDot('v-dot-right', roll, pitch);
        }
    }

    moveDot(id, x, y) {
        const el = document.getElementById(id);
        if(!el) return;
        el.style.left = (50 + (x * 50)) + "%";
        el.style.top  = (50 - (y * 50)) + "%";
    }
}