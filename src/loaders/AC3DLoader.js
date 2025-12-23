import * as THREE from 'three';

export class AC3DLoader {
    constructor() { 
        this.textureLoader = new THREE.TextureLoader();
        this.baseUrl = "";
    }

    async load(url) {
        const lastSlash = url.lastIndexOf('/');
        this.baseUrl = (lastSlash !== -1) ? url.substring(0, lastSlash + 1) : '';

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Could not load model at ${url}`);
        
        const text = await response.text();
        return this.parse(text);
    }

    parse(text) {
        const group = new THREE.Group();
        const lines = text.split('\n');
        
        const objects = [];
        let currentObj = null;

        // --- Pass 1: Parse All Objects ---
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const parts = line.split(/\s+/);

            if (parts[0] === 'OBJECT') {
                currentObj = { 
                    name: 'Part', 
                    loc: [0,0,0], 
                    rawVerts: [], 
                    surfaces: [], 
                    texture: null 
                };
                objects.push(currentObj);
            }
            else if (parts[0] === 'name' && currentObj) {
                currentObj.name = parts[1].replace(/"/g, '');
            }
            else if (parts[0] === 'loc' && currentObj) {
                currentObj.loc = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
            }
            else if (parts[0] === 'texture' && currentObj) {
                currentObj.texture = parts[1].replace(/"/g, '');
            }
            else if (parts[0] === 'numvert' && currentObj) {
                const c = parseInt(parts[1]);
                for (let j = 0; j < c; j++) {
                    i++;
                    const v = lines[i].trim().split(/\s+/);
                    // Store as world-relative position
                    currentObj.rawVerts.push([
                        parseFloat(v[0]) + currentObj.loc[0], 
                        parseFloat(v[1]) + currentObj.loc[1], 
                        parseFloat(v[2]) + currentObj.loc[2]
                    ]);
                }
            }
            else if (parts[0] === 'SURF' && currentObj) {
                currentObj.surfaces.push({ refs: [] });
            }
            else if (parts[0] === 'refs' && currentObj) {
                const c = parseInt(parts[1]);
                for (let r = 0; r < c; r++) {
                    i++;
                    const rp = lines[i].trim().split(/\s+/);
                    currentObj.surfaces[currentObj.surfaces.length-1].refs.push({
                        index: parseInt(rp[0]), 
                        uv: [parseFloat(rp[1]), parseFloat(rp[2])]
                    });
                }
            }
        }

        // --- Pass 2: Extract Helper Logic ---
        const helperMap = new Map();
        objects.forEach(obj => {
            if (obj.name.endsWith('.XYZObject') && obj.surfaces.length > 0 && obj.rawVerts.length >= 4) {
                const prefix = obj.name.split('.')[0];
                
                // Pivot is the first vertex listed in the refs of the first poly
                const pivotIdx = obj.surfaces[0].refs[0].index;
                const vP = new THREE.Vector3(...obj.rawVerts[pivotIdx]);
                
                // Calculate vectors/distances to other 3 vertices
                const candidates = [];
                obj.rawVerts.forEach((vArr, idx) => {
                    if (idx === pivotIdx) return;
                    const v = new THREE.Vector3(...vArr);
                    const vec = new THREE.Vector3().subVectors(v, vP);
                    candidates.push({ vec, dist: vec.length() });
                });

                // Sort by distance (Ascending)
                candidates.sort((a, b) => a.dist - b.dist);

                let rotationAxis = new THREE.Vector3();
                const nameLower = obj.name.toLowerCase();

                if (nameLower.includes("prop")) {
                    // Propeller: Shortest vector is the shaft
                    rotationAxis.copy(candidates[0].vec).normalize();
                } else {
                    // Control Surface: Longest vector is the hinge axis
                    rotationAxis.copy(candidates[2].vec).normalize();
                }

                helperMap.set(prefix, { pivot: vP, axis: rotationAxis });
            }
        });

        // --- Pass 3: Build Final Meshes ---
        objects.forEach(obj => {
            if (obj.name.endsWith('.XYZObject') || obj.surfaces.length === 0) return;

            const prefix = obj.name.split('.')[0];
            const helper = helperMap.get(prefix);

            let pivot = new THREE.Vector3(0, 0, 0);
            let hingeAxis = null;

            if (helper) {
                pivot.copy(helper.pivot);
                hingeAxis = helper.axis;
            } else {
                // Fallback pivot (center of bounding box)
                let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
                obj.rawVerts.forEach(v => {
                    for(let k=0; k<3; k++) {
                        if(v[k] < min[k]) min[k] = v[k];
                        if(v[k] > max[k]) max[k] = v[k];
                    }
                });
                pivot.set((min[0]+max[0])/2, (min[1]+max[1])/2, (min[2]+max[2])/2);
            }

            const verts = [];
            const uvs = [];
            obj.surfaces.forEach(s => {
                for (let t = 0; t < s.refs.length - 2; t++) {
                    [0, t+1, t+2].forEach(k => {
                        const idx = s.refs[k].index;
                        const rv = obj.rawVerts[idx];
                        // Offset vertices relative to Pivot
                        verts.push(rv[0] - pivot.x, rv[1] - pivot.y, rv[2] - pivot.z);
                        uvs.push(...s.refs[k].uv);
                    });
                }
            });

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geometry.computeVertexNormals();

            const material = this.getMaterial(obj.texture);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = obj.name;
            mesh.position.copy(pivot);
            
            if (hingeAxis) {
                mesh.userData.hingeAxis = hingeAxis;
            }

            group.add(mesh);
        });

        return group;
    }

    getMaterial(texName) {
        if (texName) {
            const fullTexPath = this.baseUrl + texName;
            const tex = this.textureLoader.load(fullTexPath);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            return new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide });
        }
        return new THREE.MeshStandardMaterial({ color: 0xdddddd, side: THREE.DoubleSide });
    }
}