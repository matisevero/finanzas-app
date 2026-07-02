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
  setMonedaPrincipal: (m: Moneda) => void
  setMonedasAhorro: (ms: Moneda[]) => void
  setMonedasCripto: (ms: Moneda[]) => void

  usuario: Usuario | null
  setUsuario: (u: Usuario | null) => void
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
      setMonedaPrincipal: (monedaPrincipal) => set({ monedaPrincipal }),
      setMonedasAhorro:   (monedasAhorro)   => set({ monedasAhorro }),
      setMonedasCripto:   (monedasCripto)   => set({ monedasCripto }),

      usuario: null,
      setUsuario: (usuario) => set({ usuario }),
    }),
    {
      name: 'finanzas-store',
      partialize: (s) => ({
        añoActivo: s.añoActivo,
        vistaTipo: s.vistaTipo,
        mesActivo: s.mesActivo,
        monedaPrincipal: s.monedaPrincipal,
        monedasAhorro: s.monedasAhorro,
        monedasCripto: s.monedasCripto,
      }),
    }
  )
)
