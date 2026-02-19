import { DeviceConnectType, OsEventTypeList, type EvenAppBridge, waitForEvenAppBridge } from "@evenrealities/even_hub_sdk";
import {
  buildHaRequest,
  buildHaRequestForEntityIds,
  fetchLampState,
  haApiUrl,
  loadRoomsFromHomeAssistant as loadRoomsFromHomeAssistantApi,
} from "./haApi";
import { getGlassesMenuItems as buildMenuItems, resolveMenuIndex as resolveMenuIndexFromEvent } from "./menu";
import { ENTITY_COMMANDS, ROOM_COMMANDS, type Lamp, type LampCommand, type Room } from "./models";
import {
  APP_STATE_STORAGE_KEY,
  BASE_URL_STORAGE_KEY,
  BOOTSTRAP_BASE_URL,
  BOOTSTRAP_HA_TOKEN,
  DEFAULT_BASE_URL,
  DEFAULT_HA_TOKEN,
  HA_TOKEN_SESSION_STORAGE_KEY,
  HA_TOKEN_STORAGE_KEY,
  INCLUDE_SCENES_STORAGE_KEY,
  saveConfigToBrowserStorage,
} from "./config";
import { mapHaErrorToUserMessage, toErrorText } from "./errors";
import { localizeCommandLabel, t } from "./i18n";
import {
  createInitialState,
  getLampStateLabel,
  getSelectedLamp,
  getSelectedLampStateLabel,
  getSelectedRoom,
  hasRooms,
  setRooms as setRoomsState,
} from "./state/appState";
import { restoreAppStateFromStorage, saveAppStateToStorage } from "./state/persistence";
import { createHaStateSync } from "./stateSync";
import {
  APP_LIST_CONTAINER_ID,
  APP_LIST_CONTAINER_NAME,
  renderGlassesMenu,
  setGlassesHeaderText,
  setGlassesToastText,
} from "./ui/glasses";
import {
  initWebUi,
  renderCommandButtons,
  renderLampSelect,
  renderRoomSelect,
  setBusy as setBusyUi,
  setHealthState as setHealthStateUi,
  setSetupStateVisible,
  setStatus as setStatusUi,
  writeLog as writeLogUi,
} from "./ui/webControls";
import "./style.css";

const isLoopbackHost = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
// Use Vite proxy whenever served by dev server (:3000), including phone access via LAN IP.
const useHaProxy = window.location.port === "3000";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app element");

const dom = initWebUi(app);
const state = createInitialState();

let bridge: EvenAppBridge | null = null;
let isBusy = false;
let headerToastTimer: number | null = null;
let uiRefreshTimer: number | null = null;
let currentToastText = "";
let bridgeStorageHydrated = false;
let emptyHeaderStatus = t("header.rooms.none");
let bridgeReachability: "ok" | "bad" | "unknown" = "unknown";
let glassesReachability: "ok" | "bad" | "unknown" = "unknown";
let haReachability: "ok" | "bad" | "unknown" = "unknown";
let suppressCommandSelectionUntilTs = 0;
let suppressListEventUntilTs = 0;
let lastKnownListIndex = 0;
let lastListIndexChangeTs = 0;
let lastUndefinedClickDispatchTs = 0;

dom.baseUrlInput.value = BOOTSTRAP_BASE_URL || localStorage.getItem(BASE_URL_STORAGE_KEY) || DEFAULT_BASE_URL;
dom.tokenInput.value =
  BOOTSTRAP_HA_TOKEN ||
  sessionStorage.getItem(HA_TOKEN_SESSION_STORAGE_KEY) ||
  localStorage.getItem(HA_TOKEN_STORAGE_KEY) ||
  DEFAULT_HA_TOKEN;
dom.baseUrlInput.placeholder = "e.g. http://homeassistant.local:8123";
dom.includeScenesEl.checked = localStorage.getItem(INCLUDE_SCENES_STORAGE_KEY) === "1";
if (BOOTSTRAP_BASE_URL || BOOTSTRAP_HA_TOKEN) {
  saveConfigToBrowserStorage(dom.baseUrlInput.value, dom.tokenInput.value);
}

function getBaseUrl(): string {
  return dom.baseUrlInput.value.trim().replace(/\/+$/, "");
}

function getToken(): string {
  return dom.tokenInput.value.trim();
}

function hasBaseUrl(): boolean {
  return getBaseUrl().length > 0;
}

function hasToken(): boolean {
  return getToken().length > 0;
}

function persistConfigDraft(): void {
  // Persist eagerly so URL/token survive reloads even if user does not press the save button.
  saveConfigToBrowserStorage(getBaseUrl(), getToken());
  void mirrorToBridgeStorage(BASE_URL_STORAGE_KEY, getBaseUrl());
  void mirrorToBridgeStorage(HA_TOKEN_STORAGE_KEY, getToken());
}

async function mirrorToBridgeStorage(key: string, value: string): Promise<void> {
  // Keep SDK host storage in sync with browser storage for simulator/device persistence.
  if (!bridge) return;
  try {
    await bridge.setLocalStorage(key, value);
  } catch (error) {
    writeLog(`Bridge storage write failed for ${key}: ${toErrorText(error)}`);
  }
}

