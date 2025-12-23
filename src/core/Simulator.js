import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Simulator {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x333344);
        
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.01, 1000);
        this.camera.position.set(-1.5, 0.8, 1.5);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.body.appendChild(this.renderer.domElement);
        
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 0, 0);

        this.initLights();
        this.initEnvironment();

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

    render() {
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}