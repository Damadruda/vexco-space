// =============================================================================
// MIP — Scheduler helpers
// Parser cron minimalista (subset "M H * * D") + cooldown anti-doble-disparo.
// =============================================================================

/**
 * Determina si un schedule cron está "due" para disparar dentro de una ventana.
 *
 * Soporta solo el formato "M H * * D" donde:
 *   M = minuto (0-59)
 *   H = hora UTC (0-23)
 *   D = día de la semana UTC (0=domingo, 1=lunes, ..., 6=sábado), o "*"
 *
 * @param schedule expresión cron (ej: "0 5 * * 1")
 * @param now momento actual (UTC)
 * @param windowMinutes ventana de tolerancia tras la hora de disparo (default 10)
 */
export function isScheduleDue(
  schedule: string,
  now: Date,
  windowMinutes = 10
): boolean {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minStr, hourStr, , , dowStr] = parts;
  const targetMin = parseInt(minStr, 10);
  const targetHour = parseInt(hourStr, 10);
  const targetDow = dowStr === "*" ? null : parseInt(dowStr, 10);
  if (Number.isNaN(targetMin) || Number.isNaN(targetHour)) return false;

  const nowMin = now.getUTCMinutes();
  const nowHour = now.getUTCHours();
  const nowDow = now.getUTCDay();

  if (targetDow !== null && nowDow !== targetDow) return false;

  const nowTotal = nowHour * 60 + nowMin;
  const targetTotal = targetHour * 60 + targetMin;
  const diff = nowTotal - targetTotal;
  return diff >= 0 && diff < windowMinutes;
}

/**
 * Protección contra doble-ejecución: rechaza disparo si el template se ejecutó
 * hace menos de `minCooldownMinutes`.
 */
export function isCoolingDown(
  lastRunAt: Date | null,
  now: Date,
  minCooldownMinutes = 30
): boolean {
  if (!lastRunAt) return false;
  const diffMin = (now.getTime() - lastRunAt.getTime()) / 60000;
  return diffMin < minCooldownMinutes;
}
