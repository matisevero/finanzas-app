'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  useAllIngresos, useAllEgresos, useTarjetaTransacciones, useCalidadHallazgosPendientes,
  useEtiquetas, useProyectos, useAhorros,
} from '@/hooks'
import {
  descartarHallazgo, resolverHallazgo, deleteIngreso, deleteEgreso, deleteTarjetaTransaccion,
  updateIngreso, updateEgreso, updateTarjetaTransaccion,
  setEtiquetasDeIngreso, setEtiquetasDeEgreso, setEtiquetasDeTarjetaTransaccion,
  createProyecto, createAhorro, getEtiquetas,
} from '@/lib/queries'
import { ejecutarAnalisisCalidadDatos } from '@/lib/analisisCalidad'
import { fmtFull, fmtDate } from '@/lib/utils/formatters'
import { PageHeader, Card } from '@/components/ui'
import { EtiquetaPickerModal } from '@/components/ui/Etiquetas'
import type { CalidadHallazgo, EntidadHallazgo, TipoHallazgo } from '@/types'

const RUTA: Record<EntidadHallazgo, string> = { ingreso: '/dashboard/ingresos', egreso: '/dashboard/egresos', tarjeta_transaccion: '/dashboard/tarjetas' }
const NOMBRE_ENTIDAD: Record<EntidadHallazgo, string> = { ingreso: 'Ingreso', egreso: 'Egreso', tarjeta_transaccion: 'Tarjeta' }
type Tab = 'todos' | 'duplicado_exacto' | 'duplicado_probable' | 'sin_etiqueta'
const TABS: { key: Tab; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'duplicado_exacto', label: 'Duplicados exactos' },
  { key: 'duplicado_probable', label: 'Probables' },
  { key: 'sin_etiqueta', label: 'Sin etiqueta' },
]

