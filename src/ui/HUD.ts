import * as THREE from 'three';
import { Game } from '../core/Game';

export class HUD {
  private game: Game;
  private container: HTMLElement;
  private compassArrow: HTMLElement;
  private checklistPanel: HTMLElement;
  
  private visible: boolean = false;
  private checklistVisible: boolean = false;

  constructor(game: Game) {
    this.game = game;
    
    this.container = document.createElement('div');
    this.container.id = 'hud-container';
    this.container.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Patrick+Hand&display=swap');
        
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
          font-family: 'Patrick Hand', cursive;
        }
        #hud-container.visible {
          opacity: 1;
        }
        
        #checklist-toggle {
          position: absolute;
          top: 20px;
          right: 20px;
          background: #fff;
          border: 3px solid #1a1a1a;
          border-radius: 8px;
          padding: 10px 15px;
          cursor: pointer;
          pointer-events: auto;
          box-shadow: 3px 3px 0 #1a1a1a;
          font-family: 'Patrick Hand', cursive;
          font-size: 1.1rem;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        #checklist-toggle:hover {
          transform: translate(-1px, -1px);
          box-shadow: 4px 4px 0 #1a1a1a;
        }
        
        #checklist-panel {
          position: absolute;
          top: 80px;
          right: 20px;
          background: #fff;
          border: 4px solid #1a1a1a;
          border-radius: 12px;
          padding: 20px;
          width: 320px;
          box-shadow: 5px 5px 0 #1a1a1a;
          pointer-events: auto;
          display: none;
        }
        
        #checklist-panel.visible {
          display: block;
        }
        
        #checklist-panel h2 {
          font-size: 1.4rem;
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 2px solid #1a1a1a;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .story-chain {
          margin: 12px 0;
          padding-left: 5px;
        }
        
        .story-chain-title {
          font-size: 1.1rem;
          color: #1a1a1a;
          display: flex;
          justify-content: space-between;
        }
        
        .story-chain-title.completed {
          text-decoration: line-through;
          color: #888;
        }
        
        .story-chain-progress {
          font-size: 0.95rem;
          color: #666;
        }
        
        #compass {
          position: absolute;
          top: 20px;
          left: 20px;
          width: 60px;
          height: 60px;
          background: #fff;
          border: 3px solid #1a1a1a;
          border-radius: 50%;
          box-shadow: 3px 3px 0 #1a1a1a;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        #compass-arrow {
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-bottom: 25px solid #e74c3c;
          transform-origin: center 15px;
          transition: transform 0.1s ease;
        }
        
        #compass-arrow::after {
          content: '';
          position: absolute;
          width: 0;
          height: 0;
          border-left: 4px solid transparent;
          border-right: 4px solid transparent;
          border-top: 12px solid #1a1a1a;
          transform: translate(-4px, 8px);
        }
        
        #current-task {
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: #fff;
          border: 3px solid #1a1a1a;
          border-radius: 8px;
          padding: 12px 20px;
          box-shadow: 3px 3px 0 #1a1a1a;
          text-align: center;
          max-width: 400px;
        }
        
        #current-task-text {
          font-size: 1.15rem;
          color: #1a1a1a;
        }
        
        #interaction-hint {
          position: absolute;
          bottom: 45%;
          left: 50%;
          transform: translateX(-50%);
          background: #fff;
          border: 3px solid #1a1a1a;
          border-radius: 8px;
          padding: 10px 18px;
          font-size: 1.1rem;
          opacity: 0;
          transition: opacity 0.15s ease;
          box-shadow: 3px 3px 0 #1a1a1a;
        }
        
        #interaction-hint.visible {
          opacity: 1;
        }
        
        #emote-wheel {
          position: absolute;
          bottom: 100px;
          right: 20px;
          background: #fff;
          border: 3px solid #1a1a1a;
          border-radius: 8px;
          padding: 8px;
          display: flex;
          gap: 8px;
          box-shadow: 3px 3px 0 #1a1a1a;
          pointer-events: auto;
        }
        
        .emote-btn {
          width: 40px;
          height: 40px;
          background: #f8f8f8;
          border: 2px solid #1a1a1a;
          border-radius: 6px;
          font-size: 1.3rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .emote-btn:hover {
          background: #f4d03f;
        }
      </style>
      
      <div id="compass">
        <div id="compass-arrow"></div>
      </div>
      
      <button id="checklist-toggle">📋 Checklist</button>
      
      <div id="checklist-panel">
        <h2>Checklist:</h2>
        <div id="checklist-items"></div>
      </div>
      
      <div id="current-task">
        <div id="current-task-text">Talk to Postmaster Maple to start your deliveries!</div>
      </div>
      
      <div id="interaction-hint">Press E to talk</div>
      
      <div id="emote-wheel">
        <button class="emote-btn" data-emote="wave">👋</button>
        <button class="emote-btn" data-emote="happy">😊</button>
        <button class="emote-btn" data-emote="think">🤔</button>
        <button class="emote-btn" data-emote="heart">❤️</button>
      </div>
    `;
    
    document.body.appendChild(this.container);
    
    this.compassArrow = document.getElementById('compass-arrow')!;
    this.checklistPanel = document.getElementById('checklist-panel')!;
    
    const checklistToggle = document.getElementById('checklist-toggle')!;
    checklistToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.checklistVisible = !this.checklistVisible;
      this.checklistPanel.classList.toggle('visible', this.checklistVisible);
    });
    checklistToggle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    
    document.querySelectorAll('.emote-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const emote = (e.target as HTMLElement).getAttribute('data-emote');
        this.playEmote(emote!);
      });
    });
    
    this.updateChecklist();
  }

  private playEmote(emote: string): void {
    const emoteSprite = document.createElement('div');
    emoteSprite.style.cssText = `
      position: fixed;
      top: 40%;
      left: 50%;
      transform: translateX(-50%);
      font-size: 3rem;
      animation: emoteFloat 2s ease-out forwards;
      z-index: 100;
      pointer-events: none;
    `;
    
    const emoteMap: Record<string, string> = {
      wave: '👋',
      happy: '😊',
      think: '🤔',
      heart: '❤️'
    };
    
    emoteSprite.textContent = emoteMap[emote] || '✨';
    document.body.appendChild(emoteSprite);
    
    const style = document.createElement('style');
    style.textContent = `
      @keyframes emoteFloat {
        0% { opacity: 1; transform: translateX(-50%) translateY(0); }
        100% { opacity: 0; transform: translateX(-50%) translateY(-60px); }
      }
    `;
    document.head.appendChild(style);
    
    setTimeout(() => {
      emoteSprite.remove();
      style.remove();
    }, 2000);
  }

  private updateChecklist(): void {
    const checklistItems = document.getElementById('checklist-items')!;
    const chains = this.game.deliverySystem.getStoryChains();
    
    checklistItems.innerHTML = chains.map(chain => `
      <div class="story-chain">
        <div class="story-chain-title ${chain.completed ? 'completed' : ''}">
          ${chain.id}. ${chain.title}
          <span class="story-chain-progress">(${chain.progress}/${chain.total})</span>
        </div>
      </div>
    `).join('');
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
    const taskText = document.getElementById('current-task-text')!;
    const hintEl = document.getElementById('interaction-hint')!;
    
    if (delivery.gameComplete) {
      taskText.textContent = 'All deliveries complete! Thanks for playing!';
      this.compassArrow.style.opacity = '0.3';
    } else if (delivery.currentDelivery) {
      if (delivery.hasLetter) {
        taskText.textContent = `Deliver to: ${delivery.currentDelivery.to}`;
      } else {
        taskText.textContent = `Pick up from: ${delivery.currentDelivery.from}`;
      }
    }
    
    this.updateCompass();
    this.updateChecklist();
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

  private updateInteractionHint(hintEl: HTMLElement): void {
    const playerPos = this.game.character.getPosition();
    const nearestNPC = this.game.npcManager.getNearestNPC(playerPos);
    
    if (nearestNPC) {
      const npcWorldPos = nearestNPC.mesh.position;
      const playerDir = playerPos.clone().normalize();
      const npcDir = npcWorldPos.clone().normalize();
      const dot = Math.max(-1, Math.min(1, playerDir.dot(npcDir)));
      const angle = Math.acos(dot);
      const arcDist = this.game.planetRadius * angle;
      
      if (arcDist > 6) {
        hintEl.classList.remove('visible');
        return;
      }
      
      const delivery = this.game.deliverySystem;
      if (delivery.canPickupFrom(nearestNPC.name)) {
        hintEl.textContent = 'Press E to pick up letter';
      } else if (delivery.canDeliverTo(nearestNPC.name)) {
        hintEl.textContent = 'Press E to deliver letter';
      } else {
        hintEl.textContent = `Press E to talk`;
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
