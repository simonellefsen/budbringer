import * as THREE from 'three';
import { Planet } from '../world/Planet';
import { Character } from '../character/Character';
import { CameraController } from './CameraController';
import { InputManager } from './InputManager';
import { ToonMaterial } from '../utils/ToonMaterial';
import { NPCManager } from '../world/NPCManager';
import { DialogueSystem } from '../ui/DialogueSystem';
import { HUD } from '../ui/HUD';
import { TitleScreen } from '../ui/TitleScreen';
import { DeliverySystem } from './DeliverySystem';
import { AudioManager } from '../audio/AudioManager';
import { Secrets } from '../world/Secrets';

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
  public dialogueSystem!: DialogueSystem;
  public hud!: HUD;
  public titleScreen!: TitleScreen;
  public deliverySystem!: DeliverySystem;
  public audioManager!: AudioManager;
  public secrets!: Secrets;
  
  
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
    
    this.setupUI();
    this.setupAudio();
    
    this.hideLoading();
    this.animate();
  }

  private setupRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);
  }

  private setupScene(): void {
    this.scene = new THREE.Scene();
    
    const skyColor = new THREE.Color(0x5fbdb0);
    this.scene.background = skyColor;
    this.scene.fog = new THREE.Fog(skyColor, 80, 180);
    
    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    );
  }

  private setupLighting(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    
    const sunLight = new THREE.DirectionalLight(0xfff8f0, 1.2);
    sunLight.position.set(50, 80, 30);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 200;
    sunLight.shadow.camera.left = -60;
    sunLight.shadow.camera.right = 60;
    sunLight.shadow.camera.top = 60;
    sunLight.shadow.camera.bottom = -60;
    sunLight.shadow.bias = -0.001;
    this.scene.add(sunLight);
    
    const fillLight = new THREE.DirectionalLight(0x7ec8e3, 0.25);
    fillLight.position.set(-30, 20, -40);
    this.scene.add(fillLight);
  }

  private async setupWorld(): Promise<void> {
    ToonMaterial.init();
    
    this.planet = new Planet(this.planetRadius);
    this.scene.add(this.planet.mesh);
    
    this.inputManager = new InputManager(this);
    
    const startPosition = this.planet.getSpawnPosition();
    this.character = new Character(this, startPosition);
    this.scene.add(this.character.group);
    
    this.cameraController = new CameraController(this);
    
    this.npcManager = new NPCManager(this);
    
    this.deliverySystem = new DeliverySystem(this);
    
    this.secrets = new Secrets(this);
  }

  private setupUI(): void {
    this.dialogueSystem = new DialogueSystem(this);
    this.hud = new HUD(this);
    this.titleScreen = new TitleScreen(this);
  }

  private setupAudio(): void {
    this.audioManager = new AudioManager(this);
  }


  private hideLoading(): void {
    const loading = document.getElementById('loading');
    if (loading) {
      loading.classList.add('hidden');
      setTimeout(() => loading.remove(), 500);
    }
  }

  public startGame(): void {
    this.state = GameState.PLAYING;
    this.titleScreen.hide();
    this.hud.show();
    this.inputManager.enable();
    this.audioManager.startMusic();
    this.deliverySystem.startFirstDelivery();
  }

  public enterDialogue(): void {
    this.state = GameState.DIALOGUE;
    this.inputManager.disable();
  }

  public exitDialogue(): void {
    this.state = GameState.PLAYING;
    this.inputManager.enable();
  }

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.getElapsedTime();
    
    if (this.state === GameState.PLAYING) {
      this.character.update(delta);
      this.cameraController.update(delta);
      this.npcManager.update(delta, elapsed);
      this.deliverySystem.update();
      this.secrets.update(elapsed);
    }
    
    this.planet.update(elapsed);
    this.hud.update();
    
    this.renderer.render(this.scene, this.camera);
  };

  public resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public dispose(): void {
    cancelAnimationFrame(this.animationId);
    this.renderer.dispose();
    this.inputManager.dispose();
    this.audioManager.dispose();
  }
}
