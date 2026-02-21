import type { Lamp, MenuLevel, Room } from "./models";
import { t } from "./i18n";

function formatRoomListItem(label: string, summary: string): string {
  if (!summary) return label;
  const maxChars = 24;
  const safeSummary = summary.slice(0, 9);
  const maxLabelChars = Math.max(6, maxChars - safeSummary.length - 3);
  const shortLabel = label.length > maxLabelChars ? `${label.slice(0, maxLabelChars - 3)}...` : label;
  return `${shortLabel} (${safeSummary})`;
}

export function getGlassesMenuItems(
  rooms: Room[],
  level: MenuLevel,
  selectedRoom: Room | undefined,
  lampStateLabel: (lamp: Lamp) => string,
  commandLabels: string[],
  roomCommandLabels: string[] = [],
  refreshLabel = t("menu.refreshHa"),
  roomSummaryLabel?: (room: Room) => string
): string[] {
  if (level === "rooms") {
    const items = rooms.map((room) => formatRoomListItem(room.label, roomSummaryLabel?.(room) ?? ""));
    if (rooms.length === 0) {
      items.push(t("menu.noRooms"));
    }
    items.push(refreshLabel);
    return items;
  }
  if (rooms.length === 0) return [t("menu.noLampsInHa")];
  if (level === "lamps") {
    if (!selectedRoom) return [t("menu.noLampsInHa")];
    const roomActions = roomCommandLabels.map((x) => `[${x}]`);
    const lampItems = selectedRoom.lamps.map((x) => {
      const state = lampStateLabel(x).trim();
      return state ? `${x.label} [${state}]` : x.label;
    });
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
