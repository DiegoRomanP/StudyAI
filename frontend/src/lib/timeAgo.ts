const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "hace N min" below an hour, "hace N horas" below a day, "hace N días" below 30 days,
 * and "hace más de 30 días" from then on. Units are floored; a future date reads as now.
 */
export function formatTimeAgo(date: Date, now: Date = new Date()): string {
  const elapsed = Math.max(0, now.getTime() - date.getTime());
  if (elapsed < HOUR) return `hace ${Math.floor(elapsed / MINUTE)} min`;
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `hace ${hours} ${hours === 1 ? "hora" : "horas"}`;
  }
  const days = Math.floor(elapsed / DAY);
  if (days < 30) return `hace ${days} ${days === 1 ? "día" : "días"}`;
  return "hace más de 30 días";
}