async function hydrateStorageFromBridge(): Promise<void> {
  if (!bridge || bridgeStorageHydrated) return;
  // One-time hydration avoids late async reads overriding values while user is already editing fields.
  bridgeStorageHydrated = true;
  try {
    const [storedBaseUrl, storedToken, storedAppState] = await Promise.all([
      bridge.getLocalStorage(BASE_URL_STORAGE_KEY),
      bridge.getLocalStorage(HA_TOKEN_STORAGE_KEY),
      bridge.getLocalStorage(APP_STATE_STORAGE_KEY),
    ]);

    if (typeof storedBaseUrl === "string" && storedBaseUrl.trim()) {
      dom.baseUrlInput.value = storedBaseUrl.trim().replace(/\/+$/, "");
      localStorage.setItem(BASE_URL_STORAGE_KEY, dom.baseUrlInput.value);
    } else if (getBaseUrl()) {
      await mirrorToBridgeStorage(BASE_URL_STORAGE_KEY, getBaseUrl());
    }
    if (typeof storedToken === "string" && storedToken.trim()) {
      dom.tokenInput.value = storedToken.trim();
      sessionStorage.setItem(HA_TOKEN_SESSION_STORAGE_KEY, dom.tokenInput.value);
      localStorage.setItem(HA_TOKEN_STORAGE_KEY, dom.tokenInput.value);
    } else if (getToken()) {
      await mirrorToBridgeStorage(HA_TOKEN_STORAGE_KEY, getToken());
    }
    if (typeof storedAppState === "string" && storedAppState.trim()) {
      localStorage.setItem(APP_STATE_STORAGE_KEY, storedAppState);
      // Restore immediately when nothing is loaded yet, so first deploy works without manual HA import.
      if (!hasRooms(state)) {
        const restored = restoreAppState();
        if (restored) {
          applyRooms(restored.rooms, { roomId: restored.selectedRoomId, lampId: restored.selectedLampId });
          writeLog(`Restored state from bridge storage: ${state.rooms.length} rooms`);
          setStatus(t("status.savedStateLoaded"));
        }
      }
    } else if (localStorage.getItem(APP_STATE_STORAGE_KEY)) {
      await mirrorToBridgeStorage(APP_STATE_STORAGE_KEY, localStorage.getItem(APP_STATE_STORAGE_KEY) ?? "");
    }
  } catch (error) {
    writeLog(`Bridge storage read failed: ${toErrorText(error)}`);
  }
}

function saveAppState(): void {
  const serialized = saveAppStateToStorage(state, APP_STATE_STORAGE_KEY);
  // Mirror app state to SDK storage so it can be recovered in host-driven environments.
  void mirrorToBridgeStorage(APP_STATE_STORAGE_KEY, serialized);
}

function restoreAppState(): { rooms: Room[]; selectedRoomId: string; selectedLampId: string } | null {
  return restoreAppStateFromStorage(state, APP_STATE_STORAGE_KEY);
}

function setStatus(text: string): void {
  setStatusUi(dom, text);
}

function writeLog(message: string): void {
  writeLogUi(dom, message);
}

function setBusy(value: boolean): void {
  isBusy = value;
  setBusyUi(dom, value);
}

function refreshWebCommandButtons(): void {
  const commands = getEntityCommands(getSelectedLamp(state));
  renderCommandButtons(dom, commands, (cmd) => {
    void run(async () => executeSelectedCommand(cmd, "web"));
  });
}

function updateHealthState(): void {
  const roomCount = state.rooms.length;
  setHealthStateUi(dom, {
    bridge: {
      text:
        bridgeReachability === "ok"
          ? t("health.bridge.ok")
          : bridgeReachability === "bad"
            ? t("health.bridge.bad")
            : t("health.bridge.unknown"),
      level: bridgeReachability,
    },
    glasses: {
      text:
        glassesReachability === "ok"
          ? t("health.glasses.ok")
          : glassesReachability === "bad"
            ? t("health.glasses.bad")
            : t("health.glasses.unknown"),
      level: glassesReachability,
    },
    ha: {
      text:
        haReachability === "ok" ? t("health.ha.ok") : haReachability === "bad" ? t("health.ha.bad") : t("health.ha.unknown"),
      level: haReachability,
    },
    token: {
      text: hasToken() ? t("health.token.ok") : t("health.token.bad"),
      level: hasToken() ? "ok" : "bad",
    },
    rooms: {
      text: String(roomCount),
      level: roomCount > 0 ? "ok" : "unknown",
    },
  });
}

function syncSelectors(): void {
  renderRoomSelect(dom, state.rooms, state.selectedRoomId);
  renderLampSelect(dom, getSelectedRoom(state), state.selectedLampId);
  refreshWebCommandButtons();
  setSetupStateVisible(dom, !hasRooms(state));
  updateHealthState();
}

function getLampDomain(lamp: Lamp): "light" | "scene" {
  return lamp.domain ?? "light";
}

function getEntityCommands(lamp: Lamp | undefined): LampCommand[] {
  if (!lamp) return [];
  const domain = getLampDomain(lamp);
  return ENTITY_COMMANDS.filter((cmd) => !cmd.domains || cmd.domains.includes(domain)).map((cmd) => ({
    ...cmd,
    label: localizeCommandLabel(cmd.id, cmd.label),
  }));
}

function getRoomCommands(room: Room | undefined): LampCommand[] {
  if (!room) return [];
  const domains = new Set(room.lamps.map((lamp) => getLampDomain(lamp)));
  return ROOM_COMMANDS.filter((cmd) => {
    if (!cmd.domains || cmd.domains.length === 0) return true;
    return cmd.domains.some((domain) => domains.has(domain));
  }).map((cmd) => ({
    ...cmd,
    label: localizeCommandLabel(cmd.id, cmd.label),
  }));
}

