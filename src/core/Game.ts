import * as THREE from 'three';
import { Planet } from '../world/Planet';
import { Character } from '../character/Character';
import { CameraController } from './CameraController';
import { InputManager } from './InputManager';
import { ToonMaterial } from '../utils/ToonMaterial';
import { NPCManager } from '../world/NPCManager';
import { Flock } from '../world/Flock';
import { DialogueSystem } from '../ui/DialogueSystem';
import { HUD } from '../ui/HUD';
import { TitleScreen } from '../ui/TitleScreen';
import { DeliverySystem } from './DeliverySystem';
import { AudioManager } from '../audio/AudioManager';
import { Secrets } from '../world/Secrets';
import { SKY, LIGHT } from '../utils/palette';
import { EffectComposer, RenderPass, EffectPass, NormalPass } from 'postprocessing';
import { InkEffect } from '../utils/InkEffect';
import { GrainEffect } from '../utils/GrainEffect';
import { createSkyDome } from '../utils/SkyDome';
import { PaintedTextures } from '../utils/PaintedTextures';
import { Kit } from '../world/Kit';
import { Characters } from '../world/Characters';
import { MapView } from '../ui/MapView';

export enum GameState {
  TITLE,
  PLAYING,
  DIALOGUE,
  PAUSED
}

export class Game {
  public renderer!: THREE.WebGLRenderer;
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;
  public clock: THREE.Clock;
  
  public planet!: Planet;
  public character!: Character;
  public cameraController!: CameraController;
  public inputManager!: InputManager;
  public npcManager!: NPCManager;
  public flock!: Flock;
  public dialogueSystem!: DialogueSystem;
  public hud!: HUD;
  public titleScreen!: TitleScreen;
  public deliverySystem!: DeliverySystem;
  public audioManager!: AudioManager;
  public secrets!: Secrets;
  private sunLight!: THREE.DirectionalLight;
  public kit!: Kit;
  public characters!: Characters;
  public mapView!: MapView;
  private composer!: EffectComposer;
  private inkEffect!: InkEffect;
  /** Fog parked while something is looking at the whole planet. */
  private parkedFog: THREE.Fog | null = null;


  public state: GameState = GameState.TITLE;
  public planetRadius: number = 30;
  
  private animationId: number = 0;
  private container!: HTMLElement;

  constructor() {
    this.clock = new THREE.Clock();
  }

  async init(): Promise<void> {
    this.container = document.getElementById('app')!;
    
    this.setupRenderer();
    this.setupScene();
    this.setupLighting();
    
    await this.setupWorld();
    
    this.setupPostProcessing();
    this.mapView = new MapView(this);
    this.setupUI();
    this.setupAudio();

    // The title screen shows the planet whole, so the fog starts parked
    // and the ink fade is pushed out to orbital distance.
    this.suspendFog();
    this.applyOrbitLook();

    this.hideLoading();
    this.animate();
  }

