import { Game } from '../core/Game';

export class TitleScreen {
  private game: Game;
  private container: HTMLElement;
  private boundKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  
  /** How far out the title camera sits, as a multiple of the planet radius. */
  private static readonly ORBIT = 3.05;
  private spin = 0;

  constructor(game: Game) {
    this.game = game;
    
    this.container = document.createElement('div');
    this.container.id = 'title-screen';
    this.container.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Patrick+Hand&display=swap');
        
        #title-screen {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 300;
          transition: opacity 0.5s ease;
        }
        
        #title-screen.hidden {
          opacity: 0;
          pointer-events: none;
        }
        
        
        #title-ui {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          padding-bottom: 12vh;
          pointer-events: none;
        }
        
        #enter-button {
          background: #f5c842;
          color: #1a1a1a;
          border: 4px solid #1a1a1a;
          border-radius: 6px;
          padding: 16px 60px;
          font-size: 1.6rem;
          font-family: 'Patrick Hand', cursive;
          font-weight: bold;
          cursor: pointer;
          transition: transform 0.12s ease, box-shadow 0.12s ease;
          box-shadow: 4px 4px 0 #1a1a1a;
          text-transform: lowercase;
          letter-spacing: 0.08em;
          pointer-events: auto;
        }
        
        #enter-button:hover {
          transform: translate(-2px, -2px);
          box-shadow: 6px 6px 0 #1a1a1a;
        }
        
        #enter-button:active {
          transform: translate(2px, 2px);
          box-shadow: 2px 2px 0 #1a1a1a;
        }
        
        #title-text {
          font-family: 'Patrick Hand', cursive;
          font-size: 4rem;
          font-weight: bold;
          color: #ffffff;
          text-shadow: 4px 4px 0 #1a1a1a, -2px -2px 0 #1a1a1a, 2px -2px 0 #1a1a1a, -2px 2px 0 #1a1a1a;
          letter-spacing: 0.1em;
          margin-bottom: 1.5rem;
          pointer-events: none;
        }
        
        #title-controls {
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          color: #fff;
          font-family: 'Patrick Hand', cursive;
          font-size: 0.95rem;
          opacity: 0.8;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
          pointer-events: none;
        }
      </style>
      
      <div id="title-ui">
        <div id="title-text">the postilion</div>
        <button id="enter-button">enter</button>
      </div>
      
      <div id="title-controls">wasd walk • space hop • e talk</div>
    `;
    
    document.body.appendChild(this.container);
    

    
    const enterButton = document.getElementById('enter-button')!;
    enterButton.addEventListener('click', () => this.startGame());
    
    this.boundKeyHandler = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        if (!this.container.classList.contains('hidden')) {
          e.preventDefault();
          this.startGame();
        }
      }
    };
    document.addEventListener('keydown', this.boundKeyHandler);
  }

  /**
   * Drive the title camera.
   *
   * The title screen used to build a second, simpler planet of its own — its
   * own houses, its own roads, its own outline shader — which is why it went
   * on showing the old world after the game had been rebuilt around it. It now
   * orbits the real planet, so it cannot drift out of date again.
   */
  public update(delta: number): void {
    this.spin += delta * 0.09;

    const r = this.game.planetRadius * TitleScreen.ORBIT;
    const tilt = 0.34;
    const camera = this.game.camera;

    camera.position.set(
      Math.cos(this.spin) * r * Math.cos(tilt),
      Math.sin(tilt) * r,
      Math.sin(this.spin) * r * Math.cos(tilt)
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
  }

  private startGame(): void {
    this.game.startGame();
  }

  public hide(): void {
    this.container.classList.add('hidden');
    if (this.boundKeyHandler) {
      document.removeEventListener('keydown', this.boundKeyHandler);
      this.boundKeyHandler = null;
    }
    setTimeout(() => {
      this.container.remove();
    }, 500);
  }

  public show(): void {
    this.container.style.display = 'block';
    this.container.classList.remove('hidden');
  }

  public dispose(): void {
    if (this.boundKeyHandler) {
      document.removeEventListener('keydown', this.boundKeyHandler);
      this.boundKeyHandler = null;
    }
    this.container.remove();
  }
}
