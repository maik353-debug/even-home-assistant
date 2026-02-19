import type { LampCommand, Room } from "../models";

export type WebDom = {
  statusEl: HTMLDivElement;
  healthEl: HTMLDivElement;
  setupStateEl: HTMLDivElement;
  logEl: HTMLPreElement;
  connectBtn: HTMLButtonElement;
  deployBtn: HTMLButtonElement;
  shutdownBtn: HTMLButtonElement;
  saveBaseBtn: HTMLButtonElement;
  loadHaBtn: HTMLButtonElement;
  loadHaEmptyBtn: HTMLButtonElement;
  diagnosticsBtn: HTMLButtonElement;
  testBtn: HTMLButtonElement;
  includeScenesEl: HTMLInputElement;
  baseUrlInput: HTMLInputElement;
  tokenInput: HTMLInputElement;
  roomSelectEl: HTMLSelectElement;
  lampSelectEl: HTMLSelectElement;
  commandActionsEl: HTMLDivElement;
};

function mustQuery<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}

export function initWebUi(app: HTMLDivElement): WebDom {
  app.innerHTML = `
    <main class="card">
      <h1>G2 Smart Lamp Control</h1>
      <p class="muted">Setup: 1) HA URL 2) Token 3) HA Daten laden</p>
      <div id="health" class="health"></div>
      <div id="status" class="status">Idle</div>
      <div class="actions">
        <button id="btn-connect">Connect bridge</button>
        <button id="btn-deploy">Deploy to glasses</button>
        <button id="btn-shutdown" class="secondary">Shutdown page</button>
      </div>
      <p class="muted">Local API Base URL</p>
      <input id="base-url" class="base-url" />
      <p class="muted">Home Assistant Long-Lived Access Token</p>
      <input id="ha-token" class="base-url" type="password" />
      <div class="actions">
        <button id="btn-save-base">Verbindung testen</button>
        <button id="btn-load-ha">Load rooms from HA</button>
        <button id="btn-diagnostics" class="secondary">Diagnose</button>
        <button id="btn-test">Test selected command</button>
      </div>
      <div class="actions">
        <label><input id="include-scenes" type="checkbox" /> Szenen laden</label>
      </div>
      <div id="setup-state" class="empty-state hidden">
        <p class="muted">Noch keine Raeume geladen. Lade jetzt deine Daten aus Home Assistant.</p>
        <button id="btn-load-ha-empty">Jetzt aus HA laden</button>
      </div>
      <p class="muted">Simulator/Web test flow</p>
      <select id="room-select" class="base-url"></select>
      <select id="lamp-select" class="base-url"></select>
      <div id="command-actions" class="actions"></div>
      <pre id="log"></pre>
    </main>
  `;

  return {
    statusEl: mustQuery<HTMLDivElement>("#status"),
    healthEl: mustQuery<HTMLDivElement>("#health"),
    setupStateEl: mustQuery<HTMLDivElement>("#setup-state"),
    logEl: mustQuery<HTMLPreElement>("#log"),
    connectBtn: mustQuery<HTMLButtonElement>("#btn-connect"),
    deployBtn: mustQuery<HTMLButtonElement>("#btn-deploy"),
    shutdownBtn: mustQuery<HTMLButtonElement>("#btn-shutdown"),
    saveBaseBtn: mustQuery<HTMLButtonElement>("#btn-save-base"),
    loadHaBtn: mustQuery<HTMLButtonElement>("#btn-load-ha"),
    loadHaEmptyBtn: mustQuery<HTMLButtonElement>("#btn-load-ha-empty"),
    diagnosticsBtn: mustQuery<HTMLButtonElement>("#btn-diagnostics"),
    testBtn: mustQuery<HTMLButtonElement>("#btn-test"),
    includeScenesEl: mustQuery<HTMLInputElement>("#include-scenes"),
    baseUrlInput: mustQuery<HTMLInputElement>("#base-url"),
    tokenInput: mustQuery<HTMLInputElement>("#ha-token"),
    roomSelectEl: mustQuery<HTMLSelectElement>("#room-select"),
    lampSelectEl: mustQuery<HTMLSelectElement>("#lamp-select"),
    commandActionsEl: mustQuery<HTMLDivElement>("#command-actions"),
  };
}

export function setBusy(dom: WebDom, value: boolean): void {
  dom.connectBtn.disabled = value;
  dom.deployBtn.disabled = value;
  dom.shutdownBtn.disabled = value;
  dom.saveBaseBtn.disabled = value;
  dom.loadHaBtn.disabled = value;
  dom.loadHaEmptyBtn.disabled = value;
  dom.diagnosticsBtn.disabled = value;
  dom.testBtn.disabled = value;
}

export function setStatus(dom: WebDom, text: string): void {
  dom.statusEl.textContent = text;
}

export function writeLog(dom: WebDom, message: string): void {
  const stamp = new Date().toLocaleTimeString();
  dom.logEl.textContent = `[${stamp}] ${message}\n${dom.logEl.textContent}`.slice(0, 14000);
}

export function setSetupStateVisible(dom: WebDom, visible: boolean): void {
  dom.setupStateEl.classList.toggle("hidden", !visible);
}

type BadgeLevel = "ok" | "bad" | "unknown";

function renderBadge(label: string, text: string, level: BadgeLevel): string {
  return `<span class="badge" data-level="${level}">${label}: ${text}</span>`;
}

export function setHealthState(
  dom: WebDom,
  value: {
    bridge: { text: string; level: BadgeLevel };
    ha: { text: string; level: BadgeLevel };
    token: { text: string; level: BadgeLevel };
    rooms: { text: string; level: BadgeLevel };
  }
): void {
  dom.healthEl.innerHTML = [
    renderBadge("Bridge", value.bridge.text, value.bridge.level),
    renderBadge("HA", value.ha.text, value.ha.level),
    renderBadge("Token", value.token.text, value.token.level),
    renderBadge("Raeume", value.rooms.text, value.rooms.level),
  ].join("");
}

export function renderRoomSelect(dom: WebDom, rooms: Room[], selectedRoomId: string): void {
  dom.roomSelectEl.innerHTML = "";
  if (rooms.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Keine Raeume geladen";
    dom.roomSelectEl.appendChild(option);
    dom.roomSelectEl.value = "";
    return;
  }
  for (const room of rooms) {
    const option = document.createElement("option");
    option.value = room.id;
    option.textContent = room.label;
    dom.roomSelectEl.appendChild(option);
  }
  dom.roomSelectEl.value = selectedRoomId;
}

export function renderLampSelect(dom: WebDom, room: Room | undefined, selectedLampId: string): void {
  dom.lampSelectEl.innerHTML = "";
  if (!room) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Keine Lampen";
    dom.lampSelectEl.appendChild(option);
    dom.lampSelectEl.value = "";
    return;
  }
  for (const lamp of room.lamps) {
    const option = document.createElement("option");
    option.value = lamp.id;
    option.textContent = lamp.label;
    dom.lampSelectEl.appendChild(option);
  }
  dom.lampSelectEl.value = selectedLampId;
}

export function renderCommandButtons(
  dom: WebDom,
  commands: LampCommand[],
  onCommand: (cmd: LampCommand) => void
): void {
  dom.commandActionsEl.innerHTML = "";
  for (const cmd of commands) {
    const btn = document.createElement("button");
    btn.textContent = cmd.label;
    btn.addEventListener("click", () => onCommand(cmd));
    dom.commandActionsEl.appendChild(btn);
  }
}
