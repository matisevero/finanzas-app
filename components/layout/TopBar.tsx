'use client'
import { usePathname } from 'next/navigation'
import { useAppStore } from '@/store/appStore'
import { usePageHeader } from '@/context/PageHeaderContext'
import { useMobileMenu } from '@/context/MobileMenuContext'
import { MESES } from '@/lib/utils/constants'

const RUTAS_CON_PERIODO = ['/dashboard', '/dashboard/ingresos', '/dashboard/egresos', '/dashboard/tarjetas', '/dashboard/salud']

export default function TopBar() {
  const {
    añoActivo, setAñoActivo,
    vistaTipo, setVistaTipo,
    mesActivo, mesAnterior, mesSiguiente,
  } = useAppStore()
  const { title, subtitle, action } = usePageHeader()
  const { toggle } = useMobileMenu()
  const pathname = usePathname()
  const mostrarPeriodo = RUTAS_CON_PERIODO.includes(pathname)

  return (
    <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-3 flex items-center gap-3 md:gap-4 flex-wrap flex-shrink-0 min-h-[56px]">
      <button
        onClick={toggle}
        aria-label="Abrir menú"
        className="md:hidden w-8 h-8 flex-shrink-0 flex flex-col items-center justify-center gap-[3px] border-none bg-transparent cursor-pointer">
        <span className="block w-5 h-[2px] bg-slate-600" />
        <span className="block w-5 h-[2px] bg-slate-600" />
        <span className="block w-5 h-[2px] bg-slate-600" />
      </button>

      <div className="flex-1 min-w-0">
        {title && (
          <div className="flex items-baseline gap-3">
            <h1 className="page-title text-lg md:text-xl leading-tight truncate">{title}</h1>
            {subtitle && <span className="text-slate-400 text-xs hidden lg:block truncate">{subtitle}</span>}
          </div>
        )}
      </div>

      {action && <div className="flex-shrink-0">{action}</div>}

      {mostrarPeriodo && <>
        <div className="w-full order-3 md:order-none md:w-auto flex items-center gap-3 md:gap-4">
        <div className="w-px h-5 bg-slate-200 flex-shrink-0 hidden md:block" />

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
        </div>
      </>}
    </header>
  )
}
