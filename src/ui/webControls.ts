import type { LampCommand, Room } from "../models";
import { t } from "../i18n";

export type WebDom = {
  statusEl: HTMLDivElement;
  healthEl: HTMLDivElement;
  setupStateEl: HTMLDivElement;
  logEl: HTMLPreElement;
  deployBtn: HTMLButtonElement;
  shutdownBtn: HTMLButtonElement;
  saveBaseBtn: HTMLButtonElement;
  discoverBtn: HTMLButtonElement;
  loadHaBtn: HTMLButtonElement;
  loadHaEmptyBtn: HTMLButtonElement;
  includeScenesEl: HTMLInputElement;
  baseUrlInput: HTMLInputElement;
  tokenInput: HTMLInputElement;
  roomSelectEl: HTMLSelectElement;
  lampSelectEl: HTMLSelectElement;
  commandActionsEl: HTMLDivElement;
  webToastEl: HTMLDivElement;
};

function mustQuery<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}

export function initWebUi(app: HTMLDivElement): WebDom {
  app.innerHTML = `
    <main class="dashboard">
      <header class="dashboard-header">
        <h1>${t("app.title")}</h1>
        <p class="muted">${t("setup.steps")}</p>
        <div id="health" class="health"></div>
        <div id="status" class="status">${t("status.idle")}</div>
      </header>

      <section class="grid">
        <article class="tile">
          <h2>${t("section.bridge")}</h2>
          <div class="actions">
            <button id="btn-deploy">${t("button.deploy")}</button>
            <button id="btn-shutdown" class="secondary">${t("button.shutdown")}</button>
          </div>
        </article>

        <article class="tile">
          <h2>${t("section.homeAssistant")}</h2>
          <label class="field-label">${t("label.baseUrl")}</label>
          <input id="base-url" class="base-url" />
          <label class="field-label">${t("label.token")}</label>
          <input id="ha-token" class="base-url" type="password" />
          <label class="switch-line"><input id="include-scenes" type="checkbox" /> ${t("label.includeScenes")}</label>
          <div class="actions">
            <button id="btn-save-base">${t("button.testConnection")}</button>
            <button id="btn-discover" class="secondary">${t("button.discover")}</button>
            <button id="btn-load-ha">${t("button.loadHa")}</button>
          </div>
        </article>

      </section>

      <details class="control-panel">
        <summary>${t("section.control")}</summary>
        <div class="control-body">
          <div id="setup-state" class="empty-state hidden">
            <p class="muted">${t("empty.noRoomsWeb")}</p>
            <button id="btn-load-ha-empty">${t("button.loadHaNow")}</button>
          </div>
          <label class="field-label">${t("label.simFlow")}</label>
          <select id="room-select" class="base-url"></select>
          <select id="lamp-select" class="base-url"></select>
          <div id="command-actions" class="actions command-actions"></div>
        </div>
      </details>

      <details class="log-panel">
        <summary>${t("section.log")}</summary>
        <pre id="log"></pre>
      </details>
    </main>
  `;

  const webToast = document.createElement("div");
  webToast.id = "web-toast";
  webToast.className = "web-toast hidden";
  document.body.appendChild(webToast);

  return {
    statusEl: mustQuery<HTMLDivElement>("#status"),
    healthEl: mustQuery<HTMLDivElement>("#health"),
    setupStateEl: mustQuery<HTMLDivElement>("#setup-state"),
    logEl: mustQuery<HTMLPreElement>("#log"),
    deployBtn: mustQuery<HTMLButtonElement>("#btn-deploy"),
    shutdownBtn: mustQuery<HTMLButtonElement>("#btn-shutdown"),
    saveBaseBtn: mustQuery<HTMLButtonElement>("#btn-save-base"),
    discoverBtn: mustQuery<HTMLButtonElement>("#btn-discover"),
    loadHaBtn: mustQuery<HTMLButtonElement>("#btn-load-ha"),
    loadHaEmptyBtn: mustQuery<HTMLButtonElement>("#btn-load-ha-empty"),
    includeScenesEl: mustQuery<HTMLInputElement>("#include-scenes"),
    baseUrlInput: mustQuery<HTMLInputElement>("#base-url"),
    tokenInput: mustQuery<HTMLInputElement>("#ha-token"),
    roomSelectEl: mustQuery<HTMLSelectElement>("#room-select"),
    lampSelectEl: mustQuery<HTMLSelectElement>("#lamp-select"),
    commandActionsEl: mustQuery<HTMLDivElement>("#command-actions"),
    webToastEl: webToast,
  };
}

export function setBusy(dom: WebDom, value: boolean): void {
  dom.deployBtn.disabled = value;
  dom.shutdownBtn.disabled = value;
  dom.saveBaseBtn.disabled = value;
  dom.discoverBtn.disabled = value;
  dom.loadHaBtn.disabled = value;
  dom.loadHaEmptyBtn.disabled = value;
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
  return `<span class="badge" data-level="${level}"><span class="badge-label">${label}</span><span class="badge-value">${text}</span></span>`;
}

export function setHealthState(
  dom: WebDom,
  value: {
    bridge: { text: string; level: BadgeLevel };
    glasses: { text: string; level: BadgeLevel };
    ha: { text: string; level: BadgeLevel };
    token: { text: string; level: BadgeLevel };
    rooms: { text: string; level: BadgeLevel };
  }
): void {
  dom.healthEl.innerHTML = [
    renderBadge(t("health.bridge"), value.bridge.text, value.bridge.level),
    renderBadge(t("health.glasses"), value.glasses.text, value.glasses.level),
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

let webToastTimer: ReturnType<typeof setTimeout> | null = null;
let webToastFadeTimer: ReturnType<typeof setTimeout> | null = null;

export function showWebToast(dom: WebDom, text: string, durationMs = 1800): void {
  if (webToastTimer !== null) { clearTimeout(webToastTimer); webToastTimer = null; }
  if (webToastFadeTimer !== null) { clearTimeout(webToastFadeTimer); webToastFadeTimer = null; }
  dom.webToastEl.textContent = text;
  dom.webToastEl.classList.remove("hidden", "hiding");
  webToastTimer = setTimeout(() => {
    dom.webToastEl.classList.add("hiding");
    webToastFadeTimer = setTimeout(() => {
      dom.webToastEl.classList.add("hidden");
      dom.webToastEl.classList.remove("hiding");
    }, 300);
  }, durationMs);
}
