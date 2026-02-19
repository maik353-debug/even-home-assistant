export function toErrorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

export function mapHaErrorToUserMessage(raw: string): string {
  const text = raw.toLowerCase();
  if (text.includes("401")) return "Token ungueltig";
  if (text.includes("403")) return "Keine Berechtigung";
  if (text.includes("404")) return "HA API nicht gefunden";
  if (text.includes("abort") || text.includes("timeout")) return "Zeitueberschreitung zu Home Assistant";
  if (text.includes("failed to fetch") || text.includes("networkerror") || text.includes("econn") || text.includes("enotfound")) {
    return "Home Assistant nicht erreichbar";
  }
  return "Home Assistant Fehler";
}

