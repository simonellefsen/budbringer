import { Game } from './core/Game';

const game = new Game();

window.addEventListener('DOMContentLoaded', () => {
  game.init();
});

const onResize = () => game.resize();
window.addEventListener('resize', onResize);
window.visualViewport?.addEventListener('resize', onResize);
window.visualViewport?.addEventListener('scroll', onResize);

document.addEventListener('touchmove', (e) => {
  const el = e.target as HTMLElement | null;
  if (el?.closest?.('#checklist-panel, #dialogue-container')) return;
  e.preventDefault();
}, { passive: false });

declare global {
  interface Window {
    game: Game;
  }
}

window.game = game;
