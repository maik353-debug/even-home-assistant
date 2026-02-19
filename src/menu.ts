import type { Lamp, MenuLevel, Room } from "./models";

export function getGlassesMenuItems(
  rooms: Room[],
  level: MenuLevel,
  selectedRoom: Room | undefined,
  lampStateLabel: (lamp: Lamp) => string,
  commandLabels: string[],
  roomCommandLabels: string[] = [],
  refreshLabel = "HA Daten neu laden"
): string[] {
  if (level === "rooms") {
    const items = rooms.map((x) => x.label);
    if (rooms.length === 0) {
      items.push("Keine Raeume geladen");
    }
    items.push(refreshLabel);
    return items;
  }
  if (rooms.length === 0) return ["Keine Lampen in HA"];
  if (level === "lamps") {
    if (!selectedRoom) return ["Keine Lampen in HA"];
    const roomActions = roomCommandLabels.map((x) => `[${x}]`);
    const lampItems = selectedRoom.lamps.map((x) => `${x.label} [${lampStateLabel(x)}]`);
    return [...roomActions, ...lampItems];
  }
  return commandLabels;
}

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace("<-", "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLeadingNumber(label: string): number | null {
  const m = /^\s*(\d+)\s*[\.\-:]/.exec(label);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function resolveMenuIndex(
  rawIndex: number,
  itemName: string,
  menuItems: string[],
  preferOneBasedIndex = false
): number {
  const parsed = parseLeadingNumber(itemName);
  if (parsed !== null) {
    const zeroBased = parsed - 1;
    if (zeroBased >= 0 && zeroBased < menuItems.length) return zeroBased;
  }

  const wanted = normalizeLabel(itemName);
  if (wanted) {
    const byName = menuItems.findIndex((x) => normalizeLabel(x) === wanted);
    if (byName >= 0) return byName;
  }

  // Host index can be 0-based or 1-based depending on runtime/build.
  const candidates = preferOneBasedIndex ? [rawIndex - 1, rawIndex] : [rawIndex, rawIndex - 1];
  for (const c of candidates) {
    if (c >= 0 && c < menuItems.length) return c;
  }
  return -1;
}
