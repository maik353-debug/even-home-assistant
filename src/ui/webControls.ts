import type { LampCommand, Room } from "../models";
import { t } from "../i18n";

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
      <h1>${t("app.title")}</h1>
      <p class="muted">${t("setup.steps")}</p>
      <div id="health" class="health"></div>
      <div id="status" class="status">${t("status.idle")}</div>
      <div class="actions">
        <button id="btn-connect">${t("button.connect")}</button>
        <button id="btn-deploy">${t("button.deploy")}</button>
        <button id="btn-shutdown" class="secondary">${t("button.shutdown")}</button>
      </div>
      <p class="muted">${t("label.baseUrl")}</p>
      <input id="base-url" class="base-url" />
      <p class="muted">${t("label.token")}</p>
      <input id="ha-token" class="base-url" type="password" />
      <div class="actions">
        <button id="btn-save-base">${t("button.testConnection")}</button>
        <button id="btn-load-ha">${t("button.loadHa")}</button>
        <button id="btn-diagnostics" class="secondary">${t("button.diagnostics")}</button>
        <button id="btn-test">${t("button.testCommand")}</button>
      </div>
      <div class="actions">
        <label><input id="include-scenes" type="checkbox" /> ${t("label.includeScenes")}</label>
      </div>
      <div id="setup-state" class="empty-state hidden">
        <p class="muted">${t("empty.noRoomsWeb")}</p>
        <button id="btn-load-ha-empty">${t("button.loadHaNow")}</button>
      </div>
      <p class="muted">${t("label.simFlow")}</p>
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
    renderBadge(t("health.bridge"), value.bridge.text, value.bridge.level),
    renderBadge(t("health.ha"), value.ha.text, value.ha.level),
    renderBadge(t("health.token"), value.token.text, value.token.level),
    renderBadge(t("health.rooms"), value.rooms.text, value.rooms.level),
  ].join("");
}

export function renderRoomSelect(dom: WebDom, rooms: Room[], selectedRoomId: string): void {
  dom.roomSelectEl.innerHTML = "";
  if (rooms.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("select.noRooms");
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
    option.textContent = t("select.noLamps");
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
