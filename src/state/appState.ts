import type { Lamp, MenuLevel, Room } from "../models";

export type AppState = {
  glassesMenuLevel: MenuLevel;
  rooms: Room[];
  selectedRoomId: string;
  selectedLampId: string;
  glassesUiCreated: boolean;
  lampStateCache: Record<string, string>;
  pendingExpectedState: Record<string, { expected: "ON" | "OFF"; untilTs: number }>;
};

export function createInitialState(): AppState {
  return {
    glassesMenuLevel: "rooms",
    rooms: [],
    selectedRoomId: "",
    selectedLampId: "",
    glassesUiCreated: false,
    lampStateCache: {},
    pendingExpectedState: {},
  };
}

export function hasRooms(state: AppState): boolean {
  return state.rooms.length > 0;
}

export function getSelectedRoom(state: AppState): Room | undefined {
  if (!hasRooms(state)) return undefined;
  return state.rooms.find((x) => x.id === state.selectedRoomId) ?? state.rooms[0];
}

export function getSelectedLamp(state: AppState): Lamp | undefined {
  const room = getSelectedRoom(state);
  if (!room) return undefined;
  return room.lamps.find((x) => x.id === state.selectedLampId) ?? room.lamps[0];
}

export function getLampStateLabel(state: AppState, lamp: Lamp): string {
  return state.lampStateCache[lamp.pathPrefix] ?? "UNKNOWN";
}

export function getSelectedLampStateLabel(state: AppState): string {
  const lamp = getSelectedLamp(state);
  if (!lamp) return "UNKNOWN";
  return state.lampStateCache[lamp.pathPrefix] ?? "UNKNOWN";
}

export function setRooms(state: AppState, nextRooms: Room[]): void {
  state.rooms = nextRooms.filter((room) => room.lamps.length > 0);
  if (!hasRooms(state)) {
    state.selectedRoomId = "";
    state.selectedLampId = "";
    state.glassesMenuLevel = "rooms";
    return;
  }
  state.selectedRoomId = state.rooms[0].id;
  state.selectedLampId = state.rooms[0].lamps[0].id;
}
