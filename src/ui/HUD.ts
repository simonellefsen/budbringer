import * as THREE from 'three';
import { Game } from '../core/Game';

export class HUD {
  private game: Game;
  private container: HTMLElement;
  private compassArrow: HTMLElement;
  private checklistPanel: HTMLElement;
  private areaLabel!: HTMLElement;

  private visible: boolean = false;
  private checklistVisible: boolean = false;

  /** Which named region the player is standing in, so we only announce changes. */
  private currentArea: string | null = null;
  private areaHideTimer: number | null = null;

  constructor(game: Game) {
    this.game = game;
    
    this.container = document.createElement('div');
    this.container.id = 'hud-container';
    this.container.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Lilita+One&family=Patrick+Hand&display=swap');
        
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

        /* With the map open the globe is the subject; the street-level
           readouts would just sit on top of it. */
        #hud-container.map-open #compass,
        #hud-container.map-open #current-task,
        #hud-container.map-open #interaction-hint,
        #hud-container.map-open #emote-wheel,
        #hud-container.map-open #hud-stack,
        #hud-container.map-open #area-name {
          opacity: 0;
          transition: opacity 0.25s ease;
        }

        #map-hint {
          position: absolute;
          left: 50%;
          bottom: max(22px, calc(env(safe-area-inset-bottom, 0px) + 14px));
          transform: translateX(-50%);
          background: #fffdf6;
          border: 3px solid #2a2118;
          border-radius: 8px;
          padding: 8px 14px;
          font-size: 0.95rem;
          color: #2a2118;
          box-shadow: 3px 3px 0 #2a2118;
          opacity: 0;
          pointer-events: none;
          white-space: nowrap;
          transition: opacity 0.25s ease;
        }

        #hud-container.map-open #map-hint {
          opacity: 1;
        }
        
        #hud-stack {
          position: absolute;
          right: 22px;
          bottom: 28px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          pointer-events: auto;
          z-index: 2;
        }

        .hud-card {
          width: 52px;
          height: 52px;
          background: #fffdf6;
          border: 3px solid #2a2118;
          border-radius: 10px;
          box-shadow: 3px 3px 0 #2a2118;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          font-size: 1.25rem;
        }

        .hud-card:hover { background: #f4d03f; }
        .hud-card.open { background: #f4d03f; }
        .hud-card.muted { background: #e4ded0; color: #8a8378; }

        #checklist-toggle {
          position: static;
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

        #mail-reset {
          margin-top: 14px;
          width: 100%;
          background: #fffdf6;
          color: #2a2118;
          border: 3px solid #2a2118;
          border-radius: 8px;
          padding: 8px 10px;
          font-family: 'Patrick Hand', cursive;
          font-size: 1.05rem;
          cursor: pointer;
          box-shadow: 3px 3px 0 #2a2118;
        }

        #mail-reset.armed {
          background: #f5c842;
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
          transition: transform 0.1s ease, border-bottom-color 0.2s ease;
        }

        #compass-arrow.pin {
          border-bottom-color: #d4788a;
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
          position: static;
          background: transparent;
          border: none;
          box-shadow: none;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        /* Place-name card, bottom left, in the reference's chunky style:
           heavy letterforms, hard offset shadow, no panel behind it. */
        #area-name {
          position: absolute;
          left: 34px;
          bottom: 42px;
          max-width: 46vw;
          font-family: 'Lilita One', 'Patrick Hand', cursive;
          font-size: clamp(2.1rem, 5vw, 3.6rem);
          line-height: 0.92;
          font-weight: 400;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: #fdfaf2;
          -webkit-text-stroke: 5px #2a2118;
          paint-order: stroke fill;
          text-shadow:
            5px 5px 0 #2a2118,
            0 6px 12px rgba(42, 33, 24, 0.28);
          opacity: 0;
          transform: translateY(14px);
          transition: opacity 0.45s ease, transform 0.45s ease;
          pointer-events: none;
        }

        #area-name.visible {
          opacity: 1;
          transform: translateY(0);
        }

        @media (prefers-reduced-motion: reduce) {
          #area-name { transition: opacity 0.2s linear; transform: none; }
          #area-name.visible { transform: none; }
        }

        #map-toggle, #audio-toggle { position: static; }

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

        @media (pointer: coarse), (max-width: 700px) {
          #hud-stack {
            top: calc(10px + env(safe-area-inset-top));
            right: calc(10px + env(safe-area-inset-right));
            bottom: auto;
            gap: 8px;
          }
          .hud-card { width: 44px; height: 44px; }
          .hud-card img { width: 32px; height: 32px; }
          #emote-wheel { flex-direction: row; flex-wrap: wrap; max-width: 100px; }
          .emote-btn { width: 36px; height: 36px; }
          #compass {
            top: calc(12px + env(safe-area-inset-top));
            left: calc(12px + env(safe-area-inset-left));
          }
          #area-name {
            left: 16px;
            bottom: calc(22px + env(safe-area-inset-bottom));
            font-size: clamp(1.4rem, 7vw, 2.2rem);
            -webkit-text-stroke-width: 4px;
          }
          #current-task {
            bottom: calc(168px + env(safe-area-inset-bottom));
            max-width: min(360px, calc(100vw - 24px));
            padding: 8px 12px;
          }
          #checklist-panel {
            top: calc(64px + env(safe-area-inset-top));
            right: 10px;
            width: min(300px, calc(100vw - 20px));
            padding: 14px;
          }
        }
      </style>
      
      <div id="compass">
        <div id="compass-arrow"></div>
      </div>
      
      <div id="checklist-panel">
        <h2>Checklist:</h2>
        <div id="checklist-items"></div>
        <button id="mail-reset" type="button">Start the mail over</button>
      </div>
      
      <div id="current-task">
        <div id="current-task-text">Talk to Postmaster Maple to start your deliveries!</div>
      </div>
      
      <div id="area-name"></div>

      <div id="interaction-hint">Press E to talk</div>
      <div id="map-hint">Tap the globe to drop a pin</div>

      <div id="hud-stack">
        <button id="map-toggle" class="hud-card" title="World map (M)" aria-label="World map"
                aria-pressed="false">
          <img src="ui/icon-map.svg" width="44" height="44" alt="">
        </button>
        <button id="audio-toggle" class="hud-card" title="Sound on/off" aria-label="Sound on/off"
                aria-pressed="false">
          <img src="ui/icon-music.svg" width="36" height="36" alt="">
        </button>
        <button id="checklist-toggle" class="hud-card" title="Checklist" aria-label="Checklist">
          <img src="ui/icon-list.svg" width="44" height="44" alt="">
        </button>
        <div id="emote-wheel">
          <button class="emote-btn" data-emote="wave">👋</button>
          <button class="emote-btn" data-emote="happy">😊</button>
          <button class="emote-btn" data-emote="think">🤔</button>
          <button class="emote-btn" data-emote="heart">❤️</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(this.container);
    
    this.compassArrow = document.getElementById('compass-arrow')!;
    this.areaLabel = document.getElementById('area-name')!;
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
    
    // World map. The map is the planet seen from orbit, so this only moves the
    // camera — see MapView.
    const mapToggle = document.getElementById('map-toggle')!;
    const syncMap = () => {
      const open = this.game.mapView.isOpen;
      mapToggle.classList.toggle('open', open);
      mapToggle.setAttribute('aria-pressed', String(open));
      this.container.classList.toggle('map-open', open);
    };
    mapToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.game.mapView.toggle();
      syncMap();
    });
    mapToggle.addEventListener('mousedown', (e) => e.stopPropagation());

    document.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyM' || e.repeat) return;
      if (this.game.state === 0) return;   // not on the title screen
      e.preventDefault();
      this.game.mapView.toggle();
      syncMap();
    });

    // Sound on/off. AudioManager.toggleMute already handles stopping and
    // restarting the music loop; this only reflects the state it returns.
    const audioToggle = document.getElementById('audio-toggle')!;
    audioToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const muted = this.game.audioManager.toggleMute();
      audioToggle.classList.toggle('muted', muted);
      audioToggle.setAttribute('aria-pressed', String(muted));
    });
    audioToggle.addEventListener('mousedown', (e) => {
      // The canvas grabs the pointer for look control, so keep this off it.
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

    const mailReset = document.getElementById('mail-reset')!;
    let armed = false;
    let armTimer: number | null = null;
    const disarm = () => {
      armed = false;
      mailReset.classList.remove('armed');
      mailReset.textContent = 'Start the mail over';
      if (armTimer !== null) {
        window.clearTimeout(armTimer);
        armTimer = null;
      }
    };
    mailReset.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!armed) {
        armed = true;
        mailReset.classList.add('armed');
        mailReset.textContent = 'Really start over?';
        armTimer = window.setTimeout(disarm, 4000);
        return;
      }
      disarm();
      this.game.resetMail();
      this.update();
    });
    mailReset.addEventListener('mousedown', (e) => e.stopPropagation());
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

    const found = this.game.secrets.getFoundCount();
    const total = this.game.secrets.getTotalCount();
    checklistItems.insertAdjacentHTML(
      'beforeend',
      `<div class="story-chain">
        <div class="story-chain-title ${found === total ? 'completed' : ''}">
          Secrets
          <span class="story-chain-progress">(${found}/${total})</span>
        </div>
      </div>`
    );

    const mailReset = document.getElementById('mail-reset');
    if (mailReset) {
      mailReset.style.display = this.game.deliverySystem.hasProgress() ? '' : 'none';
    }
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
      // Name the region the target is waiting in. The compass gives a bearing;
      // the place name is what actually makes them findable.
      if (delivery.hasLetter) {
        const where = this.areaOfNPC(delivery.currentDelivery.to);
        taskText.textContent = where
          ? `Deliver to: ${delivery.currentDelivery.to} — ${where}`
          : `Deliver to: ${delivery.currentDelivery.to}`;
      } else {
        const where = this.areaOfNPC(delivery.currentDelivery.from);
        taskText.textContent = where
          ? `Pick up from: ${delivery.currentDelivery.from} — ${where}`
          : `Pick up from: ${delivery.currentDelivery.from}`;
      }
    }

    this.updateAreaLabel();
    this.updateCompass();
    this.updateChecklist();
    this.updateInteractionHint(hintEl);
  }

  /** Which named region a villager is standing in. */
  private areaOfNPC(name: string): string | null {
    const npc = this.game.npcManager.getNPCByName(name);
    if (!npc) return null;
    return this.game.planet.getAreaAt(npc.mesh.position)?.name ?? null;
  }

  /**
   * Announce the region the player has just walked into.
   *
   * The card shows on entry and fades after a few seconds rather than sitting
   * there permanently — it is a signpost, not a status bar.
   */
  private updateAreaLabel(): void {
    const area = this.game.planet.getAreaAt(this.game.character.group.position);
    const name = area?.name ?? null;

    if (name === this.currentArea) return;
    this.currentArea = name;

    if (this.areaHideTimer !== null) {
      window.clearTimeout(this.areaHideTimer);
      this.areaHideTimer = null;
    }

    if (!name) {
      this.areaLabel.classList.remove('visible');
      return;
    }

    this.game.rememberPlace(name);
    this.areaLabel.textContent = name;
    this.areaLabel.classList.add('visible');
    this.areaHideTimer = window.setTimeout(() => {
      this.areaLabel.classList.remove('visible');
      this.areaHideTimer = null;
    }, 4200);
  }

  private updateCompass(): void {
    const delivery = this.game.deliverySystem;
    const recipientPos = delivery.getRecipientPosition();
    const pin = this.game.pinDir;
    const towardDelivery = !!(recipientPos && !delivery.gameComplete);
    const target = towardDelivery
      ? recipientPos
      : pin
        ? pin.clone().multiplyScalar(this.game.planetRadius)
        : null;

    this.compassArrow.classList.toggle('pin', !towardDelivery && !!pin);

    if (!target) {
      this.compassArrow.style.opacity = '0.3';
      return;
    }

    this.compassArrow.style.opacity = '1';

    const playerPos = this.game.character.getPosition();
    const playerForward = this.game.character.getForward();
    const playerUp = playerPos.clone().normalize();

    const toTarget = target.clone().sub(playerPos);
    toTarget.sub(playerUp.clone().multiplyScalar(toTarget.dot(playerUp)));
    toTarget.normalize();

    const playerRight = new THREE.Vector3().crossVectors(playerForward, playerUp).normalize();
    const angle = Math.atan2(playerRight.dot(toTarget), playerForward.dot(toTarget));
    this.compassArrow.style.transform = `rotate(${angle}rad)`;
  }

  private updateInteractionHint(hintEl: HTMLElement): void {
    const playerPos = this.game.character.getPosition();
    const delivery = this.game.deliverySystem;
    const interactionRange = 6;
    
    let targetNPC = this.game.npcManager.getNearestNPC(playerPos);
    
    if (delivery.hasLetter && delivery.currentDelivery) {
      const deliveryTarget = this.game.npcManager.getNPCByName(delivery.currentDelivery.to);
      if (deliveryTarget) {
        const targetPos = deliveryTarget.mesh.position;
        const playerDir = playerPos.clone().normalize();
        const targetDir = targetPos.clone().normalize();
        const dot = Math.max(-1, Math.min(1, playerDir.dot(targetDir)));
        const angle = Math.acos(dot);
        const arcDist = this.game.planetRadius * angle;
        
        if (arcDist <= interactionRange) {
          targetNPC = deliveryTarget;
        }
      }
    }
    
    if (targetNPC) {
      const npcWorldPos = targetNPC.mesh.position;
      const playerDir = playerPos.clone().normalize();
      const npcDir = npcWorldPos.clone().normalize();
      const dot = Math.max(-1, Math.min(1, playerDir.dot(npcDir)));
      const angle = Math.acos(dot);
      const arcDist = this.game.planetRadius * angle;
      
      if (arcDist > interactionRange) {
        hintEl.classList.remove('visible');
        return;
      }
      
      if (delivery.canPickupFrom(targetNPC.name)) {
        hintEl.textContent = `Press E to pick up from ${targetNPC.name}`;
      } else if (delivery.canDeliverTo(targetNPC.name)) {
        hintEl.textContent = `Press E to deliver to ${targetNPC.name}`;
      } else {
        hintEl.textContent = `Press E to talk to ${targetNPC.name}`;
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
