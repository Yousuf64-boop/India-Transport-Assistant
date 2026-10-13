const KEY = 'transport-assistant-session';

/** Anonymous per-tab session id used only to group queries in analytics. */
export function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem(KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
