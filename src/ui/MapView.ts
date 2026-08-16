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
 * to an orbit, and marks the places that matter: where you are, who you are
 * looking for, and every named region you have already walked through.
 */

/** How far out the camera sits, as a multiple of the planet radius. */
const ORBIT = 3.15;

export class MapView {
  private game: Game;
  private markers: THREE.Group;
  private playerPin!: THREE.Object3D;
  private targetPin!: THREE.Object3D;
  private placeMarks: Map<string, THREE.Object3D> = new Map();
  private labelCache: Map<string, THREE.Sprite> = new Map();

  private active = false;
  private spin = 0;
  /** When set, the orbit eases here instead of drifting. */
  private spinTarget: number | null = null;
  private returnState: GameState = GameState.PLAYING;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerDown: { x: number; y: number } | null = null;
  private boundPointerDown = (e: PointerEvent) => this.onPointerDown(e);
  private boundPointerUp = (e: PointerEvent) => this.onPointerUp(e);
  private boundPointerMove = (e: PointerEvent) => this.onPointerMove(e);

  private savedCamPos = new THREE.Vector3();
  private savedCamUp = new THREE.Vector3();
  private savedCamQuat = new THREE.Quaternion();

  constructor(game: Game) {
    this.game = game;
    this.markers = new THREE.Group();
    this.markers.visible = false;
    this.game.scene.add(this.markers);

    this.playerPin = this.createPin(ACCENT.ember, 'you');
    this.targetPin = this.createPin(ACCENT.lemon, 'target');
    this.markers.add(this.playerPin, this.targetPin);
  }

  /** A cone on a stalk, standing off the surface so it clears the rooftops. */
  private createPin(colour: number, id: string): THREE.Object3D {
    const pin = new THREE.Group();
    pin.userData.mapId = id;

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
    pin.add(this.hitSphere(4.2, 4.6));

    return pin;
  }

  /** Invisible tap target — marks are small on a planet-sized orbit. */
  private hitSphere(radius: number, y: number): THREE.Mesh {
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 8, 6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.y = y;
    return hit;
  }