function isSceneRoom(room: Room | undefined): boolean {
  if (!room || room.lamps.length === 0) return false;
  return room.lamps.every((lamp) => getLampDomain(lamp) === "scene");
}

function isLampUnavailable(lamp: Lamp): boolean {
  return getLampStateLabel(state, lamp) === "UNAVAILABLE";
}

function mergeInitialEntityStates(rooms: Room[]): void {
  for (const room of rooms) {
    for (const lamp of room.lamps) {
      if (!state.lampStateCache[lamp.pathPrefix] && lamp.initialState) {
        state.lampStateCache[lamp.pathPrefix] = lamp.initialState;
      }
    }
  }
}

async function notifyUser(statusText: string, logText: string, toastText: string, durationMs = 1800): Promise<void> {
  setStatus(statusText);
  writeLog(logText);
  await showHeaderToast(toastText, durationMs);
}

function applyPreferredSelection(preferredRoomId: string, preferredLampId: string): void {
  const room = state.rooms.find((x) => x.id === preferredRoomId);
  if (!room) return;
  state.selectedRoomId = room.id;
  state.selectedLampId = room.lamps.find((x) => x.id === preferredLampId)?.id ?? room.lamps[0]?.id ?? "";
}

function pruneLampCaches(): void {
  const valid = allLampEntityIds();
  state.lampStateCache = Object.fromEntries(Object.entries(state.lampStateCache).filter(([entityId]) => valid.has(entityId)));
  state.pendingExpectedState = Object.fromEntries(
    Object.entries(state.pendingExpectedState).filter(([entityId]) => valid.has(entityId))
  );
}

function getHeaderText(): string {
  if (!hasRooms(state)) return emptyHeaderStatus;
  if (state.glassesMenuLevel === "rooms") return t("header.rooms.available", { count: state.rooms.length });
  if (state.glassesMenuLevel === "lamps") return t("header.lamps.forRoom", { room: getSelectedRoom(state)?.label ?? "-" });
  const selectedLamp = getSelectedLamp(state);
  if (selectedLamp && getLampDomain(selectedLamp) === "scene") return t("header.commands.forScene", { lamp: selectedLamp.label });
  return t("header.commands.forLamp", {
    state: getSelectedLampStateLabel(state),
    lamp: selectedLamp?.label ?? "-",
  });
}

function setEmptyHeaderStatus(text: string): void {
  emptyHeaderStatus = text;
  if (state.glassesMenuLevel === "rooms" && !hasRooms(state)) {
    void renderHeaderStatus();
  }
}

function clearHeaderToast(): void {
  if (headerToastTimer !== null) {
    window.clearTimeout(headerToastTimer);
    headerToastTimer = null;
  }
  currentToastText = "";
  void setGlassesToastText(bridge, "");
}

function isHeaderToastActive(): boolean {
  return headerToastTimer !== null;
}

async function renderHeaderStatus(): Promise<void> {
  await setGlassesHeaderText(bridge, getHeaderText());
}

async function showHeaderToast(text: string, durationMs = 800): Promise<void> {
  clearHeaderToast();
  // Rebuild resets text containers; keep the current toast so it can be reapplied after rebuild.
  currentToastText = text;
  if (!bridge) {
    try {
      await ensureBridge({ silent: true });
    } catch {
      return;
    }
  }
  await setGlassesToastText(bridge, text);
  headerToastTimer = window.setTimeout(() => {
    clearHeaderToast();
  }, durationMs);
}

function applyOptimisticLampState(lamp: Lamp, cmd: LampCommand): void {
  if (cmd.service === "turn_on") {
    state.lampStateCache[lamp.pathPrefix] = "ON";
    state.pendingExpectedState[lamp.pathPrefix] = { expected: "ON", untilTs: Date.now() + 2500 };
    saveAppState();
    return;
  }
  if (cmd.service === "turn_off") {
    state.lampStateCache[lamp.pathPrefix] = "OFF";
    state.pendingExpectedState[lamp.pathPrefix] = { expected: "OFF", untilTs: Date.now() + 2500 };
    saveAppState();
  }
}

function applyLampStateSample(entityId: string, normalizedState: string): boolean {
  const pending = state.pendingExpectedState[entityId];
  if (!pending) {
    state.lampStateCache[entityId] = normalizedState;
    saveAppState();
    return true;
  }

  if (Date.now() > pending.untilTs) {
    delete state.pendingExpectedState[entityId];
    state.lampStateCache[entityId] = normalizedState;
    saveAppState();
    return true;
  }

  if (normalizedState === pending.expected) {
    delete state.pendingExpectedState[entityId];
    state.lampStateCache[entityId] = normalizedState;
    saveAppState();
    return true;
  }

  return false;
}

async function refreshSelectedLampState(updateHeader = false): Promise<void> {
  const lamp = getSelectedLamp(state);
  if (!lamp) return;
  const next = await fetchLampState(getBaseUrl(), getToken(), useHaProxy, lamp);
  applyLampStateSample(lamp.pathPrefix, next);
  if (updateHeader && state.glassesMenuLevel === "commands") {
    await renderHeaderStatus();
  }
}

async function refreshRoomLampStates(): Promise<void> {
  const room = getSelectedRoom(state);
  if (!room) return;
  await Promise.all(
    room.lamps.map(async (lamp) => {
      const next = await fetchLampState(getBaseUrl(), getToken(), useHaProxy, lamp);
      applyLampStateSample(lamp.pathPrefix, next);
    })
  );
}

