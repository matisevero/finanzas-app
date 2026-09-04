'use client'
import { useState, useMemo } from 'react'
import { fmt } from '@/lib/utils/formatters'
import type { SaludCategoriaResultado } from '@/lib/utils/calculations'

const fmtM = (n: number) => {
  if (Math.abs(n) >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1000) return '$' + Math.round(n / 1000) + 'k'
  return '$' + Math.round(n)
}

export default function PresupuestoView({
  categorias, ingresoMensual, moneda, onUmbralChange,
}: {
  categorias: SaludCategoriaResultado[]
  ingresoMensual: number
  moneda: string
  onUmbralChange: (id: string, nuevo: number) => void
}) {
  // El slider mueve el % del ingreso (umbral) — categorías en "meses" (Ahorro real,
  // Fondo emergencia) no son un gasto mensual, así que se muestran aparte, sin
  // slider ni participación en el margen (mezclar unidades ahí rompería la cuenta).
  const conObjetivoMensual = categorias.filter(c => c.unidad === '%')
  const enMeses = categorias.filter(c => c.unidad === 'meses')

  const objetivosAsignados = useMemo(() =>
    conObjetivoMensual.reduce((s, c) => s + ingresoMensual * (c.umbral / 100), 0)
  , [conObjetivoMensual, ingresoMensual])
  const margenProyectado = ingresoMensual - objetivosAsignados

  return (
    <div>
      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 mb-4 flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="text-[11px] text-slate-400">Ingreso del mes</div>
          <div className="text-base font-bold font-mono text-slate-900">{fmt(ingresoMensual, moneda)}</div>
        </div>
        <div className="w-px h-8 bg-slate-100" />
        <div>
          <div className="text-[11px] text-slate-400">Objetivos asignados</div>
          <div className="text-base font-bold font-mono text-slate-900">{fmt(objetivosAsignados, moneda)}</div>
        </div>
        <div className="w-px h-8 bg-slate-100" />
        <div className="text-right">
          <div className="text-[11px] text-slate-400">Margen proyectado</div>
          <div className={`text-xl font-bold font-mono ${margenProyectado >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{fmt(margenProyectado, moneda)}</div>
        </div>
      </div>

      <div className="flex flex-col gap-2 mb-4">
        {conObjetivoMensual.map(cat => (
          <CategoriaSlider key={cat.id} cat={cat} ingresoMensual={ingresoMensual} moneda={moneda} onUmbralChange={onUmbralChange} />
        ))}
      </div>

      {enMeses.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-300 px-1">Objetivos de ahorro (no son gasto mensual)</div>
          {enMeses.map(cat => (
            <div key={cat.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">{cat.icono} {cat.nombre}</span>
              <span className="text-[11px] font-mono text-slate-500">{cat.valorActual} — objetivo {cat.valorIdeal}</span>
            </div>
          ))}
        </div>
      )}

      {categorias.length === 0 && (
        <div className="text-slate-400 text-sm px-1">No hay categorías configuradas todavía — armalas desde "Configurar" en Score.</div>
      )}

      <div className="text-[11px] text-slate-300 mt-3 px-1">
        Cada slider mueve el objetivo (el mismo umbral que usa el Score) — la barra siempre muestra lo real gastado este mes contra esa meta.
      </div>
    </div>
  )
}

// Card de una categoría con objetivo en % del ingreso: barra = gasto real vs
// objetivo, slider = ajusta el umbral (persiste en Score al soltar).
function CategoriaSlider({
  cat, ingresoMensual, moneda, onUmbralChange,
}: { cat: SaludCategoriaResultado; ingresoMensual: number; moneda: string; onUmbralChange: (id: string, nuevo: number) => void }) {
  const [umbralLocal, setUmbralLocal] = useState(cat.umbral)
  const objetivo$ = ingresoMensual * (umbralLocal / 100)
  const progreso = objetivo$ > 0 ? Math.min(100, Math.round((cat.montoActual / objetivo$) * 100)) : 0
  const pasado = cat.montoActual > objetivo$
  const barColor = pasado ? '#D85A30' : '#40B046'

  return (
    <div className="bg-white border rounded-xl px-4 py-3" style={{ borderColor: pasado ? '#FECACA' : '#E2E8F0' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-semibold text-slate-900">{cat.icono} {cat.nombre}</span>
        <span className="text-[11px] font-mono" style={{ color: barColor }}>{fmtM(cat.montoActual)} de {fmtM(objetivo$)}</span>
      </div>
      <div className="bg-slate-100 rounded h-1.5 overflow-hidden mb-2">
        <div className="h-full transition-all" style={{ background: barColor, width: `${progreso}%` }} />
      </div>
      <input type="range" min={0} max={100} step={1} value={umbralLocal}
        onChange={e => setUmbralLocal(parseFloat(e.target.value))}
        onMouseUp={() => onUmbralChange(cat.id, umbralLocal)}
        onTouchEnd={() => onUmbralChange(cat.id, umbralLocal)}
        className="w-full" />
    </div>
  )
}
