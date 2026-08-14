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
  private charDelay: number = 25;
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
        @import url('https://fonts.googleapis.com/css2?family=Patrick+Hand&display=swap');
        
        #dialogue-container {
          position: fixed;
          bottom: 8%;
          left: 50%;
          transform: translateX(-50%);
          width: 90%;
          max-width: 550px;
          background: #fff;
          border: 4px solid #1a1a1a;
          border-radius: 12px;
          padding: 20px 25px;
          color: #1a1a1a;
          font-family: 'Patrick Hand', cursive, system-ui;
          z-index: 200;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.15s ease;
          box-shadow: 5px 5px 0 #1a1a1a;
        }
        #dialogue-container.visible {
          opacity: 1;
          pointer-events: auto;
        }
        #dialogue-name {
          font-size: 1.3rem;
          font-weight: bold;
          color: #1a1a1a;
          margin-bottom: 8px;
          padding-bottom: 8px;
          border-bottom: 2px solid #1a1a1a;
        }
        #dialogue-text {
          font-size: 1.25rem;
          line-height: 1.5;
          color: #1a1a1a;
          min-height: 2.5em;
        }
        #dialogue-continue {
          position: absolute;
          bottom: 10px;
          right: 15px;
          font-size: 0.9rem;
          color: #666;
          opacity: 0;
          font-family: 'Patrick Hand', cursive;
        }
        #dialogue-continue.visible {
          opacity: 1;
          animation: blink 1s ease infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      </style>
      <div id="dialogue-name"></div>
      <div id="dialogue-text"></div>
      <div id="dialogue-continue">click to continue ▼</div>
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
