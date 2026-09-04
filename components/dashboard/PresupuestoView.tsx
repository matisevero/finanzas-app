'use client'
import { useState, useMemo } from 'react'
import { fmt } from '@/lib/utils/formatters'
import type { SaludCategoriaResultado } from '@/lib/utils/calculations'

const fmtM = (n: number) => {
  if (Math.abs(n) >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1000) return '$' + Math.round(n / 1000) + 'k'
  return '$' + Math.round(n)
}

// Card colapsable de una categoría — cerrada muestra % del total + $ objetivo
// (como las filas de grupo del widget de Gemini); abierta suma el detalle real
// vs objetivo y el slider para ajustar. El color del punto es el mismo `color`
// que ya tiene la categoría en Score, para que se pueda relacionar con la barra
// segmentada de arriba.
function CategoriaCard({
  cat, ingresoMensual, moneda, onUmbralChange,
}: {
  cat: SaludCategoriaResultado
  ingresoMensual: number
  moneda: string
  onUmbralChange: (id: string, nuevo: number) => void
}) {
  const [abierta, setAbierta] = useState(false)
  const [umbralLocal, setUmbralLocal] = useState(cat.umbral)
  const [editando, setEditando] = useState(false)
  const [montoEditado, setMontoEditado] = useState('')
  const objetivo$ = Math.round(ingresoMensual * (umbralLocal / 100))
  const progreso = objetivo$ > 0 ? Math.min(100, Math.round((cat.montoActual / objetivo$) * 100)) : 0
  const pasado = cat.montoActual > objetivo$
  const barColor = pasado ? '#D85A30' : '#40B046'

  const empezarEdicion = () => { setMontoEditado(String(objetivo$)); setEditando(true) }
  const confirmarEdicion = () => {
    const monto = parseFloat(montoEditado.replace(/[^\d.-]/g, ''))
    if (!isNaN(monto) && ingresoMensual > 0) {
      const nuevoUmbral = Math.max(0, Math.min(100, (monto / ingresoMensual) * 100))
      setUmbralLocal(nuevoUmbral)
      onUmbralChange(cat.id, nuevoUmbral)
    }
    setEditando(false)
  }

  return (
    <div className="bg-white border rounded-xl overflow-hidden" style={{ borderColor: abierta ? cat.color : '#E2E8F0' }}>
      <button onClick={() => setAbierta(a => !a)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 border-none bg-transparent cursor-pointer text-left">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />
          <span className="text-sm font-medium text-slate-900 truncate">{cat.icono} {cat.nombre}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs font-mono text-slate-400">{umbralLocal.toFixed(0)}% del ingreso</span>
          {editando ? (
            <input autoFocus value={montoEditado} onChange={e => setMontoEditado(e.target.value)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => { if (e.key === 'Enter') confirmarEdicion(); if (e.key === 'Escape') setEditando(false) }}
              onBlur={confirmarEdicion}
              className="input-field !py-1 !px-2 text-sm font-mono font-semibold w-28 text-right" />
          ) : (
            <span onClick={e => { e.stopPropagation(); empezarEdicion() }}
              className="text-sm font-mono font-semibold text-slate-700 hover:underline cursor-text" title="Click para escribir el objetivo exacto">
              {fmtM(objetivo$)}
            </span>
          )}
          <span className="text-slate-400 text-xs">{abierta ? '▲' : '▼'}</span>
        </div>
      </button>
      {abierta && (
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-slate-400">Gastado real este mes</span>
            <span className="text-[11px] font-mono" style={{ color: barColor }}>{fmtM(cat.montoActual)} de {fmtM(objetivo$)}</span>
          </div>
          <div className="bg-slate-100 rounded h-1.5 overflow-hidden mb-3">
            <div className="h-full transition-all" style={{ background: barColor, width: `${progreso}%` }} />
          </div>
          <div className="flex items-center gap-2">
            <input type="range" min={0} max={100} step={1} value={umbralLocal}
              onChange={e => setUmbralLocal(parseFloat(e.target.value))}
              onMouseUp={() => onUmbralChange(cat.id, umbralLocal)}
              onTouchEnd={() => onUmbralChange(cat.id, umbralLocal)}
              className="w-full" />
          </div>
          <div className="text-[10px] text-slate-300 mt-1">Arrastrá para ajustar rápido, o hacé click en el monto de arriba para escribir uno exacto.</div>
        </div>
      )}
    </div>
  )
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
      <p className="text-slate-400 text-xs mb-3">
        Cada tarjeta es un objetivo de gasto mensual, en % de tu ingreso. El monto de la derecha es ese objetivo en pesos —
        hacé click para escribirlo exacto, o abrí la tarjeta y arrastrá el slider. La barra verde/roja de adentro es lo que
        ya gastaste real este mes en esa categoría, comparado contra el objetivo.
      </p>

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

      {/* Aviso si los objetivos ya superan el ingreso — antes esto solo se veía en el
          Margen proyectado en rojo, sin explicar por qué */}
      {objetivosAsignados > ingresoMensual && ingresoMensual > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mb-4 text-xs text-red-600">
          ⚠ Entre todos los objetivos suman {fmt(objetivosAsignados, moneda)}, más que tu ingreso del mes ({fmt(ingresoMensual, moneda)}). Bajá alguno para que cierre.
        </div>
      )}

      {/* Barra segmentada — proporción de cada categoría dentro de los objetivos asignados */}
      {conObjetivoMensual.length > 0 && (
        <div className="flex h-2.5 rounded-full overflow-hidden mb-5">
          {conObjetivoMensual.map(cat => {
            const obj = ingresoMensual * (cat.umbral / 100)
            const pct = objetivosAsignados > 0 ? (obj / objetivosAsignados) * 100 : 0
            return <div key={cat.id} style={{ background: cat.color, width: `${pct}%` }} title={`${cat.nombre}: ${cat.umbral.toFixed(0)}% del ingreso`} />
          })}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {conObjetivoMensual.map(cat => (
          <CategoriaCard key={cat.id} cat={cat} ingresoMensual={ingresoMensual} moneda={moneda} onUmbralChange={onUmbralChange} />
        ))}
      </div>

      {enMeses.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-300 px-1">Objetivos de ahorro (no son gasto mensual)</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {enMeses.map(cat => (
              <div key={cat.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-900">{cat.icono} {cat.nombre}</span>
                <span className="text-[11px] font-mono text-slate-500">{cat.valorActual} — objetivo {cat.valorIdeal}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {categorias.length === 0 && (
        <div className="text-slate-400 text-sm px-1">No hay categorías configuradas todavía — armalas desde "Configurar" en Score.</div>
      )}
    </div>
  )
}
