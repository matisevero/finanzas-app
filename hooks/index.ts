'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/store/appStore'
import * as Q from '@/lib/queries'

// ─── Generic async hook ───────────────────────────────────────────────────────
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData]       = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const run = useCallback(async () => {
    setLoading(true); setError(null)
    try { setData(await fn()) }
    catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => { run() }, [run])
  return { data, loading, error, refetch: run }
}

// ─── Year ─────────────────────────────────────────────────────────────────────
export function useYear() {
  const { añoActivo, setAñoActivo } = useAppStore()
  return { year: añoActivo, prev: () => setAñoActivo(añoActivo - 1), next: () => setAñoActivo(añoActivo + 1) }
}

// ─── Domain hooks ─────────────────────────────────────────────────────────────
export function useIngresos()  { const y = useAppStore(s => s.añoActivo); return useAsync(() => Q.getIngresosByAño(y), [y]) }
export function useEgresos()   { const y = useAppStore(s => s.añoActivo); return useAsync(() => Q.getEgresosByAño(y), [y]) }
export function useDeudas()    { return useAsync(() => Q.getDeudas(), []) }
export function useTarjetas()  { return useAsync(() => Q.getTarjetas(), []) }
export function useMetas()     { return useAsync(() => Q.getMetas(), []) }
export function usePrecioItems() { return useAsync(() => Q.getPrecioItems(), []) }
export function useCategoriasCustom(modulo: string) { return useAsync(() => Q.getCategoriasCustom(modulo), [modulo]) }

export function useEventosMes(año: number, mes: number) {
  return useAsync(() => Q.getEventosByMes(año, mes), [año, mes])
}

export function useSaldoInicial(año: number, mes: number) {
  return useAsync(() => Q.getSaldoInicial(año, mes), [año, mes])
}

export function useTarjetaTransacciones(tarjetaId?: string) {
  return useAsync(() => Q.getTarjetaTransacciones(tarjetaId), [tarjetaId])
}

export function usePagosTarjeta(tarjetaId?: string) {
  return useAsync(() => Q.getPagosTarjeta(tarjetaId), [tarjetaId])
}
