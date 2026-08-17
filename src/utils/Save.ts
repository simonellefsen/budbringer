/**
 * Tiny local memory for the map: where you have walked, and the pin you
 * dropped. The world itself is rebuilt the same every load, so this is
 * the only state that would otherwise vanish on refresh.
 */

const KEY = 'postilion.v1';

export interface SavedPin {
  x: number;
  y: number;
  z: number;
}

export interface SaveData {
  visited: string[];
  pin: SavedPin | null;
}

const empty = (): SaveData => ({ visited: [], pin: null });

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw) as Partial<SaveData>;
    const visited = Array.isArray(data.visited)
      ? data.visited.filter((n): n is string => typeof n === 'string')
      : [];
    const pin = data.pin && Number.isFinite(data.pin.x)
      && Number.isFinite(data.pin.y) && Number.isFinite(data.pin.z)
      ? { x: data.pin.x, y: data.pin.y, z: data.pin.z }
      : null;
    return { visited, pin };
  } catch {
    return empty();
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Private mode or a full quota — the session still works, just forgets.
  }
}
