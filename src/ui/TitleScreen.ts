import { Game } from '../core/Game';

export class TitleScreen {
  private game: Game;
  private container: HTMLElement;

  constructor(game: Game) {
    this.game = game;
    
    this.container = document.createElement('div');
    this.container.id = 'title-screen';
    this.container.innerHTML = `
      <style>
        #title-screen {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, rgba(26, 26, 46, 0.9) 0%, rgba(22, 33, 62, 0.9) 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 300;
          transition: opacity 0.5s ease;
        }
        
        #title-screen.hidden {
          opacity: 0;
          pointer-events: none;
        }
        
        #game-title {
          font-size: clamp(3rem, 10vw, 5rem);
          font-family: 'Segoe UI', system-ui, sans-serif;
          font-weight: bold;
          color: #ffeaa7;
          text-shadow: 0 4px 20px rgba(255, 234, 167, 0.4);
          letter-spacing: 0.15em;
          margin-bottom: 1rem;
          animation: float 3s ease-in-out infinite;
        }
        
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        
        #game-subtitle {
          font-size: clamp(1rem, 3vw, 1.3rem);
          font-family: 'Segoe UI', system-ui, sans-serif;
          color: #a0a0a0;
          margin-bottom: 3rem;
          text-align: center;
          padding: 0 20px;
        }
        
        #start-button {
          background: #ffeaa7;
          color: #1a1a2e;
          border: none;
          border-radius: 30px;
          padding: 18px 50px;
          font-size: 1.3rem;
          font-family: 'Segoe UI', system-ui, sans-serif;
          font-weight: bold;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          box-shadow: 0 4px 20px rgba(255, 234, 167, 0.3);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        
        #start-button:hover {
          transform: scale(1.05);
          box-shadow: 0 6px 30px rgba(255, 234, 167, 0.5);
        }
        
        #start-button:active {
          transform: scale(0.98);
        }
        
        #controls-info {
          position: absolute;
          bottom: 80px;
          left: 50%;
          transform: translateX(-50%);
          color: #666;
          font-family: 'Segoe UI', system-ui, sans-serif;
          font-size: 0.9rem;
          text-align: center;
        }
        
        #controls-info p {
          margin: 5px 0;
        }
        
        #mute-button {
          position: absolute;
          bottom: 20px;
          right: 20px;
          background: rgba(255, 255, 255, 0.1);
          border: 2px solid rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          width: 50px;
          height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s ease;
          font-size: 1.5rem;
        }
        
        #mute-button:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        
        #credits {
          position: absolute;
          bottom: 20px;
          left: 20px;
          color: #444;
          font-family: 'Segoe UI', system-ui, sans-serif;
          font-size: 0.8rem;
        }
      </style>
      
      <h1 id="game-title">budbringer</h1>
      <p id="game-subtitle">A tiny spherical-planet mail-courier adventure</p>
      
      <button id="start-button">Start Delivering</button>
      
      <div id="controls-info">
        <p>WASD or Arrow Keys to move • Space to hop • E to talk</p>
        <p>Click to look around • Touch controls on mobile</p>
      </div>
      
      <button id="mute-button" title="Toggle Sound">🔊</button>
      
      <div id="credits">An original game • Not affiliated with any other work</div>
    `;
    
    document.body.appendChild(this.container);
    
    const startButton = document.getElementById('start-button')!;
    startButton.addEventListener('click', () => this.startGame());
    
    const muteButton = document.getElementById('mute-button')!;
    muteButton.addEventListener('click', () => this.toggleMute(muteButton));
    
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        if (!this.container.classList.contains('hidden')) {
          e.preventDefault();
          this.startGame();
        }
      }
    });
  }

  private startGame(): void {
    this.game.startGame();
  }

  private toggleMute(button: HTMLElement): void {
    const isMuted = this.game.audioManager.toggleMute();
    button.textContent = isMuted ? '🔇' : '🔊';
  }

  public hide(): void {
    this.container.classList.add('hidden');
    setTimeout(() => {
      this.container.style.display = 'none';
    }, 500);
  }

  public show(): void {
    this.container.style.display = 'flex';
    this.container.classList.remove('hidden');
  }

  public dispose(): void {
    this.container.remove();
  }
}
