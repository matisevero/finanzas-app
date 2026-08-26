'use client'
import { useState, useMemo, useEffect } from 'react'
import { useMonedasDisponibles } from '@/store/appStore'
import { useProyectos, useAllEgresos, useAllIngresos, useEtiquetas, useEgresoEtiquetas, useIngresoEtiquetas, useProyectoPresupuestos, useProyectoMovimientosManuales } from '@/hooks'
import { createProyecto, updateProyecto, deleteProyecto, archivarProyecto, setPresupuestosDeProyecto, createProyectoMovimientoManual, deleteProyectoMovimientoManual } from '@/lib/queries'
import { fmt, fmtFull, fmtDate } from '@/lib/utils/formatters'
import { TIPOS_EGRESO, ICONOS_GENERALES, META_COLORS } from '@/lib/utils/constants'
import { PageHeader, Card, Modal, LoadingSpinner, EmptyState, FieldLabel, ProgressBar } from '@/components/ui'
import { AsociarMovimientoModal } from '@/components/ui/AsociarMovimientoModal'
import MontoInput from '@/components/ui/MontoInput'
import FechaInput from '@/components/ui/FechaInput'
import type { Moneda, Proyecto, Egreso, Ingreso, EstadoMovimientoManual } from '@/types'

type PresupuestoFila = { moneda: Moneda; monto: string }
const FORM_INIT = { nombre: '', fecha_inicio: '', fecha_fin: '', icono: '📁', color: '#1A5E9E', presupuestos: [{ moneda: 'ARS' as Moneda, monto: '' }] as PresupuestoFila[] }
const CAT_COLORS = ['#1A5E9E', '#40B046', '#E8A020', '#5B3FA6', '#F54927', '#1D9E75', '#D4537E', '#888780']

