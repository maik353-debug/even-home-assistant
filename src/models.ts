export type LampCommand = {
  id: string;
  label: string;
  service: "turn_on" | "turn_off" | "toggle";
  brightnessPct?: number;
  brightnessStepPct?: number;
  domains?: EntityDomain[];
};

export type EntityDomain = "light" | "scene";

export type Lamp = {
  id: string;
  label: string;
  pathPrefix: string;
  domain: EntityDomain;
  initialState?: string;
};

export type Room = {
  id: string;
  label: string;
  lamps: Lamp[];
};

export type MenuLevel = "rooms" | "lamps" | "commands";

export const ENTITY_COMMANDS: LampCommand[] = [
  { id: "on", label: "Einschalten", service: "turn_on", domains: ["light"] },
  { id: "off", label: "Ausschalten", service: "turn_off", domains: ["light"] },
  { id: "toggle", label: "Toggle", service: "toggle", domains: ["light"] },
  { id: "brighter", label: "Heller", service: "turn_on", brightnessStepPct: 20, domains: ["light"] },
  { id: "dimmer", label: "Dunkler", service: "turn_on", brightnessStepPct: -20, domains: ["light"] },
  { id: "scene_activate", label: "Szene aktivieren", service: "turn_on", domains: ["scene"] },
];

export const ROOM_COMMANDS: LampCommand[] = [
  { id: "room_on", label: "Raum: Alle an", service: "turn_on", domains: ["light"] },
  { id: "room_off", label: "Raum: Alle aus", service: "turn_off", domains: ["light"] },
  { id: "room_brighter", label: "Raum: Heller", service: "turn_on", brightnessStepPct: 20, domains: ["light"] },
  { id: "room_dimmer", label: "Raum: Dunkler", service: "turn_on", brightnessStepPct: -20, domains: ["light"] },
];
