'use client'
import { useAppStore } from '@/store/appStore'
import { usePageHeader } from '@/context/PageHeaderContext'
import { MESES } from '@/lib/utils/constants'

export default function TopBar() {
  const {
    añoActivo, setAñoActivo,
    vistaTipo, setVistaTipo,
    mesActivo, mesAnterior, mesSiguiente,
  } = useAppStore()
  const { title, subtitle, action } = usePageHeader()

  return (
    <header className="bg-white border-b border-slate-200 px-8 py-3 flex items-center gap-4 flex-shrink-0 min-h-[56px]">
      <div className="flex-1 min-w-0">
        {title && (
          <div className="flex items-baseline gap-3">
            <h1 className="page-title text-xl leading-tight truncate">{title}</h1>
            {subtitle && <span className="text-slate-400 text-xs hidden lg:block truncate">{subtitle}</span>}
          </div>
        )}
      </div>

      {action && <div className="flex-shrink-0">{action}</div>}

      <div className="w-px h-5 bg-slate-200 flex-shrink-0" />

      <div className="flex items-center gap-0.5 bg-slate-100 border border-slate-200 rounded-xl p-1 flex-shrink-0">
        <button onClick={() => setVistaTipo('anual')}
          className={`px-2.5 h-6 rounded-lg text-xs font-medium border-none cursor-pointer transition-all ${vistaTipo === 'anual' ? 'bg-white text-slate-900 shadow-sm' : 'bg-transparent text-slate-500'}`}>Año</button>
        <button onClick={() => setVistaTipo('mensual')}
          className={`px-2.5 h-6 rounded-lg text-xs font-medium border-none cursor-pointer transition-all ${vistaTipo === 'mensual' ? 'bg-white text-slate-900 shadow-sm' : 'bg-transparent text-slate-500'}`}>Mes</button>
      </div>

      {vistaTipo === 'anual' ? (
        <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-xl p-1 flex-shrink-0">
          <button onClick={() => setAñoActivo(añoActivo - 1)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-sm transition-all text-sm border-none bg-transparent cursor-pointer">‹</button>
          <span className="font-mono font-bold text-slate-900 text-sm min-w-[44px] text-center">{añoActivo}</span>
          <button onClick={() => setAñoActivo(añoActivo + 1)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-sm transition-all text-sm border-none bg-transparent cursor-pointer">›</button>
        </div>
      ) : (
        <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-xl p-1 flex-shrink-0">
          <button onClick={mesAnterior}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-sm transition-all text-sm border-none bg-transparent cursor-pointer">‹</button>
          <span className="font-mono font-bold text-slate-900 text-sm min-w-[96px] text-center">{MESES[mesActivo - 1]} {añoActivo}</span>
          <button onClick={mesSiguiente}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-sm transition-all text-sm border-none bg-transparent cursor-pointer">›</button>
        </div>
      )}
    </header>
  )
}