export default function ProyectosPage() {
  const monedasPalette = useMonedasDisponibles()
  const { data: proyectos, loading, refetch } = useProyectos()
  const { data: allEgresos, loading: loadingEgresos } = useAllEgresos()
  const { data: allIngresos, loading: loadingIngresos } = useAllIngresos()
  const { data: etiquetas, loading: loadingEtiquetas, refetch: refetchEtiquetas } = useEtiquetas()
  const { data: egresoEtiquetas, loading: loadingEE, refetch: refetchEgresoEtiquetas } = useEgresoEtiquetas()
  const { data: ingresoEtiquetas, loading: loadingIE, refetch: refetchIngresoEtiquetas } = useIngresoEtiquetas()
  const { data: presupuestos, refetch: refetchPresupuestos } = useProyectoPresupuestos()
  const { data: movManuales, refetch: refetchManuales } = useProyectoMovimientosManuales()
  const [showAsociarModal, setShowAsociarModal] = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showModal, setShowModal]   = useState(false)
  const [editId, setEditId]         = useState<string | null>(null)
  const [saving, setSaving]         = useState(false)
  const [form, setForm]             = useState(FORM_INIT)

  const selected = (proyectos ?? []).find(p => p.id === selectedId) ?? null

  // Cada Proyecto tiene exactamente una etiqueta 1 a 1 (se crea sola al crear el proyecto) —
  // el gasto real del proyecto se calcula vía esa etiqueta, no vía un campo propio del egreso.
  const etiquetaDe = (p: Proyecto) => (etiquetas ?? []).find(e => e.tipo === 'proyecto' && e.proyecto_id === p.id)

  const presupuestosDe = (p: Proyecto): PresupuestoFila[] => {
    const filas = (presupuestos ?? []).filter(x => x.proyecto_id === p.id).map(x => ({ moneda: x.moneda, monto: String(x.monto) }))
    return filas.length > 0 ? filas : [{ moneda: p.moneda, monto: '' }]
  }

  const openNew = () => { setEditId(null); setForm(FORM_INIT); setShowModal(true) }
  const openEdit = (p: Proyecto) => {
    setEditId(p.id)
    setForm({ nombre: p.nombre, fecha_inicio: p.fecha_inicio ?? '', fecha_fin: p.fecha_fin ?? '', icono: p.icono, color: p.color, presupuestos: presupuestosDe(p) })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.nombre) return
    setSaving(true)
    try {
      const filasValidas = form.presupuestos.filter(f => parseFloat(f.monto) > 0)
      const primaria = filasValidas[0] ?? form.presupuestos[0]
      const payload = {
        nombre: form.nombre, presupuesto: parseFloat(primaria?.monto) || 0, moneda: primaria?.moneda ?? 'ARS',
        icono: form.icono, color: form.color, activo: true,
        fecha_inicio: form.fecha_inicio || null, fecha_fin: form.fecha_fin || null,
      }
      const id = editId ? (await updateProyecto(editId, payload)).id : (await createProyecto(payload)).id
      await setPresupuestosDeProyecto(id, filasValidas.map(f => ({ moneda: f.moneda, monto: parseFloat(f.monto) })))
      setShowModal(false); refetch(); refetchEtiquetas(); refetchPresupuestos()
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este proyecto? Su etiqueta y las asociaciones a movimientos se eliminan con él (los movimientos en sí no se borran).')) return
    await deleteProyecto(id)
    if (selectedId === id) setSelectedId(null)
    refetch(); refetchEtiquetas()
  }

  const handleArchivar = async (p: Proyecto, archivar: boolean) => {
    await archivarProyecto(p.id, archivar)
    refetchEtiquetas()
  }

  // Total gastado por moneda = egresos etiquetados − ingresos etiquetados (reembolsos/aportes),
  // separado por moneda para no mezclar pesos con dólares.
  const gastadoPorMonedaDe = (p: Proyecto): Record<string, number> => {
    const et = etiquetaDe(p)
    if (!et) return {}
    const egresoIds  = new Set((egresoEtiquetas ?? []).filter(r => r.etiqueta_id === et.id).map(r => r.egreso_id))
    const ingresoIds = new Set((ingresoEtiquetas ?? []).filter(r => r.etiqueta_id === et.id).map(r => r.ingreso_id))
    const map: Record<string, number> = {}
    ;(allEgresos ?? []).filter(e => egresoIds.has(e.id)).forEach(e => { map[e.moneda] = (map[e.moneda] ?? 0) + e.monto })
    ;(allIngresos ?? []).filter(i => ingresoIds.has(i.id)).forEach(i => { map[i.moneda] = (map[i.moneda] ?? 0) - i.monto })
    return map
  }
  // Compat: total en la moneda "principal" del proyecto (para la card de la lista).
  const gastadoDe = (p: Proyecto) => gastadoPorMonedaDe(p)[p.moneda] ?? 0
  // Monedas a mostrar: cualquiera con presupuesto cargado o con movimientos reales.
  const monedasDe = (p: Proyecto): Moneda[] => {
    const s = new Set<string>([...presupuestosDe(p).filter(f=>parseFloat(f.monto)>0).map(f=>f.moneda), ...Object.keys(gastadoPorMonedaDe(p))])
    return s.size > 0 ? Array.from(s) : [p.moneda]
  }
  const presupuestoEnMoneda = (p: Proyecto, moneda: Moneda) => parseFloat(presupuestosDe(p).find(f=>f.moneda===moneda)?.monto || '0') || 0

  type Movimiento = { tipo: 'egreso' | 'ingreso' | 'manual'; id: string; fecha: string; descripcion: string; categoria: string; monto: number; moneda: Moneda; estado?: EstadoMovimientoManual }

  const manualesDelSeleccionado = useMemo(() => (movManuales ?? []).filter(m => m.proyecto_id === selected?.id), [movManuales, selected])

  const movimientosDelSeleccionado = useMemo((): Movimiento[] => {
    if (!selected) return []
    const et = etiquetaDe(selected)
    const egresoIds  = et ? new Set((egresoEtiquetas ?? []).filter(r => r.etiqueta_id === et.id).map(r => r.egreso_id)) : new Set()
    const ingresoIds = et ? new Set((ingresoEtiquetas ?? []).filter(r => r.etiqueta_id === et.id).map(r => r.ingreso_id)) : new Set()
    const egr: Movimiento[] = (allEgresos ?? []).filter(e => egresoIds.has(e.id))
      .map(e => ({ tipo: 'egreso' as const, id: e.id, fecha: e.fecha, descripcion: e.descripcion, categoria: e.categoria, monto: e.monto, moneda: e.moneda as Moneda }))
    const ing: Movimiento[] = (allIngresos ?? []).filter(i => ingresoIds.has(i.id))
      .map(i => ({ tipo: 'ingreso' as const, id: i.id, fecha: i.fecha, descripcion: i.descripcion, categoria: i.tipo, monto: i.monto, moneda: i.moneda as Moneda }))
    const man: Movimiento[] = manualesDelSeleccionado
      .map(m => ({ tipo: 'manual' as const, id: m.id, fecha: m.fecha, descripcion: m.descripcion, categoria: m.categoria, monto: m.monto, moneda: m.moneda as Moneda, estado: m.estado }))
    return [...egr, ...ing, ...man].sort((a, b) => b.fecha.localeCompare(a.fecha))
  }, [allEgresos, allIngresos, egresoEtiquetas, ingresoEtiquetas, selected, etiquetas, manualesDelSeleccionado])

  // Proyectado por moneda = suma de movimientos manuales (estimado/pendiente), aparte de lo
  // realmente gastado — no se mezclan hasta que el gasto se carga de verdad en Egresos.
  const proyectadoPorMonedaDe = (p: Proyecto): Record<string, number> => {
    const map: Record<string, number> = {}
    ;(movManuales ?? []).filter(m => m.proyecto_id === p.id).forEach(m => { map[m.moneda] = (map[m.moneda] ?? 0) + m.monto })
    return map
  }

  const [showManualModal, setShowManualModal] = useState(false)
  const [manualForm, setManualForm] = useState({ descripcion: '', categoria: 'otro', fecha: new Date().toISOString().split('T')[0], monto: '', moneda: 'ARS' as Moneda, estado: 'estimado' as EstadoMovimientoManual })
  const [savingManual, setSavingManual] = useState(false)

  const handleGuardarManual = async () => {
    if (!selected || !manualForm.descripcion || !manualForm.monto) return
    setSavingManual(true)
    try {
      await createProyectoMovimientoManual({
        proyecto_id: selected.id, descripcion: manualForm.descripcion, categoria: manualForm.categoria,
        fecha: manualForm.fecha, monto: parseFloat(manualForm.monto), moneda: manualForm.moneda, estado: manualForm.estado,
      })
      setShowManualModal(false)
      setManualForm({ descripcion: '', categoria: 'otro', fecha: new Date().toISOString().split('T')[0], monto: '', moneda: 'ARS', estado: 'estimado' })
      refetchManuales()
    } catch (e) { console.error(e) } finally { setSavingManual(false) }
  }

  const handleEliminarManual = async (id: string) => {
    if (!confirm('¿Eliminar este movimiento estimado?')) return
    await deleteProyectoMovimientoManual(id)
    refetchManuales()
  }

  const composicion = useMemo(() => {
    const map: Record<string, number> = {}
    movimientosDelSeleccionado.filter(m => m.tipo === 'egreso' && m.moneda === selected?.moneda).forEach(m => { map[m.categoria] = (map[m.categoria] ?? 0) + m.monto })
    return Object.entries(map)
      .map(([cat, value], i) => ({ label: TIPOS_EGRESO[cat as keyof typeof TIPOS_EGRESO]?.label ?? cat, value, color: TIPOS_EGRESO[cat as keyof typeof TIPOS_EGRESO]?.color ?? CAT_COLORS[i % CAT_COLORS.length] }))
      .sort((a, b) => b.value - a.value)
  }, [movimientosDelSeleccionado, selected])

  if ((loading && !proyectos) || (loadingEgresos && !allEgresos) || (loadingIngresos && !allIngresos) || (loadingEtiquetas && !etiquetas) || (loadingEE && !egresoEtiquetas) || (loadingIE && !ingresoEtiquetas)) return <LoadingSpinner />

  // ── Vista detalle ──────────────────────────────────────────────────────────
  if (selected) {
    const et        = etiquetaDe(selected)
    const archivado = et?.estado === 'archivada'
    const monedas   = monedasDe(selected)
    const totalComp = composicion.reduce((s, c) => s + c.value, 0)

    return (
      <div>
        <button onClick={() => setSelectedId(null)} className="text-sm text-slate-500 hover:text-slate-800 border-none bg-transparent cursor-pointer mb-4 px-0">
          ‹ Volver a proyectos
        </button>
        <PageHeader title={`${selected.icono} ${selected.nombre}`} subtitle={archivado ? 'Archivado — ya no se puede asociar a movimientos nuevos' : (selected.fecha_inicio || selected.fecha_fin) ? `${selected.fecha_inicio ? fmtDate(selected.fecha_inicio) : '...'} — ${selected.fecha_fin ? fmtDate(selected.fecha_fin) : '...'}` : 'Presupuesto, gastos y composición del proyecto'}
          action={
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => openEdit(selected)}>✎ Editar</button>
              <button className="btn-ghost" onClick={() => handleArchivar(selected, !archivado)}>{archivado ? '↺ Reactivar' : '🗄 Archivar'}</button>
              <button className="btn-ghost" onClick={() => handleDelete(selected.id)}>✕ Eliminar</button>
            </div>
          } />

        {monedas.map(mon => {
          const presupuesto = presupuestoEnMoneda(selected, mon)
          const gastado     = gastadoPorMonedaDe(selected)[mon] ?? 0
          const proyectado  = proyectadoPorMonedaDe(selected)[mon] ?? 0
          const restante    = presupuesto - gastado
          const pctUsado    = presupuesto > 0 ? Math.round(gastado / presupuesto * 100) : 0
          return (
            <div key={mon} className="mb-5">
              {monedas.length > 1 && <div className="text-xs font-semibold text-slate-500 mb-2">{mon}</div>}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-2">
                {[
                  { l: 'Presupuesto', v: presupuesto > 0 ? fmt(presupuesto, mon) : '—', c: '#1A5E9E' },
                  { l: 'Gastado',     v: fmt(gastado, mon),               c: '#F54927' },
                  { l: 'Proyectado',  v: proyectado > 0 ? fmt(proyectado, mon) : '—',   c: '#E8A020' },
                  { l: 'Restante',    v: presupuesto > 0 ? fmt(restante, mon) : '—',    c: restante >= 0 ? '#40B046' : '#F54927' },
                ].map(k => (
                  <div key={k.l} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-card">
                    <div className="label mb-1">{k.l}</div>
                    <div className="text-xl font-bold font-mono" style={{ color: k.c }}>{k.v}</div>
                  </div>
                ))}
              </div>
              {presupuesto > 0 && (
                <Card>
                  <ProgressBar value={Math.min(100, pctUsado)} color={pctUsado >= 100 ? '#F54927' : selected.color} height={8} />
                  <div className="text-slate-400 text-xs mt-2">{pctUsado}% del presupuesto usado</div>
                </Card>
              )}
            </div>
          )
        })}

        <Card className="mb-5">
          <div className="text-slate-900 font-semibold text-[15px] mb-4">Composición por categoría</div>
          {composicion.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-6">Sin gastos asignados todavía</div>
          ) : (
            <div className="flex flex-col gap-3">
              {composicion.map(c => (
                <div key={c.label}>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs font-medium text-slate-700">{c.label} <span className="text-slate-400">({totalComp > 0 ? Math.round(c.value / totalComp * 100) : 0}%)</span></span>
                    <span className="text-xs font-mono font-bold" style={{ color: c.color }}>{fmt(c.value, selected.moneda as Moneda)}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${totalComp > 0 ? Math.round(c.value / totalComp * 100) : 0}%`, background: c.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="text-slate-900 font-semibold text-[15px]">Movimientos ({movimientosDelSeleccionado.length})</div>
            <div className="flex gap-2">
              <button className="btn-ghost text-sm" onClick={() => setShowAsociarModal(true)}>+ Asociar movimiento</button>
              <button className="btn-ghost text-sm" onClick={() => setShowManualModal(true)}>+ Movimiento estimado</button>
            </div>
          </div>
          {movimientosDelSeleccionado.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-6">Todavía no asociaste movimientos a este proyecto — hacelo desde el menú de un ingreso o egreso, o cargá uno estimado.</div>
          ) : (
            <div className="flex flex-col">
              {movimientosDelSeleccionado.map(mv => (
                <div key={`${mv.tipo}-${mv.id}`} className="flex justify-between items-center py-2.5 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-slate-400 text-xs font-mono flex-shrink-0">{fmtDate(mv.fecha)}</span>
                    <span className="text-slate-700 text-sm truncate">{mv.descripcion || (TIPOS_EGRESO[mv.categoria as keyof typeof TIPOS_EGRESO]?.label ?? mv.categoria)}</span>
                    {mv.tipo === 'ingreso' && <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full flex-shrink-0">reembolso</span>}
                    {mv.tipo === 'manual' && <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full flex-shrink-0">{mv.estado}</span>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`font-mono font-bold text-sm ${mv.tipo === 'ingreso' ? 'text-emerald-700' : mv.tipo === 'manual' ? 'text-amber-600' : 'text-red-600'}`}>
                      {mv.tipo === 'ingreso' ? '+' : '-'}{fmtFull(mv.monto, mv.moneda)}
                    </span>
                    {mv.tipo === 'manual' && <button onClick={() => handleEliminarManual(mv.id)} className="text-slate-300 hover:text-red-500 cursor-pointer border-none bg-transparent">✕</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <ProyectoModal open={showModal} onClose={() => setShowModal(false)} editId={editId} form={form} setForm={setForm}
          saving={saving} onSave={handleSave} monedasPalette={monedasPalette} />

        <Modal open={showManualModal} onClose={() => setShowManualModal(false)} title="Movimiento estimado">
          <div className="flex flex-col gap-4">
            <div><FieldLabel>Descripción</FieldLabel>
              <input value={manualForm.descripcion} onChange={e => setManualForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Ej: Pasajes (todavía no comprados)" className="input-field" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><FieldLabel>Monto</FieldLabel><MontoInput value={manualForm.monto} onChange={raw => setManualForm(p => ({ ...p, monto: raw }))} placeholder="0" /></div>
              <div><FieldLabel>Moneda</FieldLabel>
                <select value={manualForm.moneda} onChange={e => setManualForm(p => ({ ...p, moneda: e.target.value as Moneda }))} className="input-field">
                  {monedasPalette.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><FieldLabel>Fecha</FieldLabel><FechaInput value={manualForm.fecha} onChange={v => setManualForm(p => ({ ...p, fecha: v }))} /></div>
              <div><FieldLabel>Estado</FieldLabel>
                <select value={manualForm.estado} onChange={e => setManualForm(p => ({ ...p, estado: e.target.value as EstadoMovimientoManual }))} className="input-field">
                  <option value="estimado">Estimado</option>
                  <option value="pendiente">Pendiente</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowManualModal(false)} className="btn-ghost flex-1">Cancelar</button>
              <button onClick={handleGuardarManual} disabled={savingManual || !manualForm.descripcion || !manualForm.monto} className="btn-primary flex-1 disabled:opacity-50">{savingManual ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </Modal>

        <AsociarMovimientoModal open={showAsociarModal} onClose={() => setShowAsociarModal(false)}
          tipo="proyecto" etiquetaId={et?.id ?? ''} etiquetas={etiquetas ?? []}
          ingresos={allIngresos ?? []} egresos={allEgresos ?? []} tarjetaTxns={[]}
          ingresoEtiquetas={ingresoEtiquetas ?? []} egresoEtiquetas={egresoEtiquetas ?? []} txnEtiquetas={[]}
          onDone={() => { refetchEgresoEtiquetas(); refetchIngresoEtiquetas() }} />
      </div>
    )
  }

  // ── Vista lista ─────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader title="Proyecto" subtitle="Asociá movimientos a un proyecto puntual y seguí su presupuesto"
        action={<button className="btn-primary" onClick={openNew}>+ Nuevo proyecto</button>} />

      {(proyectos ?? []).length === 0 ? (
        <EmptyState icon="📁" title="Sin proyectos" description="Creá un proyecto (ej. Vacaciones, Mudanza) para agrupar movimientos y controlar un presupuesto propio." action={<button className="btn-primary" onClick={openNew}>+ Nuevo proyecto</button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {(proyectos ?? []).map(p => {
            const monedas   = monedasDe(p)
            const archivado = etiquetaDe(p)?.estado === 'archivada'
            return (
              <div key={p.id} onClick={() => setSelectedId(p.id)}
                className="group cursor-pointer bg-white border-2 rounded-2xl p-6 shadow-card relative overflow-hidden hover:-translate-y-0.5 transition-all"
                style={{ borderColor: p.color + '22', opacity: archivado ? 0.6 : 1 }}>
                <div className="absolute top-0 right-0 w-20 h-20 rounded-bl-[80px]" style={{ background: p.color + '08' }} />
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-3xl">{p.icono}</span>
                  <div className="text-lg font-semibold text-slate-900">{p.nombre}</div>
                  {archivado && <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Archivado</span>}
                </div>
                {monedas.map(mon => {
                  const gastado    = gastadoPorMonedaDe(p)[mon] ?? 0
                  const presupuesto = presupuestoEnMoneda(p, mon)
                  const pctUsado   = presupuesto > 0 ? Math.round(gastado / presupuesto * 100) : 0
                  return (
                    <div key={mon} className="mb-2 last:mb-0">
                      <div className="text-slate-500 text-sm mb-1">
                        {fmt(gastado, mon)} gastados {presupuesto > 0 && <>de {fmt(presupuesto, mon)}</>}
                      </div>
                      {presupuesto > 0 && (
                        <>
                          <ProgressBar value={Math.min(100, pctUsado)} color={pctUsado >= 100 ? '#F54927' : p.color} height={6} />
                          <div className="text-slate-400 text-xs mt-1">{pctUsado}% del presupuesto</div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      <ProyectoModal open={showModal} onClose={() => setShowModal(false)} editId={editId} form={form} setForm={setForm}
        saving={saving} onSave={handleSave} monedasPalette={monedasPalette} />
    </div>
  )
}

function ProyectoModal({ open, onClose, editId, form, setForm, saving, onSave, monedasPalette }: {
  open: boolean; onClose: () => void; editId: string | null
  form: typeof FORM_INIT; setForm: React.Dispatch<React.SetStateAction<typeof FORM_INIT>>
  saving: boolean; onSave: () => void; monedasPalette: Moneda[]
}) {
  const setFila = (i: number, fila: Partial<PresupuestoFila>) =>
    setForm(p => ({ ...p, presupuestos: p.presupuestos.map((f, idx) => idx === i ? { ...f, ...fila } : f) }))
  const agregarFila = () => setForm(p => ({ ...p, presupuestos: [...p.presupuestos, { moneda: 'USD' as Moneda, monto: '' }] }))
  const quitarFila = (i: number) => setForm(p => ({ ...p, presupuestos: p.presupuestos.filter((_, idx) => idx !== i) }))

  return (
    <Modal open={open} onClose={onClose} title={editId ? 'Editar proyecto' : 'Nuevo proyecto'}>
      <div className="flex flex-col gap-4">
        <div><FieldLabel>Nombre</FieldLabel><input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Ej: Vacaciones Brasil" className="input-field" /></div>

        <div>
          <FieldLabel>Presupuesto (opcional — podés cargar más de una moneda)</FieldLabel>
          <div className="flex flex-col gap-2 mt-1">
            {form.presupuestos.map((f, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                <MontoInput value={f.monto} onChange={raw => setFila(i, { monto: raw })} placeholder="0" />
                <select value={f.moneda} onChange={e => setFila(i, { moneda: e.target.value as Moneda })} className="input-field">
                  {monedasPalette.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {form.presupuestos.length > 1 && (
                  <button type="button" onClick={() => quitarFila(i)} className="text-slate-300 hover:text-red-500 cursor-pointer border-none bg-transparent px-1">✕</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={agregarFila} className="text-xs text-blue-700 font-semibold border-none bg-transparent cursor-pointer text-left underline w-fit mt-2">+ Agregar otra moneda</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><FieldLabel>Fecha inicio (opcional)</FieldLabel><FechaInput value={form.fecha_inicio} onChange={v => setForm(p => ({ ...p, fecha_inicio: v }))} /></div>
          <div><FieldLabel>Fecha vencimiento (opcional)</FieldLabel><FechaInput value={form.fecha_fin} onChange={v => setForm(p => ({ ...p, fecha_fin: v }))} /></div>
        </div>

        <div><FieldLabel>Ícono</FieldLabel>
          <div className="flex flex-wrap gap-2 mt-1">
            {ICONOS_GENERALES.slice(0, 16).map(ic => (
              <button key={ic} onClick={() => setForm(p => ({ ...p, icono: ic }))} className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg cursor-pointer border-2 transition-all ${form.icono === ic ? 'border-blue-700 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}>{ic}</button>
            ))}
          </div>
        </div>
        <div><FieldLabel>Color</FieldLabel>
          <div className="flex gap-2 mt-1">
            {META_COLORS.map(c => (
              <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))} className={`w-7 h-7 rounded-full border-2 cursor-pointer transition-all ${form.color === c ? 'border-slate-900 scale-110' : 'border-transparent'}`} style={{ background: c }} />
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={onSave} disabled={saving || !form.nombre} className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </Modal>
  )
}
