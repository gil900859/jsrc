import * as THREE from 'three';
import { worldToThreeVec } from '../math/Frames.js';
import { Skybox } from '../visual/Skybox.js';

export class Simulator {
    constructor() {
        this.scene = new THREE.Scene();
        // Feature: photoreal skybox uses explicit geometry.
        // Do not use scene.background (or Three.js built-in cubemap skybox).
        this.scene.background = null;
        
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.01, 5000);

        // --- Fixed observer camera (World ENU) ---
        // User request: A stationary observer 1.8m above ground, 2m West of origin.
        // World frame W is ENU: +X=East, +Y=North, +Z=Up.
        // West is -X.
        this.cameraPosition_W = new THREE.Vector3(-2, 0, 1.8);
        this.camera.position.copy(worldToThreeVec(this.cameraPosition_W));
        this.camera.up.set(0, 1, 0); // keep Three.js "up" as +Y_T
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.body.appendChild(this.renderer.domElement);

        // Mouse camera controls intentionally removed.

        this.initLights();
        this.initEnvironment();

        // --- Photoreal skybox (explicit geometry) ---
        // The skybox is centered around the camera each frame (so it has no parallax).
        // It is purely visual and does not participate in physics.
        this.skybox = new Skybox({
            baseUrl: 'landscape/Osage%20Park/',
            wallHeight: 1000,

            // Wall ordering is configurable. Values map to cvimg1..cvimg4.
            // The four entries correspond to the 4 walls (clockwise around the enclosure in render frame).
            wallOrder: [3, 1, 2, 4],
        });
        this.scene.add(this.skybox.root_T);

        // Camera is fixed-position today, but centering the skybox on the camera keeps
        // this robust if we ever add camera translation later.
        this.skybox.setCenter_T(this.camera.position);

        window.addEventListener('resize', () => this.onResize());
    }

    initLights() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);
        
        const sun = new THREE.DirectionalLight(0xffffff, 1.5);
        sun.position.set(5, 10, 5);
        this.scene.add(sun);
    }

    initEnvironment() {
        // Standard grid to provide spatial reference
        const grid = new THREE.GridHelper(100, 200, 0x444444, 0x222222);
        this.scene.add(grid);
    }

    add(object) {
        this.scene.add(object);
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render(lookAtTarget_T = null) {
        if (lookAtTarget_T) {
            // "Turn head" to keep looking at the aircraft.
            this.camera.lookAt(lookAtTarget_T);
        }

        // Keep the skybox centered around the viewer.
        this.skybox.setCenter_T(this.camera.position);
        this.renderer.render(this.scene, this.camera);
    }
}
