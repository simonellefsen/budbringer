import { Game } from '../core/Game';

export class TitleScreen {
  private game: Game;
  private container: HTMLElement;
  private boundKeyHandler: ((e: KeyboardEvent) => void) | null = null;

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
          background: linear-gradient(180deg, #5fbdb0 0%, #4a9e94 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 300;
          transition: opacity 0.5s ease;
          font-family: 'Patrick Hand', cursive, system-ui;
        }
        
        #title-screen.hidden {
          opacity: 0;
          pointer-events: none;
        }
        
        #title-container {
          position: relative;
          margin-bottom: 2rem;
        }
        
        #game-title {
          font-size: clamp(4rem, 15vw, 8rem);
          font-weight: bold;
          color: #1a1a1a;
          text-shadow: 
            4px 4px 0 #fff,
            -2px -2px 0 #fff,
            2px -2px 0 #fff,
            -2px 2px 0 #fff;
          letter-spacing: 0.05em;
          text-transform: lowercase;
          line-height: 0.9;
          text-align: center;
        }
        
        #title-planet {
          position: absolute;
          top: -60px;
          left: 50%;
          transform: translateX(-50%);
          width: 120px;
          height: 120px;
          background: radial-gradient(circle at 30% 30%, #7a9a6b 0%, #5a7a4b 100%);
          border-radius: 50%;
          border: 4px solid #1a1a1a;
          animation: float 4s ease-in-out infinite;
          box-shadow: 
            inset -20px -20px 40px rgba(0,0,0,0.2),
            4px 4px 0 #1a1a1a;
        }
        
        #title-planet::before {
          content: '';
          position: absolute;
          top: 20%;
          left: 15%;
          width: 25%;
          height: 15%;
          background: #d4cbb8;
          border-radius: 50%;
          border: 2px solid #1a1a1a;
        }
        
        #title-planet::after {
          content: '';
          position: absolute;
          bottom: 25%;
          right: 20%;
          width: 20%;
          height: 12%;
          background: #c4b99a;
          border-radius: 50%;
          border: 2px solid #1a1a1a;
        }
        
        @keyframes float {
          0%, 100% { transform: translateX(-50%) translateY(0) rotate(0deg); }
          50% { transform: translateX(-50%) translateY(-15px) rotate(5deg); }
        }
        
        #start-button {
          background: #f4d03f;
          color: #1a1a1a;
          border: 4px solid #1a1a1a;
          border-radius: 8px;
          padding: 18px 50px;
          font-size: 1.8rem;
          font-family: 'Patrick Hand', cursive;
          font-weight: bold;
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          box-shadow: 4px 4px 0 #1a1a1a;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-top: 2rem;
        }
        
        #start-button:hover {
          transform: translate(-2px, -2px);
          box-shadow: 6px 6px 0 #1a1a1a;
        }
        
        #start-button:active {
          transform: translate(2px, 2px);
          box-shadow: 2px 2px 0 #1a1a1a;
        }
        
        #controls-info {
          position: absolute;
          bottom: 100px;
          left: 50%;
          transform: translateX(-50%);
          background: #fff;
          border: 3px solid #1a1a1a;
          border-radius: 8px;
          padding: 15px 25px;
          color: #1a1a1a;
          font-family: 'Patrick Hand', cursive;
          font-size: 1.1rem;
          text-align: center;
          box-shadow: 3px 3px 0 #1a1a1a;
        }
        
        #controls-info p {
          margin: 5px 0;
        }
        
        #mute-button {
          position: absolute;
          top: 20px;
          right: 20px;
          background: #fff;
          border: 3px solid #1a1a1a;
          border-radius: 8px;
          width: 50px;
          height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 1.5rem;
          box-shadow: 3px 3px 0 #1a1a1a;
          transition: transform 0.1s ease;
        }
        
        #mute-button:hover {
          transform: translate(-1px, -1px);
        }
        
        #mute-button:active {
          transform: translate(1px, 1px);
          box-shadow: 1px 1px 0 #1a1a1a;
        }
        
        #customize-button {
          position: absolute;
          top: 20px;
          left: 20px;
          background: #fff;
          border: 3px solid #1a1a1a;
          border-radius: 8px;
          padding: 10px 20px;
          font-family: 'Patrick Hand', cursive;
          font-size: 1.1rem;
          cursor: pointer;
          box-shadow: 3px 3px 0 #1a1a1a;
          transition: transform 0.1s ease;
        }
        
        #customize-button:hover {
          transform: translate(-1px, -1px);
        }
        
        #credits {
          position: absolute;
          bottom: 20px;
          left: 20px;
          color: #1a1a1a;
          font-family: 'Patrick Hand', cursive;
          font-size: 0.9rem;
          opacity: 0.7;
        }
        
        #customization-panel {
          display: none;
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: #fff;
          border: 4px solid #1a1a1a;
          border-radius: 12px;
          padding: 25px;
          z-index: 400;
          box-shadow: 6px 6px 0 #1a1a1a;
          min-width: 300px;
        }
        
        #customization-panel.visible {
          display: block;
        }
        
        #customization-panel h2 {
          font-family: 'Patrick Hand', cursive;
          font-size: 1.5rem;
          margin-bottom: 20px;
          text-align: center;
          color: #1a1a1a;
        }
        
        .customize-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 15px 0;
          font-family: 'Patrick Hand', cursive;
        }
        
        .customize-row label {
          font-size: 1.1rem;
          color: #1a1a1a;
        }
        
        .color-options {
          display: flex;
          gap: 8px;
        }
        
        .color-option {
          width: 30px;
          height: 30px;
          border: 3px solid #1a1a1a;
          border-radius: 6px;
          cursor: pointer;
          transition: transform 0.1s;
        }
        
        .color-option:hover {
          transform: scale(1.1);
        }
        
        .color-option.selected {
          box-shadow: 0 0 0 3px #f4d03f;
        }
        
        #close-customize {
          display: block;
          width: 100%;
          margin-top: 20px;
          background: #f4d03f;
          border: 3px solid #1a1a1a;
          border-radius: 6px;
          padding: 10px;
          font-family: 'Patrick Hand', cursive;
          font-size: 1.1rem;
          cursor: pointer;
          box-shadow: 3px 3px 0 #1a1a1a;
        }
      </style>
      
      <div id="title-container">
        <div id="title-planet"></div>
        <h1 id="game-title">budbringer</h1>
      </div>
      
      <button id="start-button">Begin</button>
      
      <div id="controls-info">
        <p>WASD to walk • Space to hop • E to talk</p>
        <p>Click to look around</p>
      </div>
      
      <button id="customize-button">✎ Customize</button>
      <button id="mute-button" title="Toggle Sound">🔊</button>
      
      <div id="credits">an original game</div>
      
      <div id="customization-panel">
        <h2>Customize Your Courier</h2>
        <div class="customize-row">
          <label>Hat:</label>
          <div class="color-options" data-type="hat">
            <div class="color-option selected" style="background: #e74c3c" data-color="0xe74c3c"></div>
            <div class="color-option" style="background: #3498db" data-color="0x3498db"></div>
            <div class="color-option" style="background: #f39c12" data-color="0xf39c12"></div>
            <div class="color-option" style="background: #9b59b6" data-color="0x9b59b6"></div>
            <div class="color-option" style="background: #1abc9c" data-color="0x1abc9c"></div>
          </div>
        </div>
        <div class="customize-row">
          <label>Shirt:</label>
          <div class="color-options" data-type="shirt">
            <div class="color-option selected" style="background: #3498db" data-color="0x3498db"></div>
            <div class="color-option" style="background: #e74c3c" data-color="0xe74c3c"></div>
            <div class="color-option" style="background: #2ecc71" data-color="0x2ecc71"></div>
            <div class="color-option" style="background: #f39c12" data-color="0xf39c12"></div>
            <div class="color-option" style="background: #ecf0f1" data-color="0xecf0f1"></div>
          </div>
        </div>
        <div class="customize-row">
          <label>Pants:</label>
          <div class="color-options" data-type="pants">
            <div class="color-option selected" style="background: #2c3e50" data-color="0x2c3e50"></div>
            <div class="color-option" style="background: #34495e" data-color="0x34495e"></div>
            <div class="color-option" style="background: #8b4513" data-color="0x8b4513"></div>
            <div class="color-option" style="background: #1a5276" data-color="0x1a5276"></div>
            <div class="color-option" style="background: #7b241c" data-color="0x7b241c"></div>
          </div>
        </div>
        <button id="close-customize">Done</button>
      </div>
    `;
    
    document.body.appendChild(this.container);
    
    const startButton = document.getElementById('start-button')!;
    startButton.addEventListener('click', () => this.startGame());
    
    const muteButton = document.getElementById('mute-button')!;
    muteButton.addEventListener('click', () => this.toggleMute(muteButton));
    
    const customizeButton = document.getElementById('customize-button')!;
    const customizationPanel = document.getElementById('customization-panel')!;
    const closeCustomize = document.getElementById('close-customize')!;
    
    customizeButton.addEventListener('click', () => {
      customizationPanel.classList.add('visible');
    });
    
    closeCustomize.addEventListener('click', () => {
      customizationPanel.classList.remove('visible');
    });
    
    document.querySelectorAll('.color-option').forEach(option => {
      option.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const parent = target.parentElement!;
        parent.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
        target.classList.add('selected');
        
        const colorType = parent.getAttribute('data-type');
        const colorValue = parseInt(target.getAttribute('data-color')!);
        this.game.character?.setColor(colorType!, colorValue);
      });
    });
    
    this.boundKeyHandler = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        if (!this.container.classList.contains('hidden') && 
            !customizationPanel.classList.contains('visible')) {
          e.preventDefault();
          this.startGame();
        }
      }
    };
    document.addEventListener('keydown', this.boundKeyHandler);
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
    if (this.boundKeyHandler) {
      document.removeEventListener('keydown', this.boundKeyHandler);
      this.boundKeyHandler = null;
    }
    setTimeout(() => {
      this.container.remove();
    }, 500);
  }

  public show(): void {
    this.container.style.display = 'flex';
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