  private setupRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    const mobile = window.matchMedia('(pointer: coarse)').matches;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    // Hard-edged shadows suit the flat cel fill better than PCFSoft's mush.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.container.appendChild(this.renderer.domElement);
  }

  private setupScene(): void {
    this.scene = new THREE.Scene();

    const skyColor = new THREE.Color(SKY.fog);
    this.scene.background = skyColor;
    // The horizon on a radius-30 sphere sits ~14 units from the camera, so the
    // old 25-70 range meant fog never engaged at all. This band actually bites.
    this.scene.fog = new THREE.Fog(skyColor, 10, 36);
    this.scene.add(createSkyDome());

    const portrait = window.innerHeight > window.innerWidth;
    this.camera = new THREE.PerspectiveCamera(
      portrait ? 58 : 48,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );
  }

  private setupLighting(): void {
    // Warm key light. This one casts the shadows that do the shape-reading.
    this.sunLight = new THREE.DirectionalLight(LIGHT.sun, 2.1);
    this.sunLight.position.set(38, 62, 26);
    this.sunLight.castShadow = true;
    const mapSize = window.matchMedia('(pointer: coarse)').matches ? 1024 : 2048;
    this.sunLight.shadow.mapSize.width = mapSize;
    this.sunLight.shadow.mapSize.height = mapSize;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 160;
    // Tight frustum around the player rather than the whole planet: the old
    // 120-unit box spread 2048 texels so thin that shadows were mush.
    const extent = 26;
    this.sunLight.shadow.camera.left = -extent;
    this.sunLight.shadow.camera.right = extent;
    this.sunLight.shadow.camera.top = extent;
    this.sunLight.shadow.camera.bottom = -extent;
    this.sunLight.shadow.bias = -0.0008;
    this.sunLight.shadow.normalBias = 0.035;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Cool sky over warm ground bounce. This is what tints the shadows: unlit
    // faces pick up blue from above and sand from below instead of going grey.
    const hemi = new THREE.HemisphereLight(LIGHT.skyFill, LIGHT.groundBounce, 1.22);
    this.scene.add(hemi);

    // A whisper of ambient so nothing ever reads as pure black.
    this.scene.add(new THREE.AmbientLight(LIGHT.ambient, 0.35));
  }

  /**
   * Keep the shadow frustum following the player. A 26-unit box gives crisp
   * contact shadows; it only works because it travels with the camera.
   */
  private updateSunShadow(): void {
    if (!this.sunLight || !this.character) return;

    const focus = this.character.group.position;
    const up = focus.clone().normalize();

    // Build a tangent frame that stays well-conditioned everywhere, including
    // directly over the poles — the town sits on +Y, so a naive cross with
    // world up degenerates exactly where the player starts.
    const seed = Math.abs(up.y) > 0.9
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0);
    const east = new THREE.Vector3().crossVectors(seed, up).normalize();
    const north = new THREE.Vector3().crossVectors(up, east).normalize();

    // Sun high and off to one shoulder: steep enough that the day/night
    // terminator never reaches the horizon, angled enough to throw shadows.
    const sunDir = up.clone().multiplyScalar(60)
      .addScaledVector(east, 26)
      .addScaledVector(north, -16);

    this.sunLight.position.copy(focus).add(sunDir);
    this.sunLight.target.position.copy(focus);
    this.sunLight.target.updateMatrixWorld();
  }

  private async setupWorld(): Promise<void> {
    ToonMaterial.init();

    try {
      await PaintedTextures.load();
    } catch (err) {
      console.warn('Painted textures failed to load:', err);
    }

    // Load the Blender kit before the world is built; Planet falls back to the
    // old primitive houses if it fails, so a bad export never blocks the game.
    this.kit = new Kit();
    this.characters = new Characters();
    try {
      await Promise.all([this.kit.load(), this.characters.load()]);
    } catch (err) {
      console.warn('Art assets failed to load, falling back to primitives:', err);
    }

    this.planet = new Planet(this.planetRadius, this.kit);
    this.scene.add(this.planet.mesh);
    
    this.inputManager = new InputManager(this);
    this.inputManager.setupCanvasEvents();
    
    const startPosition = this.planet.getSpawnPosition();
    this.character = new Character(this, startPosition);
    this.scene.add(this.character.group);
    
    this.cameraController = new CameraController(this);
    
    this.npcManager = new NPCManager(this);
    this.flock = new Flock(this);
    
    this.deliverySystem = new DeliverySystem(this);

    this.secrets = new Secrets(this);

    this.enableShadowsEverywhere();
    this.cameraController.rebuildColliders();
  }

  /**
   * Most props were built without shadow flags, so even once the materials
   * could receive shadows, only a handful of meshes participated. Flip both
   * flags on everything once the world exists.
   *
   * The ground sphere only receives — having it cast onto itself produces
   * acne across the whole planet at this curvature.
   */
  private enableShadowsEverywhere(): void {
    this.scene.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;

      const isGround = mesh.geometry instanceof THREE.IcosahedronGeometry
        && mesh.parent === this.planet.mesh;

      // Clouds sit 20-35 units up and are several units across, so letting them
      // cast drops a hard slab of shadow across half the visible world.
      const isCloud = this.planet.isCloudMesh(mesh);

      mesh.castShadow = !isGround && !isCloud;
      mesh.receiveShadow = !isCloud;
    });
  }

  /**
   * The ink pass. A NormalPass renders view-space normals to their own buffer;
   * the InkEffect reads that plus the depth buffer to find edges.
   */
  private setupPostProcessing(): void {
    this.composer = new EffectComposer(this.renderer, {
      frameBufferType: THREE.HalfFloatType
    });

    this.composer.addPass(new RenderPass(this.scene, this.camera));

    const normalPass = new NormalPass(this.scene, this.camera);
    this.composer.addPass(normalPass);

    // Fade the lines out over the same range the fog dissolves geometry.
    // Left on its own constant, the ink kept drawing edges on shapes the fog
    // had already erased, so distance read as wireframe in mist.
    const fog = this.scene.fog as THREE.Fog;
    this.inkEffect = new InkEffect({
      normalBuffer: normalPass.texture,
      maxDistance: fog ? fog.far : 60
    });
    const grain = new GrainEffect(0.048, 0.36);
    this.composer.addPass(new EffectPass(this.camera, this.inkEffect, grain));

    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  private setupUI(): void {
    this.dialogueSystem = new DialogueSystem(this);
    this.hud = new HUD(this);
    this.titleScreen = new TitleScreen(this);
  }

  private setupAudio(): void {
    this.audioManager = new AudioManager(this);
    const unlock = () => {
      this.audioManager.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }


  private hideLoading(): void {
    const loading = document.getElementById('loading');
    if (loading) {
      loading.classList.add('hidden');
      setTimeout(() => loading.remove(), 500);
    }
  }

  /**
   * Park the street-level fog.
   *
   * Anything viewing the planet whole — the title screen, the world map —
   * needs it out of the way, or the globe dissolves at 34 units. Handled by
   * explicit calls rather than inferred from state changes in the frame loop,
   * which was fragile and left the fog off after entering the game.
   */
  public suspendFog(): void {
    if (this.scene.fog) {
      this.parkedFog = this.scene.fog as THREE.Fog;
      this.scene.fog = null;
    }
  }

  public restoreFog(): void {
    if (this.parkedFog) {
      this.scene.fog = this.parkedFog;
      this.parkedFog = null;
    }
  }

  /**
   * Ink and the camera clip are tuned for street level: lines fade with the
   * fog at ~36 units. The title orbit and the map sit ~90 units out, past
   * that fade, so every outline vanished. Push the fade to the far side of
   * the globe and pull `near` up so the depth buffer still has precision.
   */
  public applyOrbitLook(): void {
    if (!this.inkEffect) return;
    this.inkEffect.maxDistance = this.planetRadius * 5.2;
    this.inkEffect.thickness = 1.55;
    this.camera.near = 5;
    this.camera.far = this.planetRadius * 8;
    this.camera.updateProjectionMatrix();
  }

  public applyStreetLook(): void {
    if (!this.inkEffect) return;
    const fog = (this.scene.fog ?? this.parkedFog) as THREE.Fog | null;
    this.inkEffect.maxDistance = fog?.far ?? 36;
    this.inkEffect.thickness = 1.35;
    this.camera.near = 0.1;
    this.camera.far = 200;
    this.camera.updateProjectionMatrix();
  }

  public startGame(): void {
    this.state = GameState.PLAYING;
    this.restoreFog();
    this.applyStreetLook();
    this.titleScreen.hide();
    this.hud.show();
    this.inputManager.enable();
    this.audioManager.startMusic();
    this.deliverySystem.startFirstDelivery();
    this.cameraController.reset();
  }

  public enterDialogue(): void {
    this.state = GameState.DIALOGUE;
    this.inputManager.disable();
    this.audioManager.setDialogue(true);
  }

  public exitDialogue(): void {
    this.state = GameState.PLAYING;
    this.inputManager.enable();
    this.cameraController.reset();
    this.audioManager.setDialogue(false);
  }

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.getElapsedTime();
    
    if (this.state === GameState.PLAYING) {
      this.character.update(delta);
      this.cameraController.update(delta);
      this.updateSunShadow();
      this.deliverySystem.update();
      this.secrets.update(elapsed);
    }

    // Title orbit shows the real village, so villagers and the flock keep moving.
    if (this.state === GameState.PLAYING || this.state === GameState.TITLE) {
      this.npcManager.update(delta, elapsed);
      this.flock.update(delta);
    }
    
    // The title screen orbits the real planet, so it drives the shared camera.
    if (this.state === GameState.TITLE) {
      this.titleScreen?.update(delta);
    }

    this.mapView?.update(delta);

    this.planet.update(elapsed);
    this.audioManager.update();
    this.hud.update();
    
    this.composer.render(delta);
  };

  public resize(): void {
    const vv = window.visualViewport;
    const width = Math.round(vv?.width ?? window.innerWidth);
    const height = Math.round(vv?.height ?? window.innerHeight);
    this.camera.fov = height > width ? 58 : 48;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.composer?.setSize(width, height);
  }

  public dispose(): void {
    cancelAnimationFrame(this.animationId);
    this.renderer.dispose();
    this.inputManager.dispose();
    this.audioManager.dispose();
  }
}
