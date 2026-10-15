const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Fecha de hoy según el reloj del equipo (YYYY-MM-DD). No usar toISOString(): da la fecha en UTC
 * y en Perú, desde las 19:00, ya es "mañana".
 */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Último día de un mes "YYYY-MM", igual en cualquier zona horaria */
export function monthLastDay(monthKey: string): string {
  const y = Number(monthKey.slice(0, 4)), m = Number(monthKey.slice(5, 7))
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}
