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
    
    // Camera closer to planet so town details are readable
    this.titleCamera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);
    this.titleCamera.position.set(0, 6, 32);
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
    const planetRadius = 16;
    
    // Main sphere - lighter green for better contrast
    const sphereGeo = new THREE.IcosahedronGeometry(planetRadius, 4);
    const sphereMat = ToonMaterial.create({ color: 0x6a8a5a });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    this.titlePlanet.add(sphere);
    
    // Add outline to planet
    const planetOutline = OutlineMaterial.addOutlineToMesh(sphere, { thickness: 0.25, wobble: 0.04 });
    this.titlePlanet.add(planetOutline);
    
    // Create SURFACE-PAINTED ribbon roads (latitude rings) using ring geometry
    this.createTitleRoads(planetRadius);
    
    // Create CHUNKY extruded houses with visible volume
    this.createTitleHouses(planetRadius);
    
    // Create landmark features
    this.createTitleLandmarks(planetRadius);
    
    // Planet centered, slightly lower so houses on top are visible
    this.titlePlanet.position.set(0, -2, 0);
    this.titleScene.add(this.titlePlanet);
  }

  private createTitleRoads(planetRadius: number): void {
    // Main road - wide ribbon ring around equator using TorusGeometry projected onto sphere
    // Using ring segments that wrap around the sphere
    const numRoadSegments = 24;
    const roadWidth = 1.8;
    
    // Equator road
    for (let i = 0; i < numRoadSegments; i++) {
      const theta1 = (i / numRoadSegments) * Math.PI * 2;
      const theta2 = ((i + 1) / numRoadSegments) * Math.PI * 2;
      
      const roadSeg = this.createRoadRibbonSegment(planetRadius, theta1, theta2, 0, roadWidth);
      this.titlePlanet.add(roadSeg);
    }
    
    // Northern latitude road
    for (let i = 0; i < 20; i++) {
      const theta1 = (i / 20) * Math.PI * 2;
      const theta2 = ((i + 1) / 20) * Math.PI * 2;
      
      const roadSeg = this.createRoadRibbonSegment(planetRadius, theta1, theta2, 0.5, roadWidth * 0.8);
      this.titlePlanet.add(roadSeg);
    }
    
    // Southern latitude road
    for (let i = 0; i < 20; i++) {
      const theta1 = (i / 20) * Math.PI * 2;
      const theta2 = ((i + 1) / 20) * Math.PI * 2;
      
      const roadSeg = this.createRoadRibbonSegment(planetRadius, theta1, theta2, -0.4, roadWidth * 0.7);
      this.titlePlanet.add(roadSeg);
    }
    
    // Meridian roads (north-south)
    for (let m = 0; m < 6; m++) {
      const theta = (m / 6) * Math.PI * 2;
      for (let i = 0; i < 12; i++) {
        const lat1 = -0.6 + (i / 12) * 1.2;
        const lat2 = -0.6 + ((i + 1) / 12) * 1.2;
        
        const roadSeg = this.createMeridianRoadSegment(planetRadius, theta, lat1, lat2, roadWidth * 0.6);
        this.titlePlanet.add(roadSeg);
      }
    }
  }

  private createRoadRibbonSegment(radius: number, theta1: number, theta2: number, latitude: number, width: number): THREE.Mesh {
    // Create a curved road segment that follows the sphere surface at given latitude
    const phi = Math.PI / 2 - latitude; // Convert latitude to phi angle
    
    // Create shape for the road cross-section
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(width / 2, 0.15);
    shape.lineTo(-width / 2, 0.15);
    shape.closePath();
    
    // Create curve path along the latitude
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta1) * radius,
        Math.cos(phi) * radius,
        Math.sin(phi) * Math.sin(theta1) * radius
      ),
      new THREE.Vector3(
        Math.sin(phi) * Math.cos((theta1 + theta2) / 2) * radius,
        Math.cos(phi) * radius,
        Math.sin(phi) * Math.sin((theta1 + theta2) / 2) * radius
      ),
      new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta2) * radius,
        Math.cos(phi) * radius,
        Math.sin(phi) * Math.sin(theta2) * radius
      )
    ]);
    
    // Use ExtrudeGeometry to create the road
    const extrudeSettings = {
      steps: 8,
      extrudePath: curve,
    };
    
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const mat = ToonMaterial.create({ color: 0x2a2a2a });
    const road = new THREE.Mesh(geo, mat);
    
    return road;
  }

  private createMeridianRoadSegment(radius: number, theta: number, lat1: number, lat2: number, width: number): THREE.Mesh {
    const phi1 = Math.PI / 2 - lat1;
    const phi2 = Math.PI / 2 - lat2;
    const phiMid = (phi1 + phi2) / 2;
    
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(width / 2, 0.12);
    shape.lineTo(-width / 2, 0.12);
    shape.closePath();
    
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(
        Math.sin(phi1) * Math.cos(theta) * radius,
        Math.cos(phi1) * radius,
        Math.sin(phi1) * Math.sin(theta) * radius
      ),
      new THREE.Vector3(
        Math.sin(phiMid) * Math.cos(theta) * radius,
        Math.cos(phiMid) * radius,
        Math.sin(phiMid) * Math.sin(theta) * radius
      ),
      new THREE.Vector3(
        Math.sin(phi2) * Math.cos(theta) * radius,
        Math.cos(phi2) * radius,
        Math.sin(phi2) * Math.sin(theta) * radius
      )
    ]);
    
    const extrudeSettings = { steps: 6, extrudePath: curve };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const mat = ToonMaterial.create({ color: 0x2a2a2a });
    return new THREE.Mesh(geo, mat);
  }

  private orientOnSphere(obj: THREE.Object3D, surfacePos: THREE.Vector3, randomYaw: boolean = false): void {
    // Properly orient object so its local +Y points outward from sphere center
    // This makes houses/trees stand UP on the surface, not lay flat
    const outwardNormal = surfacePos.clone().normalize();
    const defaultUp = new THREE.Vector3(0, 1, 0);
    
    // Create quaternion that rotates from default up to outward normal
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(defaultUp, outwardNormal);
    obj.quaternion.copy(quaternion);
    
    // Add random rotation around the local Y axis (now pointing outward)
    if (randomYaw) {
      const yawQuat = new THREE.Quaternion();
      yawQuat.setFromAxisAngle(outwardNormal, Math.random() * Math.PI * 2);
      obj.quaternion.premultiply(yawQuat);
    }
  }

  private createTitleHouses(planetRadius: number): void {
    // Place chunky houses on the CAMERA-FACING side of the planet
    // Camera is at z=38, so we want houses with positive z coordinates
    // Using theta in range [0.3, 2.8] gives positive z (sin(theta) > 0)
    const housePositions = [
      // Front-facing cluster (clearly visible, positive z)
      { theta: 0.5, phi: 0.6 }, { theta: 0.8, phi: 0.5 }, { theta: 1.1, phi: 0.55 },
      { theta: 1.4, phi: 0.45 }, { theta: 1.7, phi: 0.6 }, { theta: 2.0, phi: 0.5 },
      { theta: 2.3, phi: 0.55 }, { theta: 2.6, phi: 0.48 },
      // Equator front - clearly visible band
      { theta: 0.4, phi: 1.5 }, { theta: 0.7, phi: 1.55 }, { theta: 1.0, phi: 1.48 },
      { theta: 1.3, phi: 1.52 }, { theta: 1.6, phi: 1.5 }, { theta: 1.9, phi: 1.55 },
      { theta: 2.2, phi: 1.48 }, { theta: 2.5, phi: 1.52 }, { theta: 2.8, phi: 1.5 },
      // Mid-latitude front
      { theta: 0.6, phi: 1.0 }, { theta: 1.2, phi: 0.95 }, { theta: 1.8, phi: 1.05 },
      { theta: 2.4, phi: 1.0 }, { theta: 0.9, phi: 1.2 }, { theta: 1.5, phi: 1.15 },
      { theta: 2.1, phi: 1.25 },
      // Lower front
      { theta: 0.5, phi: 1.9 }, { theta: 1.1, phi: 1.95 }, { theta: 1.7, phi: 1.85 },
      { theta: 2.3, phi: 1.9 }, { theta: 2.7, phi: 2.0 },
      // Some on sides for wrap-around feel
      { theta: 3.0, phi: 1.5 }, { theta: 3.3, phi: 1.0 }, { theta: 0.2, phi: 1.3 },
      { theta: -0.2, phi: 1.5 }, { theta: 3.5, phi: 0.8 },
    ];
    
    housePositions.forEach((pos, i) => {
      const house = this.createChunkyHouse(i % 5);
      // LARGER scale - must be visible from camera at z=38
      house.scale.setScalar(3.5 + Math.random() * 2.0);
      
      const surfacePos = new THREE.Vector3(
        Math.sin(pos.phi) * Math.cos(pos.theta),
        Math.cos(pos.phi),
        Math.sin(pos.phi) * Math.sin(pos.theta)
      ).multiplyScalar(planetRadius);
      
      house.position.copy(surfacePos);
      this.orientOnSphere(house, surfacePos, true);
      this.titlePlanet.add(house);
    });
    
    // Add trees - also on front-facing side
    for (let i = 0; i < 25; i++) {
      const tree = this.createChunkyTree();
      tree.scale.setScalar(2.5 + Math.random() * 1.5);
      
      // Keep trees on front side (theta 0.2 to 2.9)
      const theta = 0.2 + Math.random() * 2.7;
      const phi = 0.4 + Math.random() * 1.6;
      const surfacePos = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).multiplyScalar(planetRadius);
      
      tree.position.copy(surfacePos);
      this.orientOnSphere(tree, surfacePos, false);
      this.titlePlanet.add(tree);
    }
  }

  private createChunkyHouse(variant: number): THREE.Group {
    const house = new THREE.Group();
    const outlineOpts = { thickness: 0.08, wobble: 0.015 };
    
    // Color variants for visual variety
    const wallColors = [0xe8e0d0, 0xd8d0c0, 0xf0e8d8, 0xc8c0b0, 0xdad4c4];
    const roofColors = [0x5a5a5a, 0x4a4a4a, 0x6a4a3a, 0x5a4a4a, 0x4a5a5a];
    
    // CHUNKY body - tall enough to be visible
    const bodyW = 1.5 + Math.random() * 0.8;
    const bodyH = 1.8 + Math.random() * 1.0;
    const bodyD = 1.2 + Math.random() * 0.6;
    
    const bodyGeo = new THREE.BoxGeometry(bodyW, bodyH, bodyD);
    const bodyMat = ToonMaterial.create({ color: wallColors[variant] });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = bodyH / 2;
    house.add(body);
    house.add(OutlineMaterial.addOutlineToMesh(body, outlineOpts));
    
    // CLEAR pitched roof with real volume
    const roofH = 0.8 + Math.random() * 0.4;
    const roofGeo = new THREE.ConeGeometry(Math.max(bodyW, bodyD) * 0.75, roofH, 4);
    const roofMat = ToonMaterial.create({ color: roofColors[variant] });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = bodyH + roofH / 2;
    roof.rotation.y = Math.PI / 4;
    house.add(roof);
    house.add(OutlineMaterial.addOutlineToMesh(roof, outlineOpts));
    
    // Add a chimney for extra silhouette
    if (Math.random() > 0.5) {
      const chimGeo = new THREE.BoxGeometry(0.25, 0.6, 0.25);
      const chimMat = ToonMaterial.create({ color: 0x8a7a6a });
      const chim = new THREE.Mesh(chimGeo, chimMat);
      chim.position.set(bodyW * 0.25, bodyH + roofH * 0.3, 0);
      house.add(chim);
    }
    
    return house;
  }

  private createChunkyTree(): THREE.Group {
    const tree = new THREE.Group();
    const outlineOpts = { thickness: 0.06, wobble: 0.01 };
    
    // Brown trunk
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 1.0, 6);
    const trunkMat = ToonMaterial.create({ color: 0x6b5344 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.5;
    tree.add(trunk);
    
    // Chunky foliage - multiple overlapping spheres
    const foliageColors = [0x4a7a4b, 0x5a8a5b, 0x3a6a3b];
    for (let i = 0; i < 3; i++) {
      const foliageGeo = new THREE.IcosahedronGeometry(0.6 + Math.random() * 0.3, 1);
      const foliageMat = ToonMaterial.create({ color: foliageColors[i % 3] });
      const foliage = new THREE.Mesh(foliageGeo, foliageMat);
      foliage.position.set(
        (Math.random() - 0.5) * 0.4,
        1.2 + i * 0.3,
        (Math.random() - 0.5) * 0.4
      );
      tree.add(foliage);
      if (i === 0) tree.add(OutlineMaterial.addOutlineToMesh(foliage, outlineOpts));
    }
    
    return tree;
  }

  private createTitleLandmarks(planetRadius: number): void {
    // LARGE Torii gate - on front-facing upper area (prominent silhouette)
    const torii = this.createLargeTorii();
    torii.scale.setScalar(6.0);
    // Position on front side (positive z), upper area
    const toriiPos = new THREE.Vector3(0.3, 0.5, 0.8).normalize().multiplyScalar(planetRadius);
    torii.position.copy(toriiPos);
    this.orientOnSphere(torii, toriiPos, false);
    this.titlePlanet.add(torii);
    
    // Harbor/water area - larger, on front-facing lower-right area
    const waterGeo = new THREE.CircleGeometry(6, 24);
    const waterMat = ToonMaterial.create({ color: 0x3a8aa0, transparent: true, opacity: 0.9 });
    const water = new THREE.Mesh(waterGeo, waterMat);
    // Position on front side, lower area (phi > PI/2)
    const waterPos = new THREE.Vector3(0.6, -0.4, 0.7).normalize().multiplyScalar(planetRadius + 0.12);
    water.position.copy(waterPos);
    // Water just faces outward (use lookAt but reversed)
    water.lookAt(water.position.clone().multiplyScalar(2));
    this.titlePlanet.add(water);
    this.titlePlanet.add(OutlineMaterial.addOutlineToMesh(water, { thickness: 0.25, wobble: 0.03 }));
    
    // Lighthouse next to water - LARGER and on front side
    const lighthouse = this.createLargeLighthouse();
    lighthouse.scale.setScalar(6.0);
    const lhPos = new THREE.Vector3(0.5, -0.3, 0.8).normalize().multiplyScalar(planetRadius);
    lighthouse.position.copy(lhPos);
    this.orientOnSphere(lighthouse, lhPos, false);
    this.titlePlanet.add(lighthouse);
    
    // A few boats in the water
    for (let i = 0; i < 3; i++) {
      const boat = this.createMiniBoat();
      boat.scale.setScalar(3.5);
      const boatPos = new THREE.Vector3(0.55 + i * 0.1, -0.42, 0.72).normalize().multiplyScalar(planetRadius + 0.2);
      boat.position.copy(boatPos);
      this.orientOnSphere(boat, boatPos, true);
      this.titlePlanet.add(boat);
    }
  }

  private createLargeTorii(): THREE.Group {
    const torii = new THREE.Group();
    const mat = ToonMaterial.create({ color: 0xc0392b });
    const outlineOpts = { thickness: 0.05, wobble: 0.008 };
    
    // Thick posts
    for (let i = 0; i < 2; i++) {
      const postGeo = new THREE.CylinderGeometry(0.18, 0.22, 2.5, 8);
      const post = new THREE.Mesh(postGeo, mat);
      post.position.set(i === 0 ? -1.0 : 1.0, 1.25, 0);
      torii.add(post);
      torii.add(OutlineMaterial.addOutlineToMesh(post, outlineOpts));
    }
    
    // Top beam - curved ends
    const topGeo = new THREE.BoxGeometry(2.8, 0.3, 0.3);
    const top = new THREE.Mesh(topGeo, mat);
    top.position.y = 2.4;
    torii.add(top);
    torii.add(OutlineMaterial.addOutlineToMesh(top, outlineOpts));
    
    // Second beam
    const midGeo = new THREE.BoxGeometry(2.2, 0.2, 0.2);
    const mid = new THREE.Mesh(midGeo, mat);
    mid.position.y = 2.0;
    torii.add(mid);
    
    return torii;
  }

  private createLargeLighthouse(): THREE.Group {
    const lh = new THREE.Group();
    const outlineOpts = { thickness: 0.05, wobble: 0.008 };
    
    // Tall white base
    const baseGeo = new THREE.CylinderGeometry(0.5, 0.7, 2.5, 8);
    const baseMat = ToonMaterial.create({ color: 0xf5f5f5 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 1.25;
    lh.add(base);
    lh.add(OutlineMaterial.addOutlineToMesh(base, outlineOpts));
    
    // Red stripe
    const stripeGeo = new THREE.CylinderGeometry(0.52, 0.58, 0.5, 8);
    const stripeMat = ToonMaterial.create({ color: 0xe74c3c });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.y = 1.5;
    lh.add(stripe);
    
    // Light housing on top
    const lightGeo = new THREE.CylinderGeometry(0.35, 0.45, 0.4, 8);
    const lightMat = ToonMaterial.create({ color: 0xffd700 });
    const light = new THREE.Mesh(lightGeo, lightMat);
    light.position.y = 2.7;
    lh.add(light);
    
    // Roof
    const roofGeo = new THREE.ConeGeometry(0.5, 0.4, 8);
    const roofMat = ToonMaterial.create({ color: 0x4a4a4a });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 3.1;
    lh.add(roof);
    
    return lh;
  }

  private createMiniBoat(): THREE.Group {
    const boat = new THREE.Group();
    
    // Hull
    const hullGeo = new THREE.BoxGeometry(0.8, 0.25, 0.4);
    const hullMat = ToonMaterial.create({ color: 0x8b4513 });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    boat.add(hull);
    
    return boat;
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
