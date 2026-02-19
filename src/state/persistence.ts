import type { Room } from "../models";
import type { AppState } from "./appState";

type PersistedAppState = {
  rooms: Room[];
  selectedRoomId: string;
  selectedLampId: string;
  lampStateCache: Record<string, string>;
};

function isPersistedRoomArray(value: unknown): value is Room[] {
  if (!Array.isArray(value)) return false;
  return value.every((room) => {
    if (!room || typeof room !== "object") return false;
    const r = room as { id?: unknown; label?: unknown; lamps?: unknown };
    if (typeof r.id !== "string" || typeof r.label !== "string" || !Array.isArray(r.lamps)) return false;
    return r.lamps.every((lamp) => {
      if (!lamp || typeof lamp !== "object") return false;
      const l = lamp as { id?: unknown; label?: unknown; pathPrefix?: unknown; domain?: unknown };
      const hasBaseFields = typeof l.id === "string" && typeof l.label === "string" && typeof l.pathPrefix === "string";
      const hasValidDomain = l.domain === undefined || l.domain === "light" || l.domain === "scene";
      return hasBaseFields && hasValidDomain;
    });
  });
}

export function saveAppStateToStorage(state: AppState, storageKey: string): string {
  const snapshot: PersistedAppState = {
    rooms: state.rooms,
    selectedRoomId: state.selectedRoomId,
    selectedLampId: state.selectedLampId,
    lampStateCache: state.lampStateCache,
  };
  const serialized = JSON.stringify(snapshot);
  localStorage.setItem(storageKey, serialized);
  return serialized;
}

export function restoreAppStateFromStorage(
  state: AppState,
  storageKey: string
): { rooms: Room[]; selectedRoomId: string; selectedLampId: string } | null {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedAppState>;
    if (!isPersistedRoomArray(parsed.rooms)) return null;
    const selectedRoomId = typeof parsed.selectedRoomId === "string" ? parsed.selectedRoomId : "";
    const selectedLampId = typeof parsed.selectedLampId === "string" ? parsed.selectedLampId : "";
    if (parsed.lampStateCache && typeof parsed.lampStateCache === "object") {
      state.lampStateCache = Object.fromEntries(
        Object.entries(parsed.lampStateCache).filter(([k, v]) => typeof k === "string" && typeof v === "string")
      );
    }
    return { rooms: parsed.rooms, selectedRoomId, selectedLampId };
  } catch {
    return null;
  }
}

