import { Game } from './Game';

export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  interact: boolean;
  lookDeltaX: number;
  lookDeltaY: number;
}

export class InputManager {
  private game: Game;
  private enabled: boolean = false;
  private pointerLocked: boolean = false;
  
  public state: InputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    interact: false,
    lookDeltaX: 0,
    lookDeltaY: 0
  };
  
  private touchStartX: number = 0;
  private touchStartY: number = 0;
  private touchMoveId: number | null = null;
  private touchLookId: number | null = null;
  private stickOriginX: number = 0;
  private stickOriginY: number = 0;
  private virtualJoystick: HTMLElement | null = null;
  private joystickKnob: HTMLElement | null = null;
  private mobile = false;
  
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseDown: (e: MouseEvent) => void;
  private boundTouchStart: (e: TouchEvent) => void;
  private boundTouchMove: (e: TouchEvent) => void;
  private boundTouchEnd: (e: TouchEvent) => void;
  private boundPointerLockChange: () => void;

  constructor(game: Game) {
    this.game = game;
    
    this.boundKeyDown = this.onKeyDown.bind(this);
    this.boundKeyUp = this.onKeyUp.bind(this);
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundMouseDown = this.onMouseDown.bind(this);
    this.boundTouchStart = this.onTouchStart.bind(this);
    this.boundTouchMove = this.onTouchMove.bind(this);
    this.boundTouchEnd = this.onTouchEnd.bind(this);
    this.boundPointerLockChange = this.onPointerLockChange.bind(this);
    
    document.addEventListener('keydown', this.boundKeyDown);
    document.addEventListener('keyup', this.boundKeyUp);
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('pointerlockchange', this.boundPointerLockChange);
    
    this.createMobileControls();
  }

  public setupCanvasEvents(): void {
    const canvas = this.game.renderer.domElement;
    canvas.addEventListener('mousedown', this.boundMouseDown);
    canvas.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.boundTouchEnd);
    canvas.addEventListener('touchcancel', this.boundTouchEnd);
  }

  private createMobileControls(): void {
    this.mobile = InputManager.isCoarse();
    if (!this.mobile) return;
    
    const controls = document.createElement('div');
    controls.id = 'mobile-controls';
    controls.innerHTML = `
      <style>
        #mobile-controls {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 80;
          display: none;
        }
        #mobile-controls.visible { display: block; }
        .joystick-area {
          position: absolute;
          left: calc(28px + env(safe-area-inset-left));
          bottom: calc(28px + env(safe-area-inset-bottom));
          width: 132px;
          height: 132px;
          margin: 0;
          background: rgba(255,255,255,0.16);
          border-radius: 50%;
          pointer-events: none;
          border: 3px solid rgba(255,255,255,0.35);
          opacity: 0.55;
        }
        .joystick-area.active { opacity: 1; }
        .joystick-knob {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 52px;
          height: 52px;
          margin: -26px 0 0 -26px;
          background: rgba(255,255,255,0.55);
          border-radius: 50%;
        }
        .action-buttons {
          position: absolute;
          right: calc(16px + env(safe-area-inset-right));
          bottom: calc(22px + env(safe-area-inset-bottom));
          display: flex;
          flex-direction: column-reverse;
          gap: 12px;
        }
        .action-btn {
          width: 68px;
          height: 68px;
          border-radius: 50%;
          background: #fffdf6;
          border: 3px solid #2a2118;
          box-shadow: 3px 3px 0 #2a2118;
          color: #2a2118;
          font-size: 13px;
          font-family: 'Patrick Hand', cursive;
          font-weight: bold;
          pointer-events: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          -webkit-tap-highlight-color: transparent;
        }
        .action-btn:active { background: #f4d03f; }
      </style>
      <div class="joystick-area" id="joystick">
        <div class="joystick-knob" id="joystick-knob"></div>
      </div>
      <div class="action-buttons">
        <button class="action-btn" id="btn-jump" type="button">HOP</button>
        <button class="action-btn" id="btn-interact" type="button">TALK</button>
      </div>
    `;
    document.body.appendChild(controls);
    
    this.virtualJoystick = document.getElementById('joystick');
    this.joystickKnob = document.getElementById('joystick-knob');
    
    const jumpBtn = document.getElementById('btn-jump');
    const interactBtn = document.getElementById('btn-interact');
    
    const hold = (el: HTMLElement | null, on: () => void, off: () => void) => {
      if (!el) return;
      const start = (e: Event) => { e.preventDefault(); e.stopPropagation(); on(); };
      const end = (e: Event) => { e.preventDefault(); e.stopPropagation(); off(); };
      el.addEventListener('pointerdown', start);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('touchstart', start, { passive: false });
      el.addEventListener('touchend', end);
    };
    hold(jumpBtn, () => { this.state.jump = true; }, () => { this.state.jump = false; });
    hold(interactBtn, () => { this.state.interact = true; }, () => { this.state.interact = false; });
  }

  public static isCoarse(): boolean {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const small = Math.min(window.innerWidth, window.innerHeight) <= 920;
    return coarse || ('ontouchstart' in window && small);
  }

  private isMobile(): boolean {
    return this.mobile || InputManager.isCoarse();
  }

  public enable(): void {
    this.enabled = true;
    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls && this.isMobile()) {
      mobileControls.classList.add('visible');
    }
  }

  public disable(): void {
    this.enabled = false;
    this.resetState();
  }

  private resetState(): void {
    this.state.forward = false;
    this.state.backward = false;
    this.state.left = false;
    this.state.right = false;
    this.state.jump = false;
    this.state.interact = false;
    this.state.lookDeltaX = 0;
    this.state.lookDeltaY = 0;
  }

  private onKeyDown(e: KeyboardEvent): void {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.state.forward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.state.backward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.state.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.state.right = true;
        break;
      case 'Space':
        if (this.enabled) {
          this.state.jump = true;
          e.preventDefault();
        }
        break;
      case 'KeyE':
      case 'Enter':
        this.state.interact = true;
        break;
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.state.forward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.state.backward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.state.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.state.right = false;
        break;
      case 'Space':
        this.state.jump = false;
        break;
      case 'KeyE':
      case 'Enter':
        this.state.interact = false;
        break;
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.enabled) return;
    
    if (this.pointerLocked) {
      this.state.lookDeltaX = e.movementX;
      this.state.lookDeltaY = e.movementY;
    }
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.enabled) return;
    if (this.isMobile()) return;
    
    if (e.button === 0 && !this.pointerLocked) {
      this.game.renderer.domElement.requestPointerLock();
    }
  }

  private onPointerLockChange(): void {
    this.pointerLocked = document.pointerLockElement === this.game.renderer.domElement;
  }

  private uiBlocksStick(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el || !el.closest) return false;
    return !!el.closest('.action-btn, .hud-card, #hud-stack, #checklist-panel, #enter-button, button, a');
  }

  private onTouchStart(e: TouchEvent): void {
    if (!this.enabled) return;
    
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (this.uiBlocksStick(touch.target)) continue;
      e.preventDefault();

      // Left ~60% of the screen is the stick, like the reference: the
      // ring appears under the thumb instead of only in a corner well.
      if (this.touchMoveId === null && touch.clientX < window.innerWidth * 0.62) {
        this.touchMoveId = touch.identifier;
        this.stickOriginX = touch.clientX;
        this.stickOriginY = touch.clientY;
        if (this.virtualJoystick) {
          this.virtualJoystick.classList.add('active');
          this.virtualJoystick.style.left = `${touch.clientX}px`;
          this.virtualJoystick.style.bottom = 'auto';
          this.virtualJoystick.style.top = `${touch.clientY}px`;
          this.virtualJoystick.style.transform = 'translate(-50%, -50%)';
        }
      } else if (this.touchLookId === null) {
        this.touchLookId = touch.identifier;
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
      }
    }
  }

  private onTouchMove(e: TouchEvent): void {
    if (!this.enabled) return;
    
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      
      if (touch.identifier === this.touchMoveId) {
        e.preventDefault();
        const maxDist = 52;
        let dx = touch.clientX - this.stickOriginX;
        let dy = touch.clientY - this.stickOriginY;
        const dist = Math.hypot(dx, dy);
        if (dist > maxDist) {
          dx = (dx / dist) * maxDist;
          dy = (dy / dist) * maxDist;
        }
        if (this.joystickKnob) {
          this.joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
        }
        const nx = dx / maxDist;
        const ny = dy / maxDist;
        const dead = 0.18;
        this.state.forward = ny < -dead;
        this.state.backward = ny > dead;
        this.state.left = nx < -dead;
        this.state.right = nx > dead;
      }
      
      if (touch.identifier === this.touchLookId) {
        e.preventDefault();
        const dx = touch.clientX - this.touchStartX;
        const dy = touch.clientY - this.touchStartY;
        this.state.lookDeltaX += dx * 2.6;
        this.state.lookDeltaY += dy * 2.2;
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
      }
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      
      if (touch.identifier === this.touchMoveId) {
        this.touchMoveId = null;
        this.state.forward = false;
        this.state.backward = false;
        this.state.left = false;
        this.state.right = false;
        if (this.joystickKnob) this.joystickKnob.style.transform = 'translate(0, 0)';
        if (this.virtualJoystick) {
          this.virtualJoystick.classList.remove('active');
          this.virtualJoystick.style.left = 'calc(28px + env(safe-area-inset-left))';
          this.virtualJoystick.style.top = 'auto';
          this.virtualJoystick.style.bottom = 'calc(28px + env(safe-area-inset-bottom))';
          this.virtualJoystick.style.transform = 'none';
        }
      }
      
      if (touch.identifier === this.touchLookId) {
        this.touchLookId = null;
      }
    }
  }

  public consumeInteract(): boolean {
    if (this.state.interact) {
      this.state.interact = false;
      return true;
    }
    return false;
  }

  public consumeLookDelta(): { x: number; y: number } {
    const delta = { x: this.state.lookDeltaX, y: this.state.lookDeltaY };
    this.state.lookDeltaX = 0;
    this.state.lookDeltaY = 0;
    return delta;
  }

  public dispose(): void {
    document.removeEventListener('keydown', this.boundKeyDown);
    document.removeEventListener('keyup', this.boundKeyUp);
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('pointerlockchange', this.boundPointerLockChange);
    
    const canvas = this.game.renderer.domElement;
    canvas.removeEventListener('mousedown', this.boundMouseDown);
    canvas.removeEventListener('touchstart', this.boundTouchStart);
    canvas.removeEventListener('touchmove', this.boundTouchMove);
    canvas.removeEventListener('touchend', this.boundTouchEnd);
    canvas.removeEventListener('touchcancel', this.boundTouchEnd);
    
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }
}
