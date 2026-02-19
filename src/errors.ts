import { t } from "./i18n";

export function toErrorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

export function mapHaErrorToUserMessage(raw: string): string {
  const text = raw.toLowerCase();
  if (text.includes("401")) return t("error.tokenInvalid");
  if (text.includes("403")) return t("error.noPermission");
  if (text.includes("404")) return t("error.apiNotFound");
  if (text.includes("abort") || text.includes("timeout")) return t("error.timeout");
  if (text.includes("failed to fetch") || text.includes("networkerror") || text.includes("econn") || text.includes("enotfound")) {
    return t("error.unreachable");
  }
  return t("error.generic");
}
