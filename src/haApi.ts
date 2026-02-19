import type { EntityDomain, Lamp, LampCommand, Room } from "./models";

export function haApiUrl(baseUrl: string, isLocalDev: boolean, path: string): string {
  if (isLocalDev) return `/ha${path}`;
  return `${baseUrl}${path}`;
}

export function buildHaRequest(
  baseUrl: string,
  isLocalDev: boolean,
  lamp: Lamp,
  cmd: LampCommand
): { method: "POST"; url: string; body: Record<string, unknown> } {
  const serviceDomain = lamp.domain === "scene" ? "scene" : lamp.domain;
  const service = lamp.domain === "scene" ? "turn_on" : cmd.service;
  const body: Record<string, unknown> = { entity_id: lamp.pathPrefix };
  if (lamp.domain === "light" && cmd.brightnessPct !== undefined) {
    body.brightness_pct = cmd.brightnessPct;
  }
  return {
    method: "POST",
    url: haApiUrl(baseUrl, isLocalDev, `/api/services/${serviceDomain}/${service}`),
    body,
  };
}

export function buildHaRequestForEntityIds(
  baseUrl: string,
  isLocalDev: boolean,
  domain: EntityDomain,
  entityIds: string[],
  cmd: LampCommand
): { method: "POST"; url: string; body: Record<string, unknown> } {
  const serviceDomain = domain === "scene" ? "scene" : domain;
  const service = domain === "scene" ? "turn_on" : cmd.service;
  const body: Record<string, unknown> = { entity_id: entityIds };
  if (domain === "light" && cmd.brightnessPct !== undefined) {
    body.brightness_pct = cmd.brightnessPct;
  }
  return {
    method: "POST",
    url: haApiUrl(baseUrl, isLocalDev, `/api/services/${serviceDomain}/${service}`),
    body,
  };
}

export async function fetchLampState(
  baseUrl: string,
  token: string,
  isLocalDev: boolean,
  lamp: Lamp
): Promise<string> {
  if (!token) return "UNKNOWN";
  const response = await fetch(haApiUrl(baseUrl, isLocalDev, `/api/states/${encodeURIComponent(lamp.pathPrefix)}`), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return "UNKNOWN";
  const payload = (await response.json()) as { state?: unknown };
  const raw = String(payload.state ?? "unknown").toLowerCase();
  if (raw === "on") return "ON";
  if (raw === "off") return "OFF";
  return raw.toUpperCase();
}

function normalizeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function loadRoomsFromHomeAssistant(
  baseUrl: string,
  token: string,
  isLocalDev: boolean,
  options?: { includeScenes?: boolean }
): Promise<Room[]> {
  const includeScenes = options?.includeScenes === true;
  const blocks = [
    `{% for e in states.light %}`,
    `{% if e.attributes.entity_id is not defined %}`,
    `{% set ns.items = ns.items + [ {
  "entity_id": e.entity_id,
  "name": e.name,
  "area": area_name(e.entity_id) if area_name(e.entity_id) else "Ohne Raum",
  "state": e.state
} ] %}`,
    `{% endif %}`,
    `{% endfor %}`,
  ];

  if (includeScenes) {
    blocks.push(
      `{% for e in states.scene %}`,
      `{% if e.attributes.entity_id is not defined %}`,
      `{% set ns.items = ns.items + [ {
  "entity_id": e.entity_id,
  "name": e.name,
  "area": area_name(e.entity_id) if area_name(e.entity_id) else "Szenen",
  "state": e.state
} ] %}`,
      `{% endif %}`,
      `{% endfor %}`
    );
  }

  const template = `
{% set ns = namespace(items=[]) %}
${blocks.join("\n")}
{{ ns.items | tojson }}
`.trim();

  const response = await fetch(haApiUrl(baseUrl, isLocalDev, "/api/template"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ template }),
  });

  if (!response.ok) {
    throw new Error(`HA template API failed: HTTP ${response.status}`);
  }

  const raw = (await response.text()).trim();
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Unexpected template response");
  }

  const byArea = new Map<string, Lamp[]>();
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const row = item as { entity_id?: unknown; name?: unknown; area?: unknown; state?: unknown };
    if (typeof row.entity_id !== "string" || typeof row.name !== "string") continue;
    const domainRaw = row.entity_id.split(".")[0];
    const domain: EntityDomain =
      domainRaw === "light" || domainRaw === "scene" ? domainRaw : "light";
    const areaLabel = typeof row.area === "string" && row.area.trim() ? row.area.trim() : "Ohne Raum";
    const rawState = String(row.state ?? "unknown").toLowerCase();
    const normalizedState =
      rawState === "on" ? "ON" : rawState === "off" ? "OFF" : rawState === "unavailable" ? "UNAVAILABLE" : rawState.toUpperCase();
    const lamps = byArea.get(areaLabel) ?? [];
    lamps.push({
      id: normalizeId(row.entity_id),
      label: row.name,
      pathPrefix: row.entity_id,
      domain,
      initialState: normalizedState,
    });
    byArea.set(areaLabel, lamps);
  }

  return Array.from(byArea.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "de"))
    .map(([label, lamps]) => ({
      id: normalizeId(label),
      label,
      lamps: lamps
        .sort((a, b) => a.label.localeCompare(b.label, "de"))
        .filter((lamp) => lamp.pathPrefix.trim() !== ""),
    }))
    .filter((room) => room.lamps.length > 0);
}
