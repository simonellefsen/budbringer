import * as THREE from 'three';
import { Game } from '../core/Game';
import { ToonMaterial } from '../utils/ToonMaterial';
import { OutlineMaterial } from '../utils/OutlineMaterial';

export class TitleScreen {
  private game: Game;
  private container: HTMLElement;
  private boundKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  
  // 3D title scene
  private titleScene!: THREE.Scene;
  private titleCamera!: THREE.PerspectiveCamera;
  private titlePlanet!: THREE.Group;
  private titleLetters!: THREE.Group;
  private clouds: THREE.Mesh[] = [];
  private animationId: number = 0;

  constructor(game: Game) {
    this.game = game;
    
    this.container = document.createElement('div');
    this.container.id = 'title-screen';
    this.container.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Patrick+Hand&display=swap');
        
        #title-screen {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 300;
          transition: opacity 0.5s ease;
        }
        
        #title-screen.hidden {
          opacity: 0;
          pointer-events: none;
        }
        
        
        #title-ui {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          padding-bottom: 12vh;
          pointer-events: none;
        }
        
        #enter-button {
          background: #f5c842;
          color: #1a1a1a;
          border: 4px solid #1a1a1a;
          border-radius: 6px;
          padding: 16px 60px;
          font-size: 1.6rem;
          font-family: 'Patrick Hand', cursive;
          font-weight: bold;
          cursor: pointer;
          transition: transform 0.12s ease, box-shadow 0.12s ease;
          box-shadow: 4px 4px 0 #1a1a1a;
          text-transform: lowercase;
          letter-spacing: 0.08em;
          pointer-events: auto;
        }
        
        #enter-button:hover {
          transform: translate(-2px, -2px);
          box-shadow: 6px 6px 0 #1a1a1a;
        }
        
        #enter-button:active {
          transform: translate(2px, 2px);
          box-shadow: 2px 2px 0 #1a1a1a;
        }
        
        #title-text {
          font-family: 'Patrick Hand', cursive;
          font-size: 4rem;
          font-weight: bold;
          color: #ffffff;
          text-shadow: 4px 4px 0 #1a1a1a, -2px -2px 0 #1a1a1a, 2px -2px 0 #1a1a1a, -2px 2px 0 #1a1a1a;
          letter-spacing: 0.1em;
          margin-bottom: 1.5rem;
          pointer-events: none;
        }
        
        #title-controls {
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          color: #fff;
          font-family: 'Patrick Hand', cursive;
          font-size: 0.95rem;
          opacity: 0.8;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
          pointer-events: none;
        }
      </style>
      
      <div id="title-ui">
        <div id="title-text">budbringer</div>
        <button id="enter-button">enter</button>
      </div>
      
      <div id="title-controls">wasd walk • space hop • e talk</div>
    `;
    
    document.body.appendChild(this.container);
    
    this.initTitle3D();
    this.animateTitle();
    
    const enterButton = document.getElementById('enter-button')!;
    enterButton.addEventListener('click', () => this.startGame());
    
    this.boundKeyHandler = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        if (!this.container.classList.contains('hidden')) {
          e.preventDefault();
          this.startGame();
        }
      }
    };
    document.addEventListener('keydown', this.boundKeyHandler);
  }

  private initTitle3D(): void {
    // Create title scene
    this.titleScene = new THREE.Scene();
    const skyColor = new THREE.Color(0x5ec9be);
    this.titleScene.background = skyColor;
    
    // Camera focused on planet - title text is now HTML overlay
    this.titleCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);
    this.titleCamera.position.set(0, 5, 55);
    this.titleCamera.lookAt(0, 0, 0);
    
    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.titleScene.add(ambient);
    
    const sun = new THREE.DirectionalLight(0xfff8e8, 1.0);
    sun.position.set(30, 50, 40);
    this.titleScene.add(sun);
    
    // Create the rotating planet with town details
    this.createTitlePlanet();
    
    // Create 3D block letters
    this.createTitleLetters();
    
    // Create cloud blobs
    this.createTitleClouds();
    
    // Resize handling for title canvas
    window.addEventListener('resize', () => {
      this.titleCamera.aspect = window.innerWidth / window.innerHeight;
      this.titleCamera.updateProjectionMatrix();
    });
  }

  private createTitlePlanet(): void {
    this.titlePlanet = new THREE.Group();
    const planetRadius = 18;
    
    // Main sphere
    const sphereGeo = new THREE.IcosahedronGeometry(planetRadius, 4);
    const sphereMat = ToonMaterial.create({ color: 0x5a7a4a });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    this.titlePlanet.add(sphere);
    
    // Add outline to planet
    const planetOutline = OutlineMaterial.addOutlineToMesh(sphere, { thickness: 0.2, wobble: 0.03 });
    this.titlePlanet.add(planetOutline);
    
    const outlineOpts = { thickness: 0.1, wobble: 0.015 };
    
    // LARGER houses - 3x scale, visible from title camera
    for (let i = 0; i < 25; i++) {
      const house = this.createMiniHouse();
      house.scale.setScalar(3.0); // Scale up significantly
      const theta = (i / 25) * Math.PI * 2 + Math.random() * 0.3;
      const phi = 0.3 + Math.random() * 0.5;
      const pos = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).multiplyScalar(planetRadius);
      
      house.position.copy(pos);
      house.lookAt(0, 0, 0);
      house.rotateX(Math.PI / 2);
      house.rotateY(Math.random() * Math.PI);
      this.titlePlanet.add(house);
    }
    
    // LARGER roads - continuous ring around equator
    for (let i = 0; i < 16; i++) {
      const roadGeo = new THREE.BoxGeometry(2.5, 0.1, 8);
      const roadMat = ToonMaterial.create({ color: 0x3a3a3a });
      const road = new THREE.Mesh(roadGeo, roadMat);
      
      const theta = (i / 16) * Math.PI * 2;
      const phi = Math.PI * 0.5; // Equator
      const pos = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).multiplyScalar(planetRadius + 0.05);
      
      road.position.copy(pos);
      road.lookAt(0, 0, 0);
      road.rotateX(Math.PI / 2);
      road.rotateZ(theta + Math.PI / 2);
      this.titlePlanet.add(road);
      this.titlePlanet.add(OutlineMaterial.addOutlineToMesh(road, outlineOpts));
    }
    
    // Second road ring at different latitude
    for (let i = 0; i < 12; i++) {
      const roadGeo = new THREE.BoxGeometry(2, 0.1, 6);
      const roadMat = ToonMaterial.create({ color: 0x3a3a3a });
      const road = new THREE.Mesh(roadGeo, roadMat);
      
      const theta = (i / 12) * Math.PI * 2 + 0.2;
      const phi = Math.PI * 0.35;
      const pos = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).multiplyScalar(planetRadius + 0.05);
      
      road.position.copy(pos);
      road.lookAt(0, 0, 0);
      road.rotateX(Math.PI / 2);
      road.rotateZ(theta + Math.PI / 2);
      this.titlePlanet.add(road);
    }
    
    // LARGER trees - 2.5x scale
    for (let i = 0; i < 20; i++) {
      const tree = this.createMiniTree();
      tree.scale.setScalar(2.5);
      const theta = Math.random() * Math.PI * 2;
      const phi = 0.2 + Math.random() * 0.6;
      const pos = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).multiplyScalar(planetRadius);
      
      tree.position.copy(pos);
      tree.lookAt(0, 0, 0);
      tree.rotateX(Math.PI / 2);
      this.titlePlanet.add(tree);
    }
    
    // LARGER Torii gate - 4x scale
    const torii = this.createMiniTorii();
    torii.scale.setScalar(4.0);
    const toriiPos = new THREE.Vector3(0.6, 0.6, 0.5).normalize().multiplyScalar(planetRadius);
    torii.position.copy(toriiPos);
    torii.lookAt(0, 0, 0);
    torii.rotateX(Math.PI / 2);
    this.titlePlanet.add(torii);
    
    // LARGER water/harbor area
    const waterGeo = new THREE.CircleGeometry(6, 16);
    const waterMat = ToonMaterial.create({ color: 0x4a9ab0, transparent: true, opacity: 0.85 });
    const water = new THREE.Mesh(waterGeo, waterMat);
    const waterPos = new THREE.Vector3(-0.6, -0.4, 0.65).normalize().multiplyScalar(planetRadius + 0.08);
    water.position.copy(waterPos);
    water.lookAt(0, 0, 0);
    this.titlePlanet.add(water);
    this.titlePlanet.add(OutlineMaterial.addOutlineToMesh(water, { thickness: 0.15, wobble: 0.02 }));
    
    // LARGER Lighthouse - 4x scale
    const lighthouse = this.createMiniLighthouse();
    lighthouse.scale.setScalar(4.0);
    const lhPos = new THREE.Vector3(-0.55, -0.35, 0.75).normalize().multiplyScalar(planetRadius);
    lighthouse.position.copy(lhPos);
    lighthouse.lookAt(0, 0, 0);
    lighthouse.rotateX(Math.PI / 2);
    this.titlePlanet.add(lighthouse);
    
    // Planet centered as the hero element
    this.titlePlanet.position.set(0, -3, 0);
    this.titleScene.add(this.titlePlanet);
  }

  private createMiniHouse(): THREE.Group {
    const house = new THREE.Group();
    const outlineOpts = { thickness: 0.04, wobble: 0.008 };
    
    // Body
    const bodyGeo = new THREE.BoxGeometry(1.2, 1, 1);
    const bodyMat = ToonMaterial.create({ color: 0xd8d0c0 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.5;
    house.add(body);
    house.add(OutlineMaterial.addOutlineToMesh(body, outlineOpts));
    
    // Pitched roof
    const roofGeo = new THREE.ConeGeometry(0.9, 0.6, 4);
    const roofMat = ToonMaterial.create({ color: 0x4a4a4a });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 1.3;
    roof.rotation.y = Math.PI / 4;
    house.add(roof);
    house.add(OutlineMaterial.addOutlineToMesh(roof, outlineOpts));
    
    return house;
  }

  private createMiniTree(): THREE.Group {
    const tree = new THREE.Group();
    const outlineOpts = { thickness: 0.03, wobble: 0.006 };
    
    const trunkGeo = new THREE.CylinderGeometry(0.1, 0.15, 0.8, 6);
    const trunkMat = ToonMaterial.create({ color: 0x6b5344 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.4;
    tree.add(trunk);
    
    const foliageGeo = new THREE.IcosahedronGeometry(0.6, 0);
    const foliageMat = ToonMaterial.create({ color: 0x4a7a4b });
    const foliage = new THREE.Mesh(foliageGeo, foliageMat);
    foliage.position.y = 1.1;
    tree.add(foliage);
    tree.add(OutlineMaterial.addOutlineToMesh(foliage, outlineOpts));
    
    return tree;
  }

  private createMiniTorii(): THREE.Group {
    const torii = new THREE.Group();
    const mat = ToonMaterial.create({ color: 0xc0392b });
    const outlineOpts = { thickness: 0.03, wobble: 0.005 };
    
    // Posts
    for (let i = 0; i < 2; i++) {
      const postGeo = new THREE.CylinderGeometry(0.12, 0.15, 2, 6);
      const post = new THREE.Mesh(postGeo, mat);
      post.position.set(i === 0 ? -0.8 : 0.8, 1, 0);
      torii.add(post);
      torii.add(OutlineMaterial.addOutlineToMesh(post, outlineOpts));
    }
    
    // Top beam
    const topGeo = new THREE.BoxGeometry(2.2, 0.2, 0.2);
    const top = new THREE.Mesh(topGeo, mat);
    top.position.y = 1.9;
    torii.add(top);
    torii.add(OutlineMaterial.addOutlineToMesh(top, outlineOpts));
    
    return torii;
  }

  private createMiniLighthouse(): THREE.Group {
    const lh = new THREE.Group();
    const outlineOpts = { thickness: 0.03, wobble: 0.005 };
    
    const baseGeo = new THREE.CylinderGeometry(0.4, 0.5, 1.5, 8);
    const baseMat = ToonMaterial.create({ color: 0xf0f0f0 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.75;
    lh.add(base);
    lh.add(OutlineMaterial.addOutlineToMesh(base, outlineOpts));
    
    // Red stripe
    const stripeGeo = new THREE.CylinderGeometry(0.42, 0.45, 0.3, 8);
    const stripeMat = ToonMaterial.create({ color: 0xe74c3c });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.y = 0.9;
    lh.add(stripe);
    
    return lh;
  }

  private createTitleLetters(): void {
    // Title text is now HTML overlay (see #title-text in CSS)
    // 3D letters caused persistent overlap issues with the planet
    this.titleLetters = new THREE.Group();
    this.titleScene.add(this.titleLetters);
  }

  private createTitleClouds(): void {
    const cloudMat = ToonMaterial.create({ color: 0x8fd8d0 });
    
    for (let i = 0; i < 6; i++) {
      const cloudGroup = new THREE.Group();
      
      for (let j = 0; j < 4; j++) {
        const blobGeo = new THREE.SphereGeometry(3 + Math.random() * 2, 8, 6);
        const blob = new THREE.Mesh(blobGeo, cloudMat);
        blob.position.set(
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 3
        );
        blob.scale.y = 0.5;
        cloudGroup.add(blob);
      }
      
      cloudGroup.position.set(
        (Math.random() - 0.5) * 120,
        20 + Math.random() * 25,
        -30 + Math.random() * 20
      );
      
      this.titleScene.add(cloudGroup);
      this.clouds.push(cloudGroup as unknown as THREE.Mesh);
    }
  }

  private animateTitle = (): void => {
    this.animationId = requestAnimationFrame(this.animateTitle);
    
    // Rotate planet slowly
    if (this.titlePlanet) {
      this.titlePlanet.rotation.y += 0.003;
    }
    
    // Gentle float for letters
    if (this.titleLetters) {
      this.titleLetters.position.y = Math.sin(Date.now() * 0.001) * 1.5;
    }
    
    // Drift clouds
    this.clouds.forEach((cloud, i) => {
      cloud.position.x += 0.02 * (i % 2 === 0 ? 1 : -1);
      if (cloud.position.x > 80) cloud.position.x = -80;
      if (cloud.position.x < -80) cloud.position.x = 80;
    });
    
    // Render
    this.game.renderer.render(this.titleScene, this.titleCamera);
  };

  private startGame(): void {
    this.game.startGame();
  }

  public hide(): void {
    cancelAnimationFrame(this.animationId);
    this.container.classList.add('hidden');
    if (this.boundKeyHandler) {
      document.removeEventListener('keydown', this.boundKeyHandler);
      this.boundKeyHandler = null;
    }
    setTimeout(() => {
      this.container.remove();
    }, 500);
  }

  public show(): void {
    this.container.style.display = 'block';
    this.container.classList.remove('hidden');
  }

  public dispose(): void {
    cancelAnimationFrame(this.animationId);
    if (this.boundKeyHandler) {
      document.removeEventListener('keydown', this.boundKeyHandler);
      this.boundKeyHandler = null;
    }
    this.container.remove();
  }
}
