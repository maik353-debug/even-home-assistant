type OnStateChanged = (entityId: string, normalizedState: string) => void;
type OnFallbackPoll = () => void | Promise<void>;
type OnLog = (message: string) => void;

type HaStateSyncOptions = {
  getBaseUrl: () => string;
  getToken: () => string;
  getEntityIds: () => Set<string>;
  onStateChanged: OnStateChanged;
  onFallbackPoll: OnFallbackPoll;
  onLog: OnLog;
};

export function createHaStateSync(options: HaStateSyncOptions) {
  let ws: WebSocket | null = null;
  let wsConnected = false;
  let wsManualClose = false;
  let wsReconnectTimer: number | null = null;
  let wsReconnectDelayMs = 1000;
  let fallbackPoller: number | null = null;

  function getHaWsUrl(): string | null {
    try {
      const u = new URL(options.getBaseUrl());
      const wsProtocol = u.protocol === "https:" ? "wss:" : "ws:";
      return `${wsProtocol}//${u.host}/api/websocket`;
    } catch {
      return null;
    }
  }

  function startFallbackPolling(): void {
    if (fallbackPoller !== null) return;
    fallbackPoller = window.setInterval(() => {
      void options.onFallbackPoll();
    }, 45000);
  }

  function stopFallbackPolling(): void {
    if (fallbackPoller !== null) {
      window.clearInterval(fallbackPoller);
      fallbackPoller = null;
    }
  }

  function clearWsReconnectTimer(): void {
    if (wsReconnectTimer !== null) {
      window.clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
  }

  function scheduleWsReconnect(): void {
    if (wsReconnectTimer !== null) return;
    wsReconnectTimer = window.setTimeout(() => {
      wsReconnectTimer = null;
      connect();
    }, wsReconnectDelayMs);
    wsReconnectDelayMs = Math.min(wsReconnectDelayMs * 2, 30000);
  }

  function handleWsStateChanged(event: any): void {
    const data = event?.data;
    const entityId = typeof data?.entity_id === "string" ? data.entity_id : data?.new_state?.entity_id;
    const rawState = data?.new_state?.state;
    if (typeof entityId !== "string") return;
    if (!options.getEntityIds().has(entityId)) return;
    if (typeof rawState !== "string") return;

    const lowered = rawState.toLowerCase();
    const normalized = lowered === "on" ? "ON" : lowered === "off" ? "OFF" : rawState.toUpperCase();
    options.onStateChanged(entityId, normalized);
  }

  function connect(): void {
    const token = options.getToken();
    const wsUrl = getHaWsUrl();
    if (!token || !wsUrl) return;
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;

    try {
      wsManualClose = false;
      ws = new WebSocket(wsUrl);
    } catch (error) {
      options.onLog(`HA websocket connect error: ${String(error)}`);
      startFallbackPolling();
      scheduleWsReconnect();
      return;
    }

    ws.onmessage = (message) => {
      let payload: any;
      try {
        payload = JSON.parse(String(message.data));
      } catch {
        return;
      }

      if (payload?.type === "auth_required") {
        ws?.send(JSON.stringify({ type: "auth", access_token: token }));
        return;
      }
      if (payload?.type === "auth_ok") {
        wsConnected = true;
        wsReconnectDelayMs = 1000;
        clearWsReconnectTimer();
        stopFallbackPolling();
        ws?.send(JSON.stringify({ id: 1, type: "subscribe_events", event_type: "state_changed" }));
        options.onLog("HA websocket connected");
        return;
      }
      if (payload?.type === "auth_invalid") {
        options.onLog("HA websocket auth invalid");
        wsConnected = false;
        startFallbackPolling();
        return;
      }
      if (payload?.type === "event" && payload?.event?.event_type === "state_changed") {
        handleWsStateChanged(payload.event);
      }
    };

    ws.onclose = () => {
      const manual = wsManualClose;
      wsManualClose = false;
      if (wsConnected) options.onLog("HA websocket disconnected");
      wsConnected = false;
      ws = null;
      if (manual) return;
      startFallbackPolling();
      scheduleWsReconnect();
    };

    ws.onerror = () => {
      wsConnected = false;
      startFallbackPolling();
    };
  }

  function start(): void {
    connect();
    if (!wsConnected) {
      startFallbackPolling();
    }
  }

  function stop(): void {
    stopFallbackPolling();
    clearWsReconnectTimer();
    if (ws) {
      wsManualClose = true;
      ws.close();
      ws = null;
    }
    wsConnected = false;
  }

  return { start, stop };
}