export default function RevisionPage() {
  const { data: ingresos, refetch: refIng } = useAllIngresos()
  const { data: egresos, refetch: refEgr } = useAllEgresos()
  const { data: txnsTarjeta, refetch: refTxn } = useTarjetaTransacciones()
  const { data: hallazgos, refetch } = useCalidadHallazgosPendientes()
  const { data: etiquetas, refetch: refetchEtiquetas } = useEtiquetas()
  const { data: proyectos, refetch: refetchProyectos } = useProyectos()
  const { data: ahorros, refetch: refetchAhorros } = useAhorros()

  const [tab, setTab] = useState<Tab>('todos')
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [accionLote, setAccionLote] = useState('')
  const [reanalizando, setReanalizando] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [pickerTipo, setPickerTipo] = useState<'proyecto' | 'ahorro' | null>(null)
  const [pickerHallazgos, setPickerHallazgos] = useState<CalidadHallazgo[] | null>(null)
  const [comparando, setComparando] = useState<CalidadHallazgo | null>(null)
  const [catLoteAbierto, setCatLoteAbierto] = useState(false)
  const [catLoteValor, setCatLoteValor] = useState('')

  const movDe = (entidad: EntidadHallazgo, id: string) => {
    if (entidad === 'ingreso') return (ingresos ?? []).find(x => x.id === id)
    if (entidad === 'egreso') return (egresos ?? []).find(x => x.id === id)
    return (txnsTarjeta ?? []).find(x => x.id === id)
  }
  const describir = (h: CalidadHallazgo) => {
    const a = movDe(h.entidad, h.entidad_id)
    if (!a) return null
    const b = h.entidad_id_2 ? movDe(h.entidad, h.entidad_id_2) : null
    return { a, b }
  }

  const filas = useMemo(() => (hallazgos ?? []).filter(h => tab === 'todos' || h.tipo === tab), [hallazgos, tab])
  const conteos = useMemo(() => ({
    todos: (hallazgos ?? []).length,
    duplicado_exacto: (hallazgos ?? []).filter(h => h.tipo === 'duplicado_exacto').length,
    duplicado_probable: (hallazgos ?? []).filter(h => h.tipo === 'duplicado_probable').length,
    sin_etiqueta: (hallazgos ?? []).filter(h => h.tipo === 'sin_etiqueta').length,
  }), [hallazgos])

  const refetchTodo = () => { refetch(); refIng(); refEgr(); refTxn() }
  const toggleSel = (id: string) => setSeleccionados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleSelAll = () => setSeleccionados(prev => prev.size === filas.length ? new Set() : new Set(filas.map(f => f.id)))

  const handleReanalizar = async () => {
    setReanalizando(true)
    try { await ejecutarAnalisisCalidadDatos(); await refetch() }
    finally { setReanalizando(false) }
  }

  const handleAccion = async (id: string, accion: 'descartar' | 'resolver') => {
    await (accion === 'descartar' ? descartarHallazgo(id) : resolverHallazgo(id))
    await refetch()
  }

  const eliminarMovimiento = async (entidad: EntidadHallazgo, id: string) => {
    if (entidad === 'ingreso') return deleteIngreso(id)
    if (entidad === 'egreso') return deleteEgreso(id)
    return deleteTarjetaTransaccion(id)
  }
  const actualizarCategoria = async (entidad: EntidadHallazgo, id: string, categoria: string) => {
    if (entidad === 'ingreso') return updateIngreso(id, { categoria } as any)
    if (entidad === 'egreso') return updateEgreso(id, { categoria })
    return updateTarjetaTransaccion(id, { categoria })
  }
  const etiquetarMovimiento = async (entidad: EntidadHallazgo, id: string, etiquetaIds: string[]) => {
    if (entidad === 'ingreso') return setEtiquetasDeIngreso(id, etiquetaIds)
    if (entidad === 'egreso') return setEtiquetasDeEgreso(id, etiquetaIds)
    return setEtiquetasDeTarjetaTransaccion(id, etiquetaIds)
  }

  const handleFusionar = async (h: CalidadHallazgo) => {
    if (!h.entidad_id_2) return
    const par = describir(h)
    if (!par?.b) return
    await eliminarMovimiento(h.entidad, h.entidad_id_2)
    await resolverHallazgo(h.id)
    await refetch(); refetchTodo()
  }

  const handleCrearProyecto = async (nombre: string) => {
    const p = await createProyecto({ nombre, presupuesto: 0, moneda: 'ARS', icono: '📁', color: '#1A5E9E', activo: true, fecha_inicio: null, fecha_fin: null })
    const fresh = await getEtiquetas()
    refetchProyectos(); refetchEtiquetas()
    return fresh.find((e: any) => e.proyecto_id === p.id)?.id ?? null
  }
  const handleCrearAhorro = async (nombre: string) => {
    const a = await createAhorro({ nombre, categoria: nombre, moneda: 'ARS', icono: '💰', color: '#1A5E9E', ajuste_manual: 0 })
    const fresh = await getEtiquetas()
    refetchAhorros(); refetchEtiquetas()
    return fresh.find((e: any) => e.ahorro_id === a.id)?.id ?? null
  }

  const handleConfirmEtiquetaLote = async (ids: string[]) => {
    const lote = pickerHallazgos ?? []
    setProcesando(true)
    try {
      for (const h of lote) {
        await etiquetarMovimiento(h.entidad, h.entidad_id, ids)
        await resolverHallazgo(h.id)
      }
      setPickerTipo(null); setPickerHallazgos(null); setSeleccionados(new Set())
      await refetch()
    } finally { setProcesando(false) }
  }

  const handleAplicarCategoriaLote = async () => {
    if (!catLoteValor.trim()) return
    setProcesando(true)
    try {
      for (const id of seleccionados) {
        const h = (hallazgos ?? []).find(x => x.id === id)
        if (!h) continue
        await actualizarCategoria(h.entidad, h.entidad_id, catLoteValor.trim())
      }
      setCatLoteAbierto(false); setCatLoteValor(''); setSeleccionados(new Set())
      await refetch(); refetchTodo()
    } finally { setProcesando(false) }
  }

  const handleEliminarLote = async () => {
    const items = [...seleccionados].map(id => (hallazgos ?? []).find(h => h.id === id)).filter(Boolean) as CalidadHallazgo[]
    if (items.length === 0) return
    if (!confirm(`Se van a eliminar ${items.length} movimientos (en los duplicados, se conserva el primero de cada par). ¿Confirmás?`)) return
    setProcesando(true)
    try {
      for (const h of items) {
        const idABorrar = h.entidad_id_2 || h.entidad_id
        await eliminarMovimiento(h.entidad, idABorrar)
        await resolverHallazgo(h.id)
      }
      setSeleccionados(new Set())
      await refetch(); refetchTodo()
    } finally { setProcesando(false) }
  }

  const handleDescartarLote = async () => {
    setProcesando(true)
    try {
      for (const id of seleccionados) await descartarHallazgo(id)
      setSeleccionados(new Set())
      await refetch()
    } finally { setProcesando(false) }
  }

  const handleAplicarLote = () => {
    if (seleccionados.size === 0 || !accionLote) return
    const items = [...seleccionados].map(id => (hallazgos ?? []).find(h => h.id === id)).filter(Boolean) as CalidadHallazgo[]
    if (accionLote === 'proyecto') { setPickerHallazgos(items); setPickerTipo('proyecto') }
    else if (accionLote === 'ahorro') { setPickerHallazgos(items); setPickerTipo('ahorro') }
    else if (accionLote === 'categoria') setCatLoteAbierto(true)
    else if (accionLote === 'eliminar') handleEliminarLote()
    else if (accionLote === 'descartar') handleDescartarLote()
  }

  const badge = (tipo: TipoHallazgo) => {
    if (tipo === 'duplicado_exacto') return <span className="text-[11px] text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Duplicado exacto</span>
    if (tipo === 'duplicado_probable') return <span className="text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Probable</span>
    return <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Sin etiqueta</span>
  }

  if (!ingresos || !egresos || !txnsTarjeta || !hallazgos) return <div className="text-slate-400 text-sm">Cargando...</div>

  return (
    <div>
      <PageHeader title="Revisión" subtitle="Duplicados y movimientos sin etiqueta"
        action={<button onClick={handleReanalizar} disabled={reanalizando} className="btn-ghost text-sm disabled:opacity-50">{reanalizando ? 'Analizando...' : 'Analizar de nuevo'}</button>} />

      <div className="flex gap-1 border-b border-slate-200 mb-4">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setSeleccionados(new Set()) }}
            className={`px-3.5 py-2 text-sm border-none bg-transparent cursor-pointer -mb-px ${tab === t.key ? 'border-b-2 border-blue-700 text-slate-900 font-medium' : 'text-slate-500'}`}>
            {t.label} ({conteos[t.key]})
          </button>
        ))}
      </div>

      {filas.length === 0 ? (
        <Card><div className="text-center text-slate-400 text-sm py-6">Nada para revisar acá.</div></Card>
      ) : (
        <Card padding="sm">
          <div className="flex items-center gap-2 mb-2 px-1">
            <select value={accionLote} onChange={e=>setAccionLote(e.target.value)} className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600">
              <option value="">Acciones en lote</option>
              <option value="proyecto">Asociar a Proyecto</option>
              <option value="ahorro">Asociar a Ahorro</option>
              <option value="categoria">Cambiar categoría</option>
              <option value="eliminar">Eliminar</option>
              <option value="descartar">Descartar</option>
            </select>
            <button onClick={handleAplicarLote} disabled={!accionLote || seleccionados.size === 0 || procesando}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-40">Aplicar</button>
            {seleccionados.size > 0 && <span className="text-xs text-slate-400 ml-auto">{seleccionados.size} seleccionados</span>}
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[28px_1fr_100px_90px_130px_140px] items-center px-3 py-2 bg-slate-50 text-[11px] text-slate-400 font-medium">
              <input type="checkbox" checked={seleccionados.size === filas.length} onChange={toggleSelAll} />
              <span>Movimiento</span>
              <span>Monto</span>
              <span>Fecha</span>
              <span>Estado</span>
              <span></span>
            </div>
            {filas.map(h => {
              const par = describir(h); if (!par) return null
              const esDuplicado = h.tipo !== 'sin_etiqueta'
              return (
                <div key={h.id} className="grid grid-cols-[28px_1fr_100px_90px_130px_140px] items-center px-3 py-2.5 border-t border-slate-100">
                  <input type="checkbox" checked={seleccionados.has(h.id)} onChange={()=>toggleSel(h.id)} />
                  <div className="min-w-0 pr-2">
                    <div className="text-sm text-slate-700 truncate">
                      {esDuplicado && par.b ? `"${par.a.descripcion}" vs "${par.b.descripcion}"` : par.a.descripcion}
                    </div>
                    <div className="text-[11px] text-slate-400">{NOMBRE_ENTIDAD[h.entidad]}</div>
                  </div>
                  <span className="text-xs font-mono text-slate-600">{fmtFull(par.a.monto, par.a.moneda)}</span>
                  <span className="text-xs text-slate-500">{fmtDate(par.a.fecha)}</span>
                  <div>{badge(h.tipo)}</div>
                  <div className="flex gap-1.5 justify-end text-xs">
                    {esDuplicado ? (
                      <button onClick={()=>setComparando(h)} className="text-blue-700 border-none bg-transparent cursor-pointer">Comparar</button>
                    ) : (
                      <Link href={`${RUTA[h.entidad]}?editar=${h.entidad_id}`} className="text-blue-700">Editar</Link>
                    )}
                    <button onClick={()=>handleAccion(h.id,'descartar')} className="text-slate-400 border-none bg-transparent cursor-pointer">Descartar</button>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {catLoteAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={()=>setCatLoteAbierto(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={e=>e.stopPropagation()}>
            <div className="text-slate-900 font-semibold text-sm mb-3">Cambiar categoría — {seleccionados.size} movimientos</div>
            <input value={catLoteValor} onChange={e=>setCatLoteValor(e.target.value)} placeholder="Nombre de la categoría" className="input-field mb-4" autoFocus />
            <div className="flex gap-2">
              <button onClick={()=>setCatLoteAbierto(false)} className="btn-ghost flex-1">Cancelar</button>
              <button onClick={handleAplicarCategoriaLote} disabled={!catLoteValor.trim() || procesando} className="btn-primary flex-1 disabled:opacity-50">Aplicar</button>
            </div>
          </div>
        </div>
      )}

      {comparando && (() => {
        const par = describir(comparando)
        if (!par?.b) return null
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={()=>setComparando(null)}>
            <div className="bg-white rounded-2xl w-full max-w-2xl p-5" onClick={e=>e.stopPropagation()}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-slate-900 font-semibold text-base">¿Son el mismo gasto?</div>
                <button onClick={()=>setComparando(null)} className="text-slate-400 border-none bg-transparent cursor-pointer text-lg">×</button>
              </div>
              <div className="text-slate-400 text-xs mb-4">Revisá los dos movimientos antes de decidir.</div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[par.a, par.b].map((m: any, i) => (
                  <div key={i} className={`rounded-xl p-3.5 border-2 ${i===0?'border-red-200':'border-slate-200'} bg-slate-50`}>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-2">Movimiento {i===0?'A':'B'}</div>
                    <div className="text-sm font-medium text-slate-800 mb-2">{m.descripcion}</div>
                    <div className="flex flex-col gap-1 text-xs text-slate-500">
                      <div className="flex justify-between"><span>Monto</span><span className="font-mono text-slate-700">{fmtFull(m.monto, m.moneda)}</span></div>
                      <div className="flex justify-between"><span>Fecha</span><span className="text-slate-700">{fmtDate(m.fecha)}</span></div>
                      <div className="flex justify-between"><span>Categoría</span><span className="text-slate-700">{m.categoria || '—'}</span></div>
                      <div className="flex justify-between"><span>Quién</span><span className="text-slate-700">{m.quien || '—'}</span></div>
                    </div>
                    <Link href={`${RUTA[comparando.entidad]}?editar=${m.id}`} className="block text-center text-xs mt-3 px-2 py-1.5 rounded-lg border border-slate-200 bg-white">Editar</Link>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={async()=>{await descartarHallazgo(comparando.id); setComparando(null); refetch()}} className="btn-ghost flex-1">No son duplicados</button>
                <button onClick={async()=>{await handleFusionar(comparando); setComparando(null)}} className="flex-1 rounded-lg border-none bg-red-600 text-white text-sm py-2 cursor-pointer hover:bg-red-700">Eliminar B, conservar A</button>
              </div>
            </div>
          </div>
        )
      })()}

      {pickerTipo && pickerHallazgos && (
        <EtiquetaPickerModal
          open={!!pickerTipo}
          onClose={() => { setPickerTipo(null); setPickerHallazgos(null) }}
          tipo={pickerTipo}
          etiquetas={etiquetas ?? []}
          proyectos={proyectos ?? []}
          ahorros={ahorros ?? []}
          seleccionadas={[]}
          onConfirm={handleConfirmEtiquetaLote}
          onCrear={pickerTipo === 'proyecto' ? handleCrearProyecto : handleCrearAhorro}
        />
      )}
    </div>
  )
}
