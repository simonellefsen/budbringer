import * as THREE from 'three';
import { Game, GameState } from '../core/Game';
import { ACCENT, INK, SKY } from '../utils/palette';

/**
 * The world map, which is the world.
 *
 * On a planet this small the honest map is the planet itself seen from
 * outside — the reference game does exactly this, and it beats a projected
 * 2D chart because a sphere has no un-distorted flat representation and
 * because you have already built the thing you would be drawing.
 *
 * Toggling holds the courier still, lifts the camera off the surface and out
 * to an orbit, and marks the places that matter: where you are, and who you
 * are looking for.
 */

/** How far out the camera sits, as a multiple of the planet radius. */
const ORBIT = 3.15;

export class MapView {
  private game: Game;
  private markers: THREE.Group;
  private playerPin!: THREE.Object3D;
  private targetPin!: THREE.Object3D;

  private active = false;
  private spin = 0;
  private returnState: GameState = GameState.PLAYING;

  private savedCamPos = new THREE.Vector3();
  private savedCamUp = new THREE.Vector3();
  private savedCamQuat = new THREE.Quaternion();

  constructor(game: Game) {
    this.game = game;
    this.markers = new THREE.Group();
    this.markers.visible = false;
    this.game.scene.add(this.markers);

    this.playerPin = this.createPin(ACCENT.ember);
    this.targetPin = this.createPin(ACCENT.lemon);
    this.markers.add(this.playerPin, this.targetPin);
  }

  /** A cone on a stalk, standing off the surface so it clears the rooftops. */
  private createPin(colour: number): THREE.Object3D {
    const pin = new THREE.Group();

    const head = new THREE.Mesh(
      new THREE.ConeGeometry(1.5, 3.4, 6),
      new THREE.MeshBasicMaterial({ color: colour })
    );
    head.rotation.x = Math.PI;   // point down at the ground
    head.position.y = 7.4;
    pin.add(head);

    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 5.2, 5),
      new THREE.MeshBasicMaterial({ color: INK })
    );
    stalk.position.y = 3.4;
    pin.add(stalk);

    return pin;
  }

  public get isOpen(): boolean {
    return this.active;
  }

  public toggle(): void {
    this.active ? this.close() : this.open();
  }

  public open(): void {
    if (this.active || this.game.state === GameState.TITLE) return;
    this.active = true;
    this.returnState = this.game.state;

    const camera = this.game.camera;
    this.savedCamPos.copy(camera.position);
    this.savedCamUp.copy(camera.up);
    this.savedCamQuat.copy(camera.quaternion);

    // Fog is tuned for street level and would swallow a planet seen whole.
    this.game.suspendFog();

    // Start the orbit above the player, so opening the map does not lose them.
    const up = this.game.character.group.position.clone().normalize();
    this.spin = Math.atan2(up.z, up.x);

    this.game.state = GameState.PAUSED;
    this.game.inputManager.disable();
    this.markers.visible = true;
  }

  public close(): void {
    if (!this.active) return;
    this.active = false;

    const camera = this.game.camera;
    camera.position.copy(this.savedCamPos);
    camera.up.copy(this.savedCamUp);
    camera.quaternion.copy(this.savedCamQuat);

    this.game.restoreFog();

    this.markers.visible = false;
    this.game.state = this.returnState;
    this.game.inputManager.enable();
    this.game.cameraController.reset();
  }

  /** Stand a pin upright on the surface under `position`. */
  private placePin(pin: THREE.Object3D, position: THREE.Vector3): void {
    const up = position.clone().normalize();
    pin.position.copy(up.clone().multiplyScalar(this.game.planetRadius));
    pin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  }

  public update(delta: number): void {
    if (!this.active) return;

    // Drift round the planet so the far side comes into view on its own.
    this.spin += delta * 0.16;

    const r = this.game.planetRadius * ORBIT;
    const tilt = 0.38;
    const camera = this.game.camera;

    camera.position.set(
      Math.cos(this.spin) * r * Math.cos(tilt),
      Math.sin(tilt) * r,
      Math.sin(this.spin) * r * Math.cos(tilt)
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);

    this.placePin(this.playerPin, this.game.character.group.position);

    // Mark whoever the current task points at, if anyone.
    const delivery = this.game.deliverySystem;
    const targetName = delivery.currentDelivery
      ? (delivery.hasLetter ? delivery.currentDelivery.to : delivery.currentDelivery.from)
      : null;
    const target = targetName ? this.game.npcManager.getNPCByName(targetName) : null;

    if (target) {
      this.targetPin.visible = true;
      this.placePin(this.targetPin, target.mesh.position);
    } else {
      this.targetPin.visible = false;
    }
  }

  /** Sky colour to sit the globe against while the map is open. */
  public get backdrop(): number {
    return SKY.zenith;
  }
}
