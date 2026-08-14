import { Game } from '../core/Game';

export class DialogueSystem {
  private game: Game;
  private container: HTMLElement;
  private nameElement: HTMLElement;
  private textElement: HTMLElement;
  private continuePrompt: HTMLElement;
  
  private isShowing: boolean = false;
  private currentText: string = '';
  private displayedText: string = '';
  private charIndex: number = 0;
  private charDelay: number = 30;
  private lastCharTime: number = 0;
  private isTyping: boolean = false;
  
  private boundKeyHandler: (e: KeyboardEvent) => void;
  private boundClickHandler: () => void;

  constructor(game: Game) {
    this.game = game;
    
    this.container = document.createElement('div');
    this.container.id = 'dialogue-container';
    this.container.innerHTML = `
      <style>
        #dialogue-container {
          position: fixed;
          bottom: 10%;
          left: 50%;
          transform: translateX(-50%);
          width: 90%;
          max-width: 600px;
          background: rgba(30, 30, 40, 0.95);
          border: 3px solid #ffeaa7;
          border-radius: 12px;
          padding: 20px 25px;
          color: #fff;
          font-family: 'Segoe UI', system-ui, sans-serif;
          z-index: 200;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        }
        #dialogue-container.visible {
          opacity: 1;
          pointer-events: auto;
        }
        #dialogue-name {
          font-size: 1.1rem;
          font-weight: bold;
          color: #ffeaa7;
          margin-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        #dialogue-text {
          font-size: 1.1rem;
          line-height: 1.6;
          color: #ecf0f1;
          min-height: 3em;
        }
        #dialogue-continue {
          position: absolute;
          bottom: 12px;
          right: 20px;
          font-size: 0.85rem;
          color: #ffeaa7;
          opacity: 0;
          animation: bounce 1s ease infinite;
        }
        #dialogue-continue.visible {
          opacity: 1;
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
      </style>
      <div id="dialogue-name"></div>
      <div id="dialogue-text"></div>
      <div id="dialogue-continue">Press SPACE or tap to continue</div>
    `;
    
    document.body.appendChild(this.container);
    
    this.nameElement = document.getElementById('dialogue-name')!;
    this.textElement = document.getElementById('dialogue-text')!;
    this.continuePrompt = document.getElementById('dialogue-continue')!;
    
    this.boundKeyHandler = this.handleKey.bind(this);
    this.boundClickHandler = this.handleClick.bind(this);
    
    document.addEventListener('keydown', this.boundKeyHandler);
    this.container.addEventListener('click', this.boundClickHandler);
    
    this.startTypewriterLoop();
  }

  private startTypewriterLoop(): void {
    const update = () => {
      if (this.isTyping && this.charIndex < this.currentText.length) {
        const now = Date.now();
        if (now - this.lastCharTime >= this.charDelay) {
          this.displayedText += this.currentText[this.charIndex];
          this.textElement.textContent = this.displayedText;
          this.charIndex++;
          this.lastCharTime = now;
          
          if (this.charIndex >= this.currentText.length) {
            this.isTyping = false;
            this.continuePrompt.classList.add('visible');
          }
        }
      }
      requestAnimationFrame(update);
    };
    update();
  }

  public showDialogue(name: string, text: string): void {
    this.nameElement.textContent = name;
    this.currentText = text;
    this.displayedText = '';
    this.textElement.textContent = '';
    this.charIndex = 0;
    this.lastCharTime = Date.now();
    this.isTyping = true;
    
    this.container.classList.add('visible');
    this.continuePrompt.classList.remove('visible');
    this.isShowing = true;
    
    this.game.enterDialogue();
    this.game.audioManager.playDialogue();
  }

  public showMessage(title: string, text: string): void {
    this.showDialogue(title, text);
  }

  private handleKey(e: KeyboardEvent): void {
    if (!this.isShowing) return;
    
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') {
      e.preventDefault();
      this.advanceOrClose();
    }
  }

  private handleClick(): void {
    if (!this.isShowing) return;
    this.advanceOrClose();
  }

  private advanceOrClose(): void {
    if (this.isTyping) {
      this.displayedText = this.currentText;
      this.textElement.textContent = this.displayedText;
      this.charIndex = this.currentText.length;
      this.isTyping = false;
      this.continuePrompt.classList.add('visible');
    } else {
      this.close();
    }
  }

  private close(): void {
    this.container.classList.remove('visible');
    this.isShowing = false;
    this.game.exitDialogue();
  }

  public isDialogueShowing(): boolean {
    return this.isShowing;
  }

  public dispose(): void {
    document.removeEventListener('keydown', this.boundKeyHandler);
    this.container.removeEventListener('click', this.boundClickHandler);
    this.container.remove();
  }
}
