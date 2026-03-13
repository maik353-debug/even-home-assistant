import type { EntityDomain, Lamp, LampCommand, Room } from "./models";

const HA_MDNS_CANDIDATES = [
  "http://homeassistant.local:8123",
  "http://homeassistant:8123",
];

async function checkHaUrl(baseUrl: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/api/`, { method: "GET", signal: controller.signal });
    clearTimeout(timer);
    // 200 = API running (no auth required), 401 = auth required but HA is there
    if (response.ok || response.status === 401) return baseUrl;
    return null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function getLocalSubnet(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel("");
      void pc.createOffer().then((offer) => pc.setLocalDescription(offer));
      const timer = setTimeout(() => { pc.close(); resolve(null); }, 2000);
      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        const match = /(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}/.exec(event.candidate.candidate);
        if (match) {
          clearTimeout(timer);
          pc.close();
          resolve(match[1]);
        }
      };
    } catch {
      resolve(null);
    }
  });
}

async function scanSubnetForHa(subnet: string, timeoutMs: number): Promise<string | null> {
  const checks: Promise<string | null>[] = [];
  for (let i = 1; i <= 254; i++) {
    checks.push(checkHaUrl(`http://${subnet}.${i}:8123`, timeoutMs));
  }
  const results = await Promise.all(checks);
  return results.find((r) => r !== null) ?? null;
}

// Common home network subnets in priority order (FritzBox default first)
const FALLBACK_SUBNETS = [
  "192.168.178",
  "192.168.1",
  "192.168.0",
  "192.168.2",
  "10.0.0",
  "10.0.1",
];

export async function discoverHomeAssistant(isLocalDev: boolean, onLog?: (msg: string) => void): Promise<string | null> {
  const log = (msg: string) => onLog?.(msg);

  // In dev mode: delegate to Vite server-side endpoint (bypasses Chrome Private Network Access)
  if (isLocalDev) {
    log("Discovery: server-side scan via Vite...");
    try {
      const res = await fetch("/api/ha-discover");
      if (res.ok) {
        const data = (await res.json()) as { url?: string };
        if (data.url) { log(`Discovery: found at ${data.url}`); return data.url; }
      }
    } catch {
      // fall through to client-side scan
    }
    log("Discovery: no HA instance found");
    return null;
  }

  // In packaged mode: client-side scan (no CORS restrictions in native webview)
  log(`Discovery: trying mDNS (${HA_MDNS_CANDIDATES.join(", ")})`);
  const mdnsResult = await Promise.all(HA_MDNS_CANDIDATES.map((url) => checkHaUrl(url, 2000)));
  const mdnsFound = mdnsResult.find((r) => r !== null);
  if (mdnsFound) { log(`Discovery: found via mDNS: ${mdnsFound}`); return mdnsFound; }
  log("Discovery: mDNS not found, trying subnet scan...");

  const rtcSubnet = await getLocalSubnet();
  const subnets = rtcSubnet
    ? [rtcSubnet, ...FALLBACK_SUBNETS.filter((s) => s !== rtcSubnet)]
    : FALLBACK_SUBNETS;
  if (rtcSubnet) { log(`Discovery: WebRTC subnet: ${rtcSubnet}`); }
  else { log("Discovery: WebRTC unavailable, scanning common subnets..."); }

  for (const subnet of subnets) {
    log(`Discovery: scanning ${subnet}.1-254 ...`);
    const result = await scanSubnetForHa(subnet, 1000);
    if (result) { log(`Discovery: found at ${result}`); return result; }
  }

  log("Discovery: no HA instance found");
  return null;
}

const SCENES_GROUP_TOKEN = "__EVEN_SCENES_GROUP__";

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
  options?: { includeScenes?: boolean; scenesGroupLabel?: string }
): Promise<Room[]> {
  const includeScenes = options?.includeScenes === true;
  const scenesGroupLabel = options?.scenesGroupLabel?.trim() || "Scenes";
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
      `{% set ns.items = ns.items + [ {
  "entity_id": e.entity_id,
  "name": e.name,
  "area": "${SCENES_GROUP_TOKEN}",
  "state": e.state
} ] %}`,
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

  const byArea = new Map<string, { label: string; lamps: Lamp[]; isScenesGroup: boolean }>();
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const row = item as { entity_id?: unknown; name?: unknown; area?: unknown; state?: unknown };
    if (typeof row.entity_id !== "string" || typeof row.name !== "string") continue;
    const domainRaw = row.entity_id.split(".")[0];
    const domain: EntityDomain =
      domainRaw === "light" || domainRaw === "scene" ? domainRaw : "light";
    const areaLabelRaw = typeof row.area === "string" && row.area.trim() ? row.area.trim() : "Ohne Raum";
    const isScenesGroup = areaLabelRaw === SCENES_GROUP_TOKEN;
    const areaKey = isScenesGroup ? SCENES_GROUP_TOKEN : areaLabelRaw;
    const areaLabel = isScenesGroup ? scenesGroupLabel : areaLabelRaw;
    const rawState = String(row.state ?? "unknown").toLowerCase();
    const normalizedState =
      rawState === "on" ? "ON" : rawState === "off" ? "OFF" : rawState === "unavailable" ? "UNAVAILABLE" : rawState.toUpperCase();
    const bucket = byArea.get(areaKey) ?? { label: areaLabel, lamps: [], isScenesGroup };
    bucket.lamps.push({
      id: normalizeId(row.entity_id),
      label: row.name,
      pathPrefix: row.entity_id,
      domain,
      initialState: normalizedState,
    });
    byArea.set(areaKey, bucket);
  }

  return Array.from(byArea.values())
    .sort((a, b) => {
      if (a.isScenesGroup && !b.isScenesGroup) return 1;
      if (!a.isScenesGroup && b.isScenesGroup) return -1;
      return a.label.localeCompare(b.label, "de");
    })
    .map((bucket) => ({
      id: bucket.isScenesGroup ? "scenes_group" : normalizeId(bucket.label),
      label: bucket.label,
      lamps: bucket.lamps
        .sort((a, b) => a.label.localeCompare(b.label, "de"))
        .filter((lamp) => lamp.pathPrefix.trim() !== ""),
    }))
    .filter((room) => room.lamps.length > 0);
}
