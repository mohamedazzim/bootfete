/**
 * Phase 4: disambiguate events that share a name in committee selection UI.
 * Appends the event's start date so "Code Clash" becomes
 * "Code Clash (2026-10-12)". Events with no scheduled date fall back to
 * "Not scheduled" (the same null-date convention used across dashboards).
 */
export function formatEventOptionLabel(event: {
  name: string;
  startDate?: string | Date | null;
}): string {
  if (!event.startDate) return `${event.name} (Not scheduled)`;
  const d = event.startDate instanceof Date ? event.startDate : new Date(event.startDate);
  if (Number.isNaN(d.getTime())) return `${event.name} (Not scheduled)`;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${event.name} (${yyyy}-${mm}-${dd})`;
}
