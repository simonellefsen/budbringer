import * as THREE from 'three';
import { Game, GameState } from '../core/Game';
import { GrazingAnimal } from './Planet';

interface Member {
  mesh: THREE.Object3D;
  home: THREE.Vector3;
  roam: number;
  dest: THREE.Vector3;
  wait: number;
  speed: number;
  cadence: number;
  moving: boolean;
  walkBlend: number;
  walkPhase: number;
  idlePhase: number;
  facing: THREE.Quaternion;
}

/**
 * Sheep and goats graze inside the disc they were planted in.
 *
 * The kit animals are one mesh — no leg bones — so a stroll is a slow slide
 * plus a whole-body waddle, not the courier's limb mix.
 */
export class Flock {
  private game: Game;
  private members: Member[] = [];

  private readonly _up = new THREE.Vector3();
  private readonly _fwd = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _mat = new THREE.Matrix4();
  private readonly _quat = new THREE.Quaternion();
  private readonly _waddle = new THREE.Quaternion();
  private readonly _euler = new THREE.Euler();

  constructor(game: Game) {
    this.game = game;
    const animals = game.planet.animals;
    for (let i = 0; i < animals.length; i++) {
      this.adopt(animals[i], i);
    }
  }

  private adopt(animal: GrazingAnimal, index: number): void {
    const goat = animal.kind === 'Goat';
    this.members.push({
      mesh: animal.mesh,
      home: animal.home.clone(),
      roam: animal.roam,
      dest: this.pickDest(animal.home, animal.roam, animal.mesh.position),
      wait: 0.6 + index * 0.28 + Math.random() * 2.4,
      speed: goat ? 1.15 : 0.72,
      cadence: goat ? 6.6 : 4.8,
      moving: false,
      walkBlend: 0,
      walkPhase: index * 0.9,
      idlePhase: index * 1.3,
      facing: animal.mesh.quaternion.clone()
    });
  }

  private pickDest(home: THREE.Vector3, roam: number, from: THREE.Vector3): THREE.Vector3 {
    const planet = this.game.planet;
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = roam * Math.sqrt(Math.random());
      const candidate = planet.groundPoint(planet.offsetOnSphere(home, angle, dist));
      if (!this.walkable(candidate)) continue;
      const arc = this.arcBetween(from, candidate);
      if (arc < 0.8) continue;
      return candidate;
    }
    return from.clone();
  }

  private walkable(point: THREE.Vector3): boolean {
    const dir = point.clone().normalize();
    if (this.game.planet.terrain.normalAt(dir).dot(dir) < 0.88) return false;
    const elev = point.length() - this.game.planet.radius;
    return elev > this.game.planet.terrain.waterLevel + 0.7;
  }

  private arcBetween(a: THREE.Vector3, b: THREE.Vector3): number {
    const da = a.clone().normalize();
    const db = b.clone().normalize();
    const dot = THREE.MathUtils.clamp(da.dot(db), -1, 1);
    return this.game.planetRadius * Math.acos(dot);
  }

  private faceToward(member: Member, target: THREE.Vector3, delta: number): void {
    const object = member.mesh;
    this._up.copy(object.position).normalize();
    this._fwd.copy(target).sub(object.position);
    this._fwd.addScaledVector(this._up, -this._fwd.dot(this._up));
    if (this._fwd.lengthSq() < 1e-6) return;
    this._fwd.normalize();
    this._right.crossVectors(this._up, this._fwd).normalize();
    this._fwd.crossVectors(this._right, this._up).normalize();
    this._mat.makeBasis(this._right, this._up, this._fwd);
    this._quat.setFromRotationMatrix(this._mat);
    const t = delta >= 1 ? 1 : 1 - Math.exp(-5 * delta);
    member.facing.slerp(this._quat, t);
  }

  private stepToward(member: Member, distance: number, delta: number): boolean {
    const arc = this.arcBetween(member.mesh.position, member.dest);
    if (arc < 0.28) {
      member.mesh.position.copy(member.dest);
      return true;
    }
    const a = member.mesh.position.clone().normalize();
    const b = member.dest.clone().normalize();
    const t = Math.min(1, distance / arc);
    const dir = a.lerp(b, t).normalize();
    member.mesh.position.copy(this.game.planet.groundPoint(dir));
    this.faceToward(member, member.dest, delta);
    return false;
  }

  private tick(member: Member, delta: number): void {
    if (member.wait > 0) {
      member.moving = false;
      member.wait -= delta;
      return;
    }

    const arrived = this.stepToward(member, member.speed * delta, delta);
    member.moving = !arrived;
    if (arrived) {
      member.wait = 2.6 + Math.random() * 4.8;
      member.dest = this.pickDest(member.home, member.roam, member.mesh.position);
    }
  }

  /**
   * A waddle on the whole mesh: the kit animal has no limbs to swing.
   * Grazing is a slow nod while they stand.
   */
  private pose(member: Member, delta: number): void {
    member.walkBlend = THREE.MathUtils.damp(
      member.walkBlend,
      member.moving ? 1 : 0,
      7,
      delta
    );
    member.idlePhase += delta * 0.9;
    if (member.walkBlend > 0.01) member.walkPhase += delta * member.cadence;

    const w = member.walkBlend;
    const bob = Math.abs(Math.sin(member.walkPhase)) * 0.035 * w;
    const graze = Math.max(0, Math.sin(member.idlePhase * 0.7)) * 0.14 * (1 - w);
    this._euler.set(0.05 * w + graze, 0, Math.sin(member.walkPhase) * 0.11 * w);
    this._waddle.setFromEuler(this._euler);

    const grounded = this.game.planet.groundPoint(member.mesh.position);
    this._up.copy(grounded).normalize();
    member.mesh.position.copy(grounded).addScaledVector(this._up, bob);
    member.mesh.quaternion.copy(member.facing).multiply(this._waddle);
  }

  public update(delta: number): void {
    if (this.game.state !== GameState.PLAYING && this.game.state !== GameState.TITLE) {
      return;
    }
    for (const member of this.members) {
      this.tick(member, delta);
      this.pose(member, delta);
    }
  }
}
