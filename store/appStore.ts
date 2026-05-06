'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Moneda, Usuario } from '@/types'

interface AppState {
  añoActivo: number
  setAñoActivo: (año: number) => void

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
        monedaPrincipal: s.monedaPrincipal,
        monedasAhorro: s.monedasAhorro,
        monedasCripto: s.monedasCripto,
      }),
    }
  )
)
