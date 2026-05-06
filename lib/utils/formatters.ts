import type { Moneda } from '@/types'

export function fmt(n: number, moneda: Moneda = 'ARS'): string {
  if (moneda === 'BTC') return `₿${n.toFixed(6)}`
  if (moneda === 'ETH') return `Ξ${n.toFixed(4)}`
  const sym = moneda === 'USD' ? 'US$' : moneda === 'EUR' ? '€' : '$'
  if (Math.abs(n) >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000)    return `${sym}${Math.round(n / 1000)}k`
  return `${sym}${Math.round(n)}`
}

export function fmtFull(n: number, moneda: Moneda = 'ARS'): string {
  if (moneda === 'BTC') return `₿${n.toFixed(6)}`
  if (moneda === 'ETH') return `Ξ${n.toFixed(4)}`
  const locale = moneda === 'USD' ? 'en-US' : moneda === 'EUR' ? 'de-DE' : 'es-AR'
  const currency = moneda === 'USDT' ? 'USD' : moneda
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency,
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)
}

export function fmtPct(n: number, decimals = 1): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`
}

export function fmtDate(dateStr: string, format: 'short' | 'long' | 'month' = 'short'): string {
  const d = new Date(dateStr + 'T00:00:00')
  if (format === 'month') return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  if (format === 'long')  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function varPct(prev: number, curr: number): number | null {
  if (!prev || prev === 0) return null
  return ((curr - prev) / prev) * 100
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
