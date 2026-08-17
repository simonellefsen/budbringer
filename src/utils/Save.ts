/**
 * Tiny local memory for the map, the mailbag, and the three secrets.
 *
 * The world is rebuilt the same every load, so a refresh only needs the
 * places you have walked, the pin you dropped, which letter you hold,
 * and which hidden things you have already found.
 */

const KEY = 'postilion.v1';

export interface SavedPin {
  x: number;
  y: number;
  z: number;
}

export interface SavedDelivery {
  completedIds: number[];
  currentId: number | null;
  hasLetter: boolean;
}

export interface SaveData {
  visited: string[];
  pin: SavedPin | null;
  delivery: SavedDelivery | null;
  secrets: string[];
}

const empty = (): SaveData => ({ visited: [], pin: null, delivery: null, secrets: [] });

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
    const rawDelivery = data.delivery;
    const delivery = rawDelivery && Array.isArray(rawDelivery.completedIds)
      ? {
          completedIds: rawDelivery.completedIds.filter(
            (n): n is number => typeof n === 'number' && Number.isFinite(n)
          ),
          currentId: typeof rawDelivery.currentId === 'number'
            ? rawDelivery.currentId
            : null,
          hasLetter: !!rawDelivery.hasLetter
        }
      : null;
    const secrets = Array.isArray(data.secrets)
      ? data.secrets.filter((n): n is string => typeof n === 'string')
      : [];
    return { visited, pin, delivery, secrets };
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