async function refreshVisibleLampStates(updateUi = false): Promise<void> {
  if (state.glassesMenuLevel === "lamps") {
    await refreshRoomLampStates();
    // Avoid list rebuild while user is in lamp list; rebuild resets selection to first item on host side.
    return;
  }
  if (state.glassesMenuLevel === "commands") {
    await refreshSelectedLampState(false);
    if (updateUi && !isHeaderToastActive()) {
      await renderHeaderStatus();
    }
  }
}

async function testHomeAssistantConnection(): Promise<void> {
  if (!hasBaseUrl()) {
    await notifyUser(
      t("status.homeAssistantUrlMissing"),
      t("status.homeAssistantUrlMissing"),
      t("toast.errorPrefix", { text: t("status.homeAssistantUrlMissing") }),
      1600
    );
    haReachability = "bad";
    updateHealthState();
    return;
  }
  if (!hasToken()) {
    await notifyUser(
      t("status.homeAssistantTokenMissing"),
      t("status.homeAssistantTokenMissing"),
      t("toast.errorPrefix", { text: t("status.homeAssistantTokenMissing") }),
      1600
    );
    haReachability = "bad";
    updateHealthState();
    return;
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(haApiUrl(getBaseUrl(), useHaProxy, "/api/"), {
      method: "GET",
      headers: { Authorization: `Bearer ${getToken()}` },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    haReachability = "ok";
    updateHealthState();
    await notifyUser(t("status.haConnectionOk"), t("log.connectionTestOk"), t("toast.haReachable"), 1300);
  } catch (error) {
    const reason = toErrorText(error);
    const friendly = mapHaErrorToUserMessage(reason);
    haReachability = "bad";
    updateHealthState();
    await notifyUser(
      t("status.haConnectionFail"),
      `${t("status.haConnectionFail")}: ${reason}`,
      t("toast.errorPrefix", { text: friendly }),
      2000
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

async function confirmLampStateAfterCommand(lamp: Lamp): Promise<void> {
  const waits = [250, 450, 700];
  for (const waitMs of waits) {
    await new Promise((resolve) => window.setTimeout(resolve, waitMs));
    const sample = await fetchLampState(getBaseUrl(), getToken(), useHaProxy, lamp);
    const applied = applyLampStateSample(lamp.pathPrefix, sample);
    if (applied && state.glassesMenuLevel === "commands") {
      await renderHeaderStatus();
    }
  }
}

function allLampEntityIds(): Set<string> {
  const ids = new Set<string>();
  for (const room of state.rooms) {
    for (const lamp of room.lamps) ids.add(lamp.pathPrefix);
  }
  return ids;
}

function scheduleUiRefreshFromStateEvent(entityId: string): void {
  if (!hasRooms(state) || state.glassesMenuLevel === "rooms") return;
  if (state.glassesMenuLevel === "lamps") {
    const room = getSelectedRoom(state);
    if (!room || !room.lamps.some((x) => x.pathPrefix === entityId)) return;
    return;
  }
  if (state.glassesMenuLevel === "commands") {
    const current = getSelectedLamp(state);
    if (!current || current.pathPrefix !== entityId) return;
  }
  if (uiRefreshTimer !== null) return;
  uiRefreshTimer = window.setTimeout(() => {
    uiRefreshTimer = null;
    if (state.glassesMenuLevel === "lamps") {
      void renderGlassesMenuUi();
      return;
    }
    if (state.glassesMenuLevel === "commands" && !isHeaderToastActive()) {
      void renderHeaderStatus();
    }
  }, 120);
}

const stateSync = createHaStateSync({
  getBaseUrl,
  getToken,
  getEntityIds: allLampEntityIds,
  onStateChanged: (entityId, normalizedState) => {
    const applied = applyLampStateSample(entityId, normalizedState);
    if (applied) scheduleUiRefreshFromStateEvent(entityId);
  },
  onFallbackPoll: async () => {
    await refreshVisibleLampStates(true);
  },
  onLog: writeLog,
});

function startStateSync(): void {
  stateSync.start();
}

function stopStateSync(): void {
  clearHeaderToast();
  stateSync.stop();
  if (uiRefreshTimer !== null) {
    window.clearTimeout(uiRefreshTimer);
    uiRefreshTimer = null;
  }
}

async function ensureBridge(options?: { silent?: boolean }): Promise<EvenAppBridge> {
  if (bridge) return bridge;
  const silent = options?.silent === true;

  if (!silent) setStatus(t("status.connectingBridge"));
  bridge = await waitForEvenAppBridge();
  bridgeReachability = "ok";
  updateHealthState();
  // Pull persisted values from SDK storage before wiring UI interactions.
  await hydrateStorageFromBridge();
  if (!silent) {
    setStatus(t("status.bridgeConnected"));
    writeLog(t("log.bridgeReady"));
  }

  bridge.onDeviceStatusChanged((status) => {
    const connected = status.connectType === DeviceConnectType.Connected;
    glassesReachability = connected ? "ok" : "bad";
    updateHealthState();
    const battery = status.batteryLevel ?? "n/a";
    setStatus(t("status.deviceInfo", { connectType: String(status.connectType), battery: String(battery) }));
    writeLog(`deviceStatusChanged (connected=${connected}, battery=${battery})`);
  });

  bridge.onEvenHubEvent((event) => {
    if (event.sysEvent) {
      const sysType = String(event.sysEvent.eventType ?? "").toUpperCase();
      writeLog(`glasses sysEvent: type=${sysType || "-"}`);
      if (sysType === "DOUBLE_CLICK_EVENT" || sysType === "DOUBLECLICK_EVENT" || sysType === "3") {
        if (state.glassesMenuLevel === "rooms") {
          void run(async () => shutdownPageFromGesture());
          return;
        }
        void run(async () => goBackOneLevel());
        return;
      }
    }

    if (!event.listEvent) return;
    if (!state.glassesUiCreated) return;
    const index = event.listEvent.currentSelectItemIndex ?? -1;
    const itemNameRaw = (event.listEvent.currentSelectItemName ?? "").trim();
    const itemName = itemNameRaw === "-" ? "" : itemNameRaw;
    const containerId = event.listEvent.containerID;
    const containerName = String(event.listEvent.containerName ?? "").trim();
    // Some simulator builds report inconsistent container IDs; prefer strict name match when available.
    if (containerId !== undefined && containerId !== APP_LIST_CONTAINER_ID && !containerName) return;
    if (containerName && containerName !== APP_LIST_CONTAINER_NAME) return;
    const eventType = event.listEvent.eventType;
    if (index >= 0 && index !== lastKnownListIndex) {
      lastKnownListIndex = index;
      lastListIndexChangeTs = Date.now();
    } else if (index >= 0) {
      lastKnownListIndex = index;
    }
    if ((eventType === undefined || eventType === null) && Date.now() < suppressListEventUntilTs) return;
    writeLog(`glasses listEvent: index=${index}, item=${itemName || "-"}, type=${String(eventType ?? "undefined")}`);

    if (
      (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT || String(eventType ?? "").toUpperCase() === "DOUBLE_CLICK_EVENT" || String(eventType ?? "") === "3") &&
      state.glassesMenuLevel === "rooms"
    ) {
      void run(async () => shutdownPageFromGesture());
      return;
    }
    if (
      (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT || String(eventType ?? "").toUpperCase() === "DOUBLE_CLICK_EVENT" || String(eventType ?? "") === "3") &&
      state.glassesMenuLevel !== "rooms"
    ) {
      void run(async () => goBackOneLevel());
      return;
    }

    const eventTypeText = String(eventType ?? "");
    const isClickLike =
      eventType === OsEventTypeList.CLICK_EVENT ||
      eventType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
      eventTypeText === "CLICK_EVENT" ||
      eventTypeText === "DOUBLE_CLICK_EVENT" ||
      eventTypeText === "0" ||
      eventTypeText === "3";
    // Some runtimes emit undefined event types for click.
    if (eventType === undefined || eventType === null) {
      const fallbackIndex = index >= 0 ? index : 0;
      if (isLoopbackHost) {
        void run(async () => handleGlassesSelection(fallbackIndex, itemName));
        return;
      }
      const now = Date.now();
      const isStableIndex = now - lastListIndexChangeTs >= 140;
      const cooldownOk = now - lastUndefinedClickDispatchTs >= 280;
      const hasNamedItem = itemName.length > 0;
      if ((hasNamedItem || isStableIndex) && cooldownOk && fallbackIndex >= 0) {
        lastUndefinedClickDispatchTs = now;
        void run(async () => handleGlassesSelection(fallbackIndex, itemName));
      }
      return;
    }
    if (!isClickLike) return;
    void run(async () => handleGlassesSelection(index, itemName));
  });

  try {
    const [user, device] = await Promise.all([bridge.getUserInfo(), bridge.getDeviceInfo()]);
    writeLog(`user: ${user.name} (${user.uid})`);
    writeLog(`device: ${device?.model ?? "unknown"} / ${device?.sn ?? "n/a"}`);
  } catch (error) {
    writeLog(`initial metadata fetch failed: ${String(error)}`);
  }

  return bridge;
}

async function ensureBridgeSilent(): Promise<void> {
  try {
    await ensureBridge({ silent: true });
  } catch (error) {
    bridgeReachability = "bad";
    updateHealthState();
    writeLog(`bridge init skipped: ${toErrorText(error)}`);
  }
}

function getMenuItems(): string[] {
  const selectedLamp = getSelectedLamp(state);
  const selectedRoom = getSelectedRoom(state);
  return buildMenuItems(
    state.rooms,
    state.glassesMenuLevel,
    selectedRoom,
    (lamp) => (getLampDomain(lamp) === "scene" ? "" : getLampStateLabel(state, lamp)),
    getEntityCommands(selectedLamp).map((x) => x.label),
    getRoomCommands(selectedRoom).map((x) => x.label),
    t("menu.refreshHa")
  );
}

async function renderGlassesMenuUi(): Promise<void> {
  const b = await ensureBridge();
  const created = await renderGlassesMenu(
    b,
    getHeaderText(),
    getMenuItems(),
    state.glassesUiCreated,
    currentToastText
  );
  if (!state.glassesUiCreated && !created) {
    writeLog(t("log.startupContainerFailed"));
    setStatus(t("status.uiBuildFailed"));
    return;
  }
  state.glassesUiCreated = created;
  // Ignore host list-events briefly after rebuild to avoid stale carry-over events from previous menu level.
  suppressListEventUntilTs = Date.now() + 260;
}

async function executeSelectedCommand(cmd: LampCommand, source: "web" | "glasses"): Promise<void> {
  const room = getSelectedRoom(state);
  const lamp = getSelectedLamp(state);
  if (!room || !lamp) {
    await notifyUser(t("status.noLampSelected"), t("status.noLampSelected"), t("toast.noLamp"));
    return;
  }
  if (isLampUnavailable(lamp)) {
    await notifyUser(t("status.lampOffline"), `${lamp.label} ${t("status.lampOffline")}`, t("toast.lampOffline"), 1500);
    return;
  }

  if (!hasBaseUrl()) {
    haReachability = "bad";
    updateHealthState();
    await notifyUser(
      t("status.homeAssistantUrlMissing"),
      t("status.homeAssistantUrlMissing"),
      t("toast.errorPrefix", { text: t("status.homeAssistantUrlMissing") }),
      1600
    );
    return;
  }

  const token = getToken();
  if (!token) {
    haReachability = "bad";
    updateHealthState();
    await notifyUser(
      t("status.homeAssistantTokenMissing"),
      t("status.homeAssistantTokenMissing"),
      t("toast.errorPrefix", { text: t("status.homeAssistantTokenMissing") }),
      1600
    );
    return;
  }

  const request = buildHaRequest(getBaseUrl(), useHaProxy, lamp, cmd);
  const title = `${room.label} / ${lamp.label} / ${cmd.label}`;
  writeLog(`trigger[${source}] ${title} -> ${request.url}`);
  setStatus(t("status.sending", { title }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });
    const stateText = response.ok ? "OK" : mapHaErrorToUserMessage(`HTTP ${response.status}`);
    const result = `${lamp.label}: ${cmd.label} -> ${stateText}`;
    writeLog(result);
    setStatus(result);
    if (response.ok) {
      haReachability = "ok";
      updateHealthState();
      applyOptimisticLampState(lamp, cmd);
      await renderHeaderStatus();
      void confirmLampStateAfterCommand(lamp);
    } else {
      haReachability = "bad";
      updateHealthState();
    }
    await showHeaderToast(`${cmd.label}: ${stateText}`, 1200);
  } catch (error) {
    const reason = toErrorText(error);
    const friendly = mapHaErrorToUserMessage(reason);
    haReachability = "bad";
    updateHealthState();
    const result = `${lamp.label}: ${cmd.label} -> ${friendly}`;
    writeLog(`${result} (${reason})`);
    setStatus(result);
    await showHeaderToast(`${cmd.label}: ${friendly}`, 1600);
    void refreshSelectedLampState(true);
  } finally {
    clearTimeout(timeout);
  }
}

async function executeRoomCommand(cmd: LampCommand, source: "web" | "glasses"): Promise<void> {
  const room = getSelectedRoom(state);
  if (!room) return;
  if (!hasBaseUrl()) {
    haReachability = "bad";
    updateHealthState();
    await notifyUser(
      t("status.homeAssistantUrlMissing"),
      t("status.homeAssistantUrlMissing"),
      t("toast.errorPrefix", { text: t("status.homeAssistantUrlMissing") }),
      1600
    );
    return;
  }
  if (!hasToken()) {
    haReachability = "bad";
    updateHealthState();
    await notifyUser(
      t("status.homeAssistantTokenMissing"),
      t("status.homeAssistantTokenMissing"),
      t("toast.errorPrefix", { text: t("status.homeAssistantTokenMissing") }),
      1600
    );
    return;
  }

  const activeEntities = room.lamps.filter((lamp) => !isLampUnavailable(lamp));
  const targeted = activeEntities.filter((lamp) => {
    if (!cmd.domains || cmd.domains.length === 0) return true;
    return cmd.domains.includes(getLampDomain(lamp));
  });
  if (targeted.length === 0) {
    await notifyUser(t("status.noMatchingDevices"), t("status.noMatchingDevices"), t("toast.noTargets"), 1500);
    return;
  }

  const byDomain = new Map<string, Lamp[]>();
  for (const lamp of targeted) {
    const key = getLampDomain(lamp);
    byDomain.set(key, [...(byDomain.get(key) ?? []), lamp]);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const token = getToken();
    const requests = Array.from(byDomain.entries()).map(async ([domain, lamps]) => {
      const request = buildHaRequestForEntityIds(
        getBaseUrl(),
        useHaProxy,
        domain as "light" | "scene",
        lamps.map((x) => x.pathPrefix),
        cmd
      );
      const response = await fetch(request.url, {
        method: request.method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(request.body),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return lamps;
    });
    const groups = await Promise.all(requests);
    haReachability = "ok";
    updateHealthState();
    if (cmd.service === "turn_off" || cmd.service === "turn_on" || cmd.brightnessPct !== undefined) {
      for (const lamps of groups) {
        for (const lamp of lamps) {
          if (cmd.service === "turn_off") {
            state.lampStateCache[lamp.pathPrefix] = "OFF";
          } else {
            state.lampStateCache[lamp.pathPrefix] = "ON";
          }
        }
      }
      saveAppState();
      await renderHeaderStatus();
    }
    await showHeaderToast(`${cmd.label}: OK`, 1200);
    writeLog(`trigger[${source}] ${room.label} / ${cmd.label} -> OK (${targeted.length} entities)`);
    setStatus(`${room.label}: ${cmd.label} -> OK`);
  } catch (error) {
    const reason = toErrorText(error);
    const friendly = mapHaErrorToUserMessage(reason);
    haReachability = "bad";
    updateHealthState();
    await notifyUser(
      t("status.roomCommandFailed"),
      `${room.label}: ${cmd.label} (${reason})`,
      t("toast.errorPrefix", { text: friendly }),
      2000
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function goBackOneLevel(): Promise<void> {
  if (!hasRooms(state)) return;
  if (state.glassesMenuLevel === "commands") {
    const room = getSelectedRoom(state);
    if (!room) return;
    if (room.lamps.length <= 1) {
      state.glassesMenuLevel = "rooms";
      stopStateSync();
    } else {
      state.glassesMenuLevel = "lamps";
      startStateSync();
      await refreshVisibleLampStates(false);
    }
    await renderGlassesMenuUi();
    return;
  }
  if (state.glassesMenuLevel === "lamps") {
    stopStateSync();
    state.glassesMenuLevel = "rooms";
    await renderGlassesMenuUi();
  }
}

async function handleGlassesSelection(rawIndex: number, itemName: string): Promise<void> {
  if (rawIndex < 0 && !itemName) return;
  const normalizedItemName = itemName === "-" ? "" : itemName;
  const menuItems = getMenuItems();
  let idx = resolveMenuIndexFromEvent(rawIndex, normalizedItemName, menuItems);
  // Some runtimes emit 1-based indices without item names. In root level this can
  // mis-resolve the last room (e.g. "Scenes") as the trailing refresh action.
  if (
    state.glassesMenuLevel === "rooms" &&
    !normalizedItemName &&
    idx === menuItems.length - 1 &&
    rawIndex - 1 >= 0 &&
    rawIndex - 1 < state.rooms.length
  ) {
    idx = rawIndex - 1;
  }
  writeLog(`resolved menu index: raw=${rawIndex}, resolved=${idx}, level=${state.glassesMenuLevel}`);
  if (idx < 0) return;

  if (state.glassesMenuLevel === "rooms") {
    // The last root item is always the manual HA refresh action.
    if (idx === menuItems.length - 1) {
      writeLog(t("log.refreshFromMenu"));
      await loadRoomsFromHomeAssistantAction();
      state.glassesMenuLevel = "rooms";
      await renderGlassesMenuUi();
      return;
    }
    const room = state.rooms[idx];
    if (!room) return;
    state.selectedRoomId = room.id;
    state.selectedLampId = room.lamps[0]?.id ?? "";
    syncSelectors();
    saveAppState();
    if (room.lamps.length <= 1 && !isSceneRoom(room)) {
      state.glassesMenuLevel = "commands";
      suppressCommandSelectionUntilTs = Date.now() + 800;
      startStateSync();
      await refreshVisibleLampStates(false);
    } else {
      state.glassesMenuLevel = "lamps";
      startStateSync();
      await refreshVisibleLampStates(false);
    }
    await renderGlassesMenuUi();
    return;
  }

  if (state.glassesMenuLevel === "lamps") {
    const room = getSelectedRoom(state);
    if (!room) return;
    const roomCommands = getRoomCommands(room);
    if (idx < roomCommands.length) {
      const roomCmd = roomCommands[idx];
      if (!roomCmd) return;
      await executeRoomCommand(roomCmd, "glasses");
      return;
    }
    const lamp = room.lamps[idx - roomCommands.length];
    if (!lamp) return;
    state.selectedLampId = lamp.id;
    syncSelectors();
    saveAppState();
    state.glassesMenuLevel = "commands";
    suppressCommandSelectionUntilTs = Date.now() + 800;
    startStateSync();
    await refreshVisibleLampStates(false);
    await renderGlassesMenuUi();
    return;
  }

  if (Date.now() < suppressCommandSelectionUntilTs) {
    writeLog("ignored command selection during transition guard window");
    return;
  }
  const cmd = getEntityCommands(getSelectedLamp(state))[idx];
  if (!cmd) return;
  await executeSelectedCommand(cmd, "glasses");
}

function applyRooms(nextRooms: Room[], preferredSelection?: { roomId: string; lampId: string }): void {
  const supportedRooms = nextRooms
    .map((room) => ({
      ...room,
      lamps: room.lamps.filter((lamp) => getLampDomain(lamp) === "light" || getLampDomain(lamp) === "scene"),
    }))
    .filter((room) => room.lamps.length > 0);
  setRoomsState(state, supportedRooms);
  mergeInitialEntityStates(supportedRooms);
  if (preferredSelection) {
    applyPreferredSelection(preferredSelection.roomId, preferredSelection.lampId);
  }
  pruneLampCaches();
  syncSelectors();
  if (!hasRooms(state)) {
    stopStateSync();
  }
  saveAppState();
}

async function loadRoomsFromHomeAssistantAction(): Promise<void> {
  if (!hasBaseUrl()) {
    haReachability = "bad";
    updateHealthState();
    setEmptyHeaderStatus(t("toast.errorPrefix", { text: t("status.homeAssistantUrlMissing") }));
    await notifyUser(
      t("status.homeAssistantUrlMissing"),
      t("status.homeAssistantUrlMissing"),
      t("toast.errorPrefix", { text: t("status.homeAssistantUrlMissing") }),
      1600
    );
    return;
  }

  const token = getToken();
  if (!token) {
    haReachability = "bad";
    updateHealthState();
    setEmptyHeaderStatus(t("toast.errorPrefix", { text: t("status.homeAssistantTokenMissing") }));
    await notifyUser(
      t("status.homeAssistantTokenMissing"),
      t("status.homeAssistantTokenMissing"),
      t("toast.errorPrefix", { text: t("status.homeAssistantTokenMissing") }),
      1600
    );
    return;
  }

  try {
    localStorage.setItem(INCLUDE_SCENES_STORAGE_KEY, dom.includeScenesEl.checked ? "1" : "0");
    const importedRooms = await loadRoomsFromHomeAssistantApi(getBaseUrl(), token, useHaProxy, {
      includeScenes: dom.includeScenesEl.checked,
      scenesGroupLabel: t("menu.scenesGroup"),
    });
    applyRooms(importedRooms, { roomId: state.selectedRoomId, lampId: state.selectedLampId });
    haReachability = "ok";
    updateHealthState();
    const lampCount = importedRooms.reduce((sum, room) => sum + room.lamps.length, 0);
    writeLog(t("log.importedFromHa", { rooms: importedRooms.length, entities: lampCount }));
    if (lampCount === 0) {
      setEmptyHeaderStatus(t("header.rooms.noLamps"));
      await notifyUser(t("menu.noLampsInHa"), t("menu.noLampsInHa"), t("toast.noLampsFound"), 1600);
      return;
    }
    setEmptyHeaderStatus(t("header.rooms.none"));
    await showHeaderToast(t("status.roomsImported"), 1200);
    setStatus(t("status.roomsImported"));
  } catch (error) {
    const reason = toErrorText(error);
    const friendly = mapHaErrorToUserMessage(reason);
    haReachability = "bad";
    updateHealthState();
    setEmptyHeaderStatus(t("toast.errorPrefix", { text: friendly }));
    writeLog(`HA import failed: ${reason}`);
    setStatus(t("status.haLoadFailed"));
    await showHeaderToast(t("toast.errorPrefix", { text: friendly }), 2200);
  }
}

async function deployLampUi(): Promise<void> {
  await ensureBridge();
  stopStateSync();
  state.glassesUiCreated = false;
  state.glassesMenuLevel = "rooms";
  await renderGlassesMenuUi();
  if (!hasRooms(state)) {
    setEmptyHeaderStatus(t("header.rooms.none"));
    writeLog(t("log.noRoomsLoaded"));
    setStatus(t("status.noRoomsLoaded"));
    return;
  }
  writeLog(t("log.menuDeployed"));
  setStatus(t("status.lampMenuDeployed"));
}

async function shutdownPage(): Promise<void> {
  if (!window.confirm(t("prompt.shutdownConfirm"))) {
    return;
  }
  await shutdownPageFromGesture();
}

async function shutdownPageFromGesture(): Promise<void> {
  stopStateSync();
  const b = await ensureBridge();
  const ok = await b.shutDownPageContainer(0);
  writeLog(`shutDownPageContainer: ${ok ? "ok" : "failed"}`);
}

async function run(action: () => Promise<void>): Promise<void> {
  if (isBusy) return;
  setBusy(true);
  try {
    await action();
  } catch (error) {
    const reason = toErrorText(error);
    const friendly = mapHaErrorToUserMessage(reason);
    writeLog(`error: ${reason}`);
    setStatus(t("status.operationFailed"));
    await showHeaderToast(t("toast.errorPrefix", { text: friendly }), 1800);
  } finally {
    setBusy(false);
  }
}

dom.roomSelectEl.addEventListener("change", () => {
  state.selectedRoomId = dom.roomSelectEl.value;
  const room = getSelectedRoom(state);
  state.selectedLampId = room?.lamps[0]?.id ?? "";
  syncSelectors();
  saveAppState();
});

dom.lampSelectEl.addEventListener("change", () => {
  state.selectedLampId = dom.lampSelectEl.value;
  saveAppState();
});

dom.baseUrlInput.addEventListener("blur", () => {
  persistConfigDraft();
  updateHealthState();
});

dom.tokenInput.addEventListener("blur", () => {
  persistConfigDraft();
  updateHealthState();
});

dom.baseUrlInput.addEventListener("input", () => {
  updateHealthState();
});

dom.tokenInput.addEventListener("input", () => {
  updateHealthState();
});

dom.includeScenesEl.addEventListener("change", () => {
  localStorage.setItem(INCLUDE_SCENES_STORAGE_KEY, dom.includeScenesEl.checked ? "1" : "0");
});

dom.deployBtn.addEventListener("click", () => run(deployLampUi));
dom.shutdownBtn.addEventListener("click", () => run(shutdownPage));
dom.saveBaseBtn.addEventListener("click", () =>
  run(async () => {
    persistConfigDraft();
    writeLog(t("log.connectionPersisted", { baseUrl: getBaseUrl() || "-" }));
    await testHomeAssistantConnection();
  })
);
dom.loadHaBtn.addEventListener("click", () => run(loadRoomsFromHomeAssistantAction));
dom.loadHaEmptyBtn.addEventListener("click", () => run(loadRoomsFromHomeAssistantAction));

const restoredState = restoreAppState();
if (restoredState) {
  applyRooms(restoredState.rooms, { roomId: restoredState.selectedRoomId, lampId: restoredState.selectedLampId });
  writeLog(`Restored saved state: ${state.rooms.length} rooms`);
  setStatus(t("status.savedStateLoaded"));
} else {
  syncSelectors();
  setStatus(t("status.missingConfig"));
  writeLog(t("log.firstRun"));
}

writeLog(t("log.ready"));
// Warm bridge in background so URL/token from SDK storage are available without manual connect first.
void ensureBridgeSilent();
