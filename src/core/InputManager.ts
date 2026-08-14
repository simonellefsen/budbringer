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
  private touchMoveId: number | null = null;
  private touchLookId: number | null = null;
  private virtualJoystick: HTMLElement | null = null;
  private joystickKnob: HTMLElement | null = null;
  
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
  }

  private createMobileControls(): void {
    if (!this.isMobile()) return;
    
    const controls = document.createElement('div');
    controls.id = 'mobile-controls';
    controls.innerHTML = `
      <style>
        #mobile-controls {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 200px;
          pointer-events: none;
          z-index: 100;
          display: none;
        }
        #mobile-controls.visible {
          display: block;
        }
        .joystick-area {
          position: absolute;
          left: 20px;
          bottom: 20px;
          width: 140px;
          height: 140px;
          background: rgba(255,255,255,0.15);
          border-radius: 50%;
          pointer-events: auto;
          border: 3px solid rgba(255,255,255,0.3);
        }
        .joystick-knob {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 50px;
          height: 50px;
          margin: -25px 0 0 -25px;
          background: rgba(255,255,255,0.5);
          border-radius: 50%;
          transition: none;
        }
        .action-buttons {
          position: absolute;
          right: 20px;
          bottom: 20px;
          display: flex;
          gap: 15px;
        }
        .action-btn {
          width: 70px;
          height: 70px;
          border-radius: 50%;
          background: rgba(255,255,255,0.3);
          border: 3px solid rgba(255,255,255,0.5);
          color: white;
          font-size: 14px;
          font-weight: bold;
          pointer-events: auto;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .action-btn:active {
          background: rgba(255,255,255,0.5);
        }
      </style>
      <div class="joystick-area" id="joystick">
        <div class="joystick-knob" id="joystick-knob"></div>
      </div>
      <div class="action-buttons">
        <button class="action-btn" id="btn-jump">HOP</button>
        <button class="action-btn" id="btn-interact">TALK</button>
      </div>
    `;
    document.body.appendChild(controls);
    
    this.virtualJoystick = document.getElementById('joystick');
    this.joystickKnob = document.getElementById('joystick-knob');
    
    const jumpBtn = document.getElementById('btn-jump');
    const interactBtn = document.getElementById('btn-interact');
    
    jumpBtn?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.state.jump = true;
    });
    jumpBtn?.addEventListener('touchend', () => {
      this.state.jump = false;
    });
    
    interactBtn?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.state.interact = true;
    });
    interactBtn?.addEventListener('touchend', () => {
      this.state.interact = false;
    });
  }

  private isMobile(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
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
    if (!this.enabled) return;
    
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
        this.state.jump = true;
        e.preventDefault();
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
    
    if (e.button === 0 && !this.pointerLocked) {
      this.game.renderer.domElement.requestPointerLock();
    }
  }

  private onPointerLockChange(): void {
    this.pointerLocked = document.pointerLockElement === this.game.renderer.domElement;
  }

  private onTouchStart(e: TouchEvent): void {
    if (!this.enabled) return;
    
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const target = touch.target as HTMLElement;
      
      if (target.id === 'joystick' || target.id === 'joystick-knob') {
        e.preventDefault();
        this.touchMoveId = touch.identifier;
        this.touchStartX = touch.clientX;
      } else if (touch.clientX > window.innerWidth / 2 && 
                 !target.classList.contains('action-btn')) {
        this.touchLookId = touch.identifier;
        this.touchStartX = touch.clientX;
      }
    }
  }

  private onTouchMove(e: TouchEvent): void {
    if (!this.enabled) return;
    
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      
      if (touch.identifier === this.touchMoveId) {
        e.preventDefault();
        const rect = this.virtualJoystick!.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = rect.width / 2 - 25;
        
        if (dist > maxDist) {
          dx = (dx / dist) * maxDist;
          dy = (dy / dist) * maxDist;
        }
        
        if (this.joystickKnob) {
          this.joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
        }
        
        const threshold = 0.3;
        const normalizedX = dx / maxDist;
        const normalizedY = dy / maxDist;
        
        this.state.forward = normalizedY < -threshold;
        this.state.backward = normalizedY > threshold;
        this.state.left = normalizedX < -threshold;
        this.state.right = normalizedX > threshold;
      }
      
      if (touch.identifier === this.touchLookId) {
        const dx = touch.clientX - this.touchStartX;
        this.state.lookDeltaX = dx * 0.5;
        this.touchStartX = touch.clientX;
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
        
        if (this.joystickKnob) {
          this.joystickKnob.style.transform = 'translate(0, 0)';
        }
      }
      
      if (touch.identifier === this.touchLookId) {
        this.touchLookId = null;
        this.state.lookDeltaX = 0;
        this.state.lookDeltaY = 0;
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
    
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }
}
