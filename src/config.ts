export const DEFAULT_BASE_URL = "";
export const DEFAULT_HA_TOKEN = "";

// Optional local defaults via Vite env. Keep empty in committed code.
export const BOOTSTRAP_BASE_URL = (import.meta.env.VITE_HA_BASE_URL ?? "").trim();
export const BOOTSTRAP_HA_TOKEN = (import.meta.env.VITE_HA_TOKEN ?? "").trim();

export const BASE_URL_STORAGE_KEY = "lamp_base_url";
export const HA_TOKEN_SESSION_STORAGE_KEY = "ha_token_session";
export const HA_TOKEN_STORAGE_KEY = "ha_token";
export const APP_STATE_STORAGE_KEY = "lamp_app_state_v1";
export const INCLUDE_SCENES_STORAGE_KEY = "ha_include_scenes";

export function saveConfigToBrowserStorage(baseUrl: string, token: string): void {
  localStorage.setItem(BASE_URL_STORAGE_KEY, baseUrl);
  sessionStorage.setItem(HA_TOKEN_SESSION_STORAGE_KEY, token);
  localStorage.setItem(HA_TOKEN_STORAGE_KEY, token);
}

