import * as THREE from 'three';
import { Game } from '../core/Game';

export class HUD {
  private game: Game;
  private container: HTMLElement;
  private compassArrow: HTMLElement;
  private secretsCounter: HTMLElement;
  
  private visible: boolean = false;

  constructor(game: Game) {
    this.game = game;
    
    this.container = document.createElement('div');
    this.container.id = 'hud-container';
    this.container.innerHTML = `
      <style>
        #hud-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 50;
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        #hud-container.visible {
          opacity: 1;
        }
        
        #delivery-info {
          position: absolute;
          top: 20px;
          left: 20px;
          background: rgba(30, 30, 40, 0.85);
          border: 2px solid #ffeaa7;
          border-radius: 10px;
          padding: 15px 20px;
          color: #fff;
          font-family: 'Segoe UI', system-ui, sans-serif;
          max-width: 280px;
        }
        
        #delivery-title {
          font-size: 0.85rem;
          color: #ffeaa7;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 8px;
        }
        
        #delivery-recipient {
          font-size: 1.1rem;
          font-weight: bold;
          color: #fff;
          margin-bottom: 4px;
        }
        
        #delivery-status {
          font-size: 0.9rem;
          color: #a0a0a0;
        }
        
        #delivery-count {
          font-size: 0.85rem;
          color: #ffeaa7;
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid rgba(255, 234, 167, 0.3);
        }
        
        #compass {
          position: absolute;
          top: 20px;
          right: 20px;
          width: 70px;
          height: 70px;
          background: rgba(30, 30, 40, 0.85);
          border: 2px solid #ffeaa7;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        #compass-arrow {
          width: 0;
          height: 0;
          border-left: 8px solid transparent;
          border-right: 8px solid transparent;
          border-bottom: 30px solid #e74c3c;
          transform-origin: center 20px;
          transition: transform 0.1s ease;
        }
        
        #compass-arrow::after {
          content: '';
          position: absolute;
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 15px solid #ecf0f1;
          transform: translate(-6px, 10px);
        }
        
        #compass-center {
          position: absolute;
          width: 10px;
          height: 10px;
          background: #ffeaa7;
          border-radius: 50%;
        }
        
        #secrets-counter {
          position: absolute;
          bottom: 20px;
          left: 20px;
          background: rgba(30, 30, 40, 0.85);
          border: 2px solid #9b59b6;
          border-radius: 8px;
          padding: 10px 15px;
          color: #fff;
          font-family: 'Segoe UI', system-ui, sans-serif;
          font-size: 0.9rem;
        }
        
        #secrets-counter span {
          color: #9b59b6;
        }
        
        #interaction-hint {
          position: absolute;
          bottom: 50%;
          left: 50%;
          transform: translate(-50%, 50%);
          background: rgba(30, 30, 40, 0.9);
          border: 2px solid #ffeaa7;
          border-radius: 8px;
          padding: 10px 20px;
          color: #ffeaa7;
          font-family: 'Segoe UI', system-ui, sans-serif;
          font-size: 1rem;
          opacity: 0;
          transition: opacity 0.2s ease;
          pointer-events: none;
        }
        
        #interaction-hint.visible {
          opacity: 1;
        }
      </style>
      
      <div id="delivery-info">
        <div id="delivery-title">Current Delivery</div>
        <div id="delivery-recipient">-</div>
        <div id="delivery-status">Waiting for assignment...</div>
        <div id="delivery-count">0/5 deliveries</div>
      </div>
      
      <div id="compass">
        <div id="compass-arrow"></div>
        <div id="compass-center"></div>
      </div>
      
      <div id="secrets-counter">
        Secrets: <span>0</span>/3
      </div>
      
      <div id="interaction-hint">Press E to talk</div>
    `;
    
    document.body.appendChild(this.container);
    
    this.compassArrow = document.getElementById('compass-arrow')!;
    this.secretsCounter = document.getElementById('secrets-counter')!;
  }

  public show(): void {
    this.visible = true;
    this.container.classList.add('visible');
  }

  public hide(): void {
    this.visible = false;
    this.container.classList.remove('visible');
  }

  public update(): void {
    if (!this.visible) return;
    
    const delivery = this.game.deliverySystem;
    const recipientEl = document.getElementById('delivery-recipient')!;
    const statusEl = document.getElementById('delivery-status')!;
    const countEl = document.getElementById('delivery-count')!;
    const hintEl = document.getElementById('interaction-hint')!;
    
    countEl.textContent = `${delivery.completedCount}/5 deliveries`;
    
    if (delivery.gameComplete) {
      recipientEl.textContent = 'All done!';
      statusEl.textContent = 'Every letter delivered. Great work!';
      this.compassArrow.style.opacity = '0.3';
    } else if (delivery.currentDelivery) {
      if (delivery.hasLetter) {
        recipientEl.textContent = `To: ${delivery.currentDelivery.to}`;
        statusEl.textContent = 'Find them and deliver the letter';
      } else {
        recipientEl.textContent = `From: ${delivery.currentDelivery.from}`;
        statusEl.textContent = 'Talk to them to pick up a letter';
      }
    }
    
    this.updateCompass();
    this.updateSecrets();
    this.updateInteractionHint(hintEl);
  }

  private updateCompass(): void {
    const delivery = this.game.deliverySystem;
    const recipientPos = delivery.getRecipientPosition();
    
    if (!recipientPos || delivery.gameComplete) {
      this.compassArrow.style.opacity = '0.3';
      return;
    }
    
    this.compassArrow.style.opacity = '1';
    
    const playerPos = this.game.character.getPosition();
    const playerForward = this.game.character.getForward();
    const playerUp = playerPos.clone().normalize();
    
    let toTarget = recipientPos.clone().sub(playerPos);
    toTarget.sub(playerUp.clone().multiplyScalar(toTarget.dot(playerUp)));
    toTarget.normalize();
    
    const playerRight = new THREE.Vector3().crossVectors(playerForward, playerUp).normalize();
    
    const forward = playerForward.dot(toTarget);
    const right = playerRight.dot(toTarget);
    
    const angle = Math.atan2(right, forward);
    this.compassArrow.style.transform = `rotate(${angle}rad)`;
  }

  private updateSecrets(): void {
    const secretsSpan = this.secretsCounter.querySelector('span')!;
    const foundCount = this.game.secrets.getFoundCount();
    secretsSpan.textContent = foundCount.toString();
  }

  private updateInteractionHint(hintEl: HTMLElement): void {
    const nearestNPC = this.game.npcManager.getNearestNPC(
      this.game.character.getPosition()
    );
    
    if (nearestNPC) {
      const delivery = this.game.deliverySystem;
      if (delivery.canPickupFrom(nearestNPC.name)) {
        hintEl.textContent = 'Press E to pick up letter';
      } else if (delivery.canDeliverTo(nearestNPC.name)) {
        hintEl.textContent = 'Press E to deliver letter';
      } else {
        hintEl.textContent = `Press E to talk to ${nearestNPC.name.split(' ')[1]}`;
      }
      hintEl.classList.add('visible');
    } else {
      hintEl.classList.remove('visible');
    }
  }

  public dispose(): void {
    this.container.remove();
  }
}
