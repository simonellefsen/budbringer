import { Game } from './core/Game';

const game = new Game();

window.addEventListener('DOMContentLoaded', () => {
  game.init();
});

window.addEventListener('resize', () => {
  game.resize();
});

declare global {
  interface Window {
    game: Game;
  }
}

window.game = game;
