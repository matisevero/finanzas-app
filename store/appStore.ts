'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Moneda, Usuario } from '@/types'

export type VistaTipo = 'anual' | 'mensual'

interface AppState {
  añoActivo: number
  setAñoActivo: (año: number) => void

  vistaTipo: VistaTipo
  setVistaTipo: (v: VistaTipo) => void

  mesActivo: number
  setMesActivo: (mes: number) => void
  mesAnterior: () => void
  mesSiguiente: () => void

  monedaPrincipal: Moneda
  monedasAhorro: Moneda[]
  monedasCripto: Moneda[]
  monedasPalette: Moneda[]
  setMonedaPrincipal: (m: Moneda) => void
  setMonedasAhorro: (ms: Moneda[]) => void
  setMonedasCripto: (ms: Moneda[]) => void
  setMonedasPalette: (ms: Moneda[]) => void

  usuario: Usuario | null
  setUsuario: (u: Usuario | null) => void

  // Vista de tabla vs. tarjetas en desktop, para Ingresos/Egresos (mobile siempre usa tarjetas).
  vistaTablaTarjetas: 'tabla' | 'tarjetas'
  setVistaTablaTarjetas: (v: 'tabla' | 'tarjetas') => void

  // Ocultar montos en toda la app (ojito). Persistente entre sesiones.
  saldosOcultos: boolean
  toggleSaldosOcultos: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      añoActivo:       new Date().getFullYear(),
      setAñoActivo:    (añoActivo) => set({ añoActivo }),

      vistaTipo:       'anual',
      setVistaTipo:    (vistaTipo) => set({ vistaTipo }),

      mesActivo:       new Date().getMonth() + 1,
      setMesActivo:    (mesActivo) => set({ mesActivo }),
      mesAnterior: () => set((s) => s.mesActivo === 1
        ? { mesActivo: 12, añoActivo: s.añoActivo - 1 }
        : { mesActivo: s.mesActivo - 1 }),
      mesSiguiente: () => set((s) => s.mesActivo === 12
        ? { mesActivo: 1, añoActivo: s.añoActivo + 1 }
        : { mesActivo: s.mesActivo + 1 }),

      monedaPrincipal: 'ARS',
      monedasAhorro:   ['USD', 'EUR'],
      monedasCripto:   ['BTC', 'ETH'],
      monedasPalette:  ['ARS', 'USD', 'EUR', 'BTC', 'ETH'],
      setMonedaPrincipal: (monedaPrincipal) => set({ monedaPrincipal }),
      setMonedasAhorro:   (monedasAhorro)   => set({ monedasAhorro }),
      setMonedasCripto:   (monedasCripto)   => set({ monedasCripto }),
      setMonedasPalette:  (monedasPalette)  => set({ monedasPalette }),

      usuario: null,
      setUsuario: (usuario) => set({ usuario }),

      vistaTablaTarjetas: 'tabla',
      setVistaTablaTarjetas: (vistaTablaTarjetas) => set({ vistaTablaTarjetas }),

      saldosOcultos: false,
      toggleSaldosOcultos: () => set((s) => ({ saldosOcultos: !s.saldosOcultos })),
    }),
    {
      name: 'finanzas-store',
      partialize: (s) => ({
        // añoActivo, mesActivo y vistaTipo NO se persisten a propósito:
        // cada vez que se abre la app tiene que arrancar en el mes actual.
        monedaPrincipal: s.monedaPrincipal,
        monedasAhorro: s.monedasAhorro,
        monedasCripto: s.monedasCripto,
        monedasPalette: s.monedasPalette,
        vistaTablaTarjetas: s.vistaTablaTarjetas,
        saldosOcultos: s.saldosOcultos,
      }),
    }
  )
)

/** Todas las monedas configuradas (Principal + Ahorro + Cripto + Sin asignar), sin duplicados.
 *  Usar esto en los selects de moneda de transacciones — `monedasPalette` sola es solo
 *  la zona "Sin asignar" y no incluye la moneda Principal ni las de Ahorro/Cripto. */
export function useMonedasDisponibles(): Moneda[] {
  const monedaPrincipal = useAppStore(s => s.monedaPrincipal)
  const monedasAhorro   = useAppStore(s => s.monedasAhorro)
  const monedasCripto   = useAppStore(s => s.monedasCripto)
  const monedasPalette  = useAppStore(s => s.monedasPalette)
  return Array.from(new Set([monedaPrincipal, ...monedasAhorro, ...monedasCripto, ...monedasPalette]))
}