  /** A small disc plus a name, for a region the courier has already visited. */
  private createPlaceMark(name: string): THREE.Object3D {
    const mark = new THREE.Group();
    mark.userData.mapId = name;
    const disc = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 8, 6),
      new THREE.MeshBasicMaterial({ color: ACCENT.teal })
    );
    disc.position.y = 2.1;
    mark.add(disc);

    const label = this.nameSprite(name);
    label.position.y = 4.4;
    mark.add(label);
    mark.add(this.hitSphere(5.4, 3.4));
    return mark;
  }

  private nameSprite(name: string): THREE.Sprite {
    const cached = this.labelCache.get(name);
    if (cached) return cached;

    const width = 512;
    const height = 128;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 52;
    do {
      ctx.font = `700 ${size}px "Patrick Hand", "Georgia", serif`;
      if (ctx.measureText(name).width <= width - 36) break;
      size -= 2;
    } while (size > 28);
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#2a2118';
    ctx.fillStyle = '#fffdf6';
    ctx.strokeText(name, width / 2, height / 2);
    ctx.fillText(name, width / 2, height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      depthTest: true,
      sizeAttenuation: true
    }));
    sprite.scale.set(11, 2.75, 1);
    this.labelCache.set(name, sprite);
    return sprite;
  }

  private syncPlaceMarks(): void {
    const visited = this.game.visitedPlaces;
    for (const [name, mark] of this.placeMarks) {
      if (visited.has(name)) continue;
      this.markers.remove(mark);
      this.placeMarks.delete(name);
    }
    for (const name of visited) {
      if (this.placeMarks.has(name)) continue;
      const area = this.game.planet.areas.find(a => a.name === name);
      if (!area) continue;
      const mark = this.createPlaceMark(name);
      this.placeMarks.set(name, mark);
      this.markers.add(mark);
    }
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
    // Ink fade and the camera clip go with it — same look as the title orbit.
    this.game.suspendFog();
    this.game.applyOrbitLook();

    // Start the orbit above the player, so opening the map does not lose them.
    const up = this.game.character.group.position.clone().normalize();
    this.spin = Math.atan2(up.z, up.x);

    this.game.state = GameState.PAUSED;
    this.game.inputManager.disable();
    if (document.pointerLockElement) document.exitPointerLock();
    this.syncPlaceMarks();
    this.markers.visible = true;
    this.spinTarget = null;
    this.bindPointer(true);
  }

  public close(): void {
    if (!this.active) return;
    this.active = false;

    const camera = this.game.camera;
    camera.position.copy(this.savedCamPos);
    camera.up.copy(this.savedCamUp);
    camera.quaternion.copy(this.savedCamQuat);

    this.game.restoreFog();
    this.game.applyStreetLook();

    this.markers.visible = false;
    this.game.state = this.returnState;
    this.game.inputManager.enable();
    this.game.cameraController.reset();
    this.bindPointer(false);
    this.game.renderer.domElement.style.cursor = '';
  }

  private bindPointer(on: boolean): void {
    const canvas = this.game.renderer.domElement;
    if (on) {
      canvas.addEventListener('pointerdown', this.boundPointerDown);
      canvas.addEventListener('pointerup', this.boundPointerUp);
      canvas.addEventListener('pointermove', this.boundPointerMove);
    } else {
      canvas.removeEventListener('pointerdown', this.boundPointerDown);
      canvas.removeEventListener('pointerup', this.boundPointerUp);
      canvas.removeEventListener('pointermove', this.boundPointerMove);
      this.pointerDown = null;
    }
  }

  private eventToNdc(e: PointerEvent): THREE.Vector2 {
    const rect = this.game.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    return this.pointer;
  }

  private pickMark(e: PointerEvent): THREE.Object3D | null {
    this.eventToNdc(e);
    this.raycaster.setFromCamera(this.pointer, this.game.camera);
    const hits = this.raycaster.intersectObjects(this.markers.children, true);
    for (const hit of hits) {
      let node: THREE.Object3D | null = hit.object;
      while (node) {
        if (typeof node.userData.mapId === 'string') return node;
        node = node.parent;
      }
    }
    return null;
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.active) return;
    this.pointerDown = { x: e.clientX, y: e.clientY };
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.active) return;
    this.game.renderer.domElement.style.cursor = this.pickMark(e) ? 'pointer' : '';
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.active || !this.pointerDown) return;
    const dx = e.clientX - this.pointerDown.x;
    const dy = e.clientY - this.pointerDown.y;
    this.pointerDown = null;
    if (dx * dx + dy * dy > 64) return;

    const mark = this.pickMark(e);
    if (!mark) return;
    const id = mark.userData.mapId as string;
    const dir = this.directionFor(id);
    if (!dir) return;
    this.spinTarget = Math.atan2(dir.z, dir.x);
  }

  private directionFor(id: string): THREE.Vector3 | null {
    if (id === 'you') return this.game.character.group.position.clone().normalize();
    if (id === 'target') {
      const delivery = this.game.deliverySystem;
      const targetName = delivery.currentDelivery
        ? (delivery.hasLetter ? delivery.currentDelivery.to : delivery.currentDelivery.from)
        : null;
      const npc = targetName ? this.game.npcManager.getNPCByName(targetName) : null;
      return npc ? npc.mesh.position.clone().normalize() : null;
    }
    const area = this.game.planet.areas.find(a => a.name === id);
    return area ? area.center.clone().normalize() : null;
  }

  /** Stand a pin upright on the surface under `position`. */
  private placePin(pin: THREE.Object3D, position: THREE.Vector3): void {
    const up = position.clone().normalize();
    pin.position.copy(up.clone().multiplyScalar(this.game.planetRadius));
    pin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  }

  public update(delta: number): void {
    if (!this.active) return;

    if (this.spinTarget !== null) {
      let gap = this.spinTarget - this.spin;
      while (gap > Math.PI) gap -= Math.PI * 2;
      while (gap < -Math.PI) gap += Math.PI * 2;
      const step = 1 - Math.exp(-4.2 * delta);
      this.spin += gap * step;
      if (Math.abs(gap) < 0.012) this.spinTarget = null;
    } else {
      // Drift round the planet so the far side comes into view on its own.
      this.spin += delta * 0.16;
    }

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

    for (const [name, mark] of this.placeMarks) {
      const area = this.game.planet.areas.find(a => a.name === name);
      if (!area) {
        mark.visible = false;
        continue;
      }
      mark.visible = true;
      this.placePin(mark, area.center);
    }
  }

  /** Sky colour to sit the globe against while the map is open. */
  public get backdrop(): number {
    return SKY.zenith;
  }
}
