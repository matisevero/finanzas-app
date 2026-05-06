'use client'
import { useAppStore } from '@/store/appStore'
import { MONEDAS_INFO } from '@/lib/utils/constants'

export default function TopBar() {
  const { añoActivo, setAñoActivo, monedaPrincipal, monedasAhorro, monedasCripto } = useAppStore()

  return (
    <header className="bg-white border-b border-slate-200 px-8 py-3 flex items-center justify-end gap-4 flex-shrink-0">

      {/* Monedas */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg px-3 py-1.5">
          <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Principal</span>
          <span className="text-slate-900 text-xs font-bold font-mono">
            {MONEDAS_INFO[monedaPrincipal].flag} {monedaPrincipal}
          </span>
        </div>
        {monedasAhorro.length > 0 && (
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5">
            <span className="text-emerald-600 text-[10px] font-bold uppercase tracking-wider">Ahorro</span>
            <span className="text-emerald-700 text-xs font-bold font-mono">{monedasAhorro.join(' · ')}</span>
          </div>
        )}
        {monedasCripto.length > 0 && (
          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
            <span className="text-amber-600 text-[10px] font-bold uppercase tracking-wider">Cripto</span>
            <span className="text-amber-700 text-xs font-bold font-mono">{monedasCripto.join(' · ')}</span>
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-slate-200" />

      {/* Selector de año */}
      <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-xl p-1">
        <button onClick={() => setAñoActivo(añoActivo - 1)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-sm transition-all text-sm border-none bg-transparent cursor-pointer">
          ‹
        </button>
        <span className="font-mono font-bold text-slate-900 text-sm min-w-[44px] text-center">{añoActivo}</span>
        <button onClick={() => setAñoActivo(añoActivo + 1)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-sm transition-all text-sm border-none bg-transparent cursor-pointer">
          ›
        </button>
      </div>
    </header>
  )
}
