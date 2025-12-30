import * as THREE from 'three';

/**
 * Photoreal skybox built from explicit geometry (6 planes).
 *
 * Design goals:
 * - Closed rectangular prism (4 walls + top + bottom)
 * - Wall aspect ratio is 2:1 (width:height)
 * - Purely visual (MeshBasicMaterial), never occludes world objects
 * - No scene.background / cubemap usage
 */
export class Skybox {
  /**
   * @param {object} opts
   * @param {string} opts.baseUrl Directory URL (must end with '/'), e.g. 'landscape/Osage%20Park/'
   * @param {number} opts.wallHeight Height of each wall in world units (Three.js render frame Y-up).
   * @param {number[]} [opts.wallOrder] Four integers (1..4) mapping the wall textures (cvimg1..4) onto the 4 walls.
   */
  constructor(opts) {
    const {
      baseUrl,
      wallHeight,
      wallOrder = [3, 3, 3, 4],
    } = opts;

    if (!baseUrl || typeof baseUrl !== 'string') {
      throw new Error('Skybox: baseUrl is required');
    }
    if (!Number.isFinite(wallHeight) || wallHeight <= 0) {
      throw new Error('Skybox: wallHeight must be > 0');
    }
    if (!Array.isArray(wallOrder) || wallOrder.length !== 4) {
      throw new Error('Skybox: wallOrder must be an array of 4 entries');
    }

    this.root_T = new THREE.Group();
    this.root_T.name = 'SkyboxRoot_T';

    // Geometry sizes
    const H = wallHeight;
    const W = 2 * H; // 2:1 width-to-height
    const half = W / 2;

    // Local geometry is centered around the skybox root.
    // We will reposition the whole enclosure in the scene (typically to the camera position)
    // so the viewer is always near the center and never reaches the walls.
    const yMid = 0;
    const yTop = +H / 2;
    const yBot = -H / 2;

    const loader = new THREE.TextureLoader();
    const texSide = (i) => this._loadPhotoTexture(loader, `${baseUrl}cvimg${i}.jpg`);
    const texSky = this._loadPhotoTexture(loader, `${baseUrl}cvimg5.jpg`);
    const texGround = this._loadPhotoTexture(loader, `${baseUrl}cvimg6.jpg`);

    const t1 = texSide(wallOrder[0]);
    const t2 = texSide(wallOrder[1]);
    const t3 = texSide(wallOrder[2]);
    const t4 = texSide(wallOrder[3]);

    // Build 6 planes. We render the *inside* faces using BackSide.
    // Depth interaction is disabled so the skybox never occludes world objects.
    const wallGeom = new THREE.PlaneGeometry(W, H);
    const capGeom = new THREE.PlaneGeometry(W, W);

    // Wall 0: +Z
    this.root_T.add(this._makeFace({
      geom: wallGeom,
      map: t1,
      position_T: new THREE.Vector3(0, yMid, +half),
      rotation_T: new THREE.Euler(0, Math.PI, 0),
    }));

    // Wall 1: -Z
    this.root_T.add(this._makeFace({
      geom: wallGeom,
      map: t2,
      position_T: new THREE.Vector3(0, yMid, -half),
      rotation_T: new THREE.Euler(0, 0, 0),
    }));

    // Wall 2: +X
    this.root_T.add(this._makeFace({
      geom: wallGeom,
      map: t3,
      position_T: new THREE.Vector3(+half, yMid, 0),
      rotation_T: new THREE.Euler(0, -Math.PI / 2, 0),
    }));

    // Wall 3: -X
    this.root_T.add(this._makeFace({
      geom: wallGeom,
      map: t4,
      position_T: new THREE.Vector3(-half, yMid, 0),
      rotation_T: new THREE.Euler(0, +Math.PI / 2, 0),
    }));

    // Top (sky): at +H/2, facing inward (down)
    this.root_T.add(this._makeFace({
      geom: capGeom,
      map: texSky,
      position_T: new THREE.Vector3(0, yTop, 0),
      rotation_T: new THREE.Euler(+Math.PI / 2, 0, 0),
    }));

    // Bottom (ground): at -H/2, facing inward (up)
    this.root_T.add(this._makeFace({
      geom: capGeom,
      map: texGround,
      position_T: new THREE.Vector3(0, yBot, 0),
      rotation_T: new THREE.Euler(-Math.PI / 2, 0, 0),
    }));
  }

  /**
   * Keep the skybox centered around a point in render frame coordinates.
   * Typical usage: call each frame with the camera position.
   *
   * @param {THREE.Vector3} center_T
   */
  setCenter_T(center_T) {
    this.root_T.position.copy(center_T);
  }

  _loadPhotoTexture(loader, url) {
    const tex = loader.load(url);

    // Photo background settings: clamp edges + linear sampling.
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;

    // Avoid mipmap edge bleed seams at the cube edges.
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;

    // three@0.160 uses colorSpace (not encoding).
    if ('colorSpace' in tex) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }

    return tex;
  }

  _makeFace({ geom, map, position_T, rotation_T }) {
    const mat = new THREE.MeshBasicMaterial({
      map,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(position_T);
    mesh.rotation.copy(rotation_T);

    // Ensure the skybox always renders first and never gets culled.
    mesh.renderOrder = -10000;
    mesh.frustumCulled = false;

    return mesh;
  }
}
