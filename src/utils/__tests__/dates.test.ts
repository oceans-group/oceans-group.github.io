import { describe, it, expect } from 'vitest'
import { localToday, monthLastDay } from '../dates'

describe('fechas sin depender de la zona horaria', () => {
  it('último día del mes', () => {
    expect(monthLastDay('2026-10')).toBe('2026-10-31')
    expect(monthLastDay('2026-02')).toBe('2026-02-28')
    expect(monthLastDay('2028-02')).toBe('2028-02-29')
    expect(monthLastDay('2026-12')).toBe('2026-12-31')
  })

  it('hoy es la fecha del reloj del equipo, no la de UTC', () => {
    // 15/10 a las 21:00 en el equipo: en UTC (Perú, −5) ya sería 16/10
    expect(localToday(new Date(2026, 9, 15, 21, 0))).toBe('2026-10-15')
    expect(localToday(new Date(2026, 9, 15, 0, 30))).toBe('2026-10-15')
  })
})
