'use client'
import { useState, useMemo } from 'react'
import { useMonedasDisponibles } from '@/store/appStore'
import { useProyectos, useAllEgresos, useAllIngresos, useEtiquetas, useEgresoEtiquetas, useIngresoEtiquetas } from '@/hooks'
import { createProyecto, updateProyecto, deleteProyecto, archivarProyecto } from '@/lib/queries'
import { fmt, fmtFull, fmtDate } from '@/lib/utils/formatters'
import { TIPOS_EGRESO, ICONOS_GENERALES, META_COLORS } from '@/lib/utils/constants'
import { PageHeader, Card, Modal, LoadingSpinner, EmptyState, FieldLabel, ProgressBar } from '@/components/ui'
import MontoInput from '@/components/ui/MontoInput'
import type { Moneda, Proyecto, Egreso, Ingreso } from '@/types'

const FORM_INIT = { nombre: '', presupuesto: '', moneda: 'ARS' as Moneda, icono: '📁', color: '#1A5E9E' }
const CAT_COLORS = ['#1A5E9E', '#40B046', '#E8A020', '#5B3FA6', '#F54927', '#1D9E75', '#D4537E', '#888780']

export default function ProyectosPage() {
  const monedasPalette = useMonedasDisponibles()
  const { data: proyectos, loading, refetch } = useProyectos()
  const { data: allEgresos, loading: loadingEgresos } = useAllEgresos()
  const { data: allIngresos, loading: loadingIngresos } = useAllIngresos()
  const { data: etiquetas, loading: loadingEtiquetas, refetch: refetchEtiquetas } = useEtiquetas()
  const { data: egresoEtiquetas, loading: loadingEE } = useEgresoEtiquetas()
  const { data: ingresoEtiquetas, loading: loadingIE } = useIngresoEtiquetas()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showModal, setShowModal]   = useState(false)
  const [editId, setEditId]         = useState<string | null>(null)
  const [saving, setSaving]         = useState(false)
  const [form, setForm]             = useState(FORM_INIT)

  const selected = (proyectos ?? []).find(p => p.id === selectedId) ?? null

  // Cada Proyecto tiene exactamente una etiqueta 1 a 1 (se crea sola al crear el proyecto) —
  // el gasto real del proyecto se calcula vía esa etiqueta, no vía un campo propio del egreso.
  const etiquetaDe = (p: Proyecto) => (etiquetas ?? []).find(e => e.tipo === 'proyecto' && e.proyecto_id === p.id)

  const openNew = () => { setEditId(null); setForm(FORM_INIT); setShowModal(true) }
  const openEdit = (p: Proyecto) => {
    setEditId(p.id)
    setForm({ nombre: p.nombre, presupuesto: String(p.presupuesto), moneda: p.moneda as Moneda, icono: p.icono, color: p.color })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.nombre) return
    setSaving(true)
    try {
      const payload = { nombre: form.nombre, presupuesto: parseFloat(form.presupuesto) || 0, moneda: form.moneda, icono: form.icono, color: form.color, activo: true, fecha_inicio: null, fecha_fin: null }
      if (editId) await updateProyecto(editId, payload)
      else await createProyecto(payload)
      setShowModal(false); refetch(); refetchEtiquetas()
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

  // Total gastado = egresos etiquetados − ingresos etiquetados (reembolsos/aportes al proyecto),
  // solo en la moneda del proyecto para no mezclar pesos con dólares.
  const gastadoDe = (p: Proyecto) => {
    const et = etiquetaDe(p)
    if (!et) return 0
    const egresoIds  = new Set((egresoEtiquetas ?? []).filter(r => r.etiqueta_id === et.id).map(r => r.egreso_id))
    const ingresoIds = new Set((ingresoEtiquetas ?? []).filter(r => r.etiqueta_id === et.id).map(r => r.ingreso_id))
    const gastos    = (allEgresos ?? []).filter(e => egresoIds.has(e.id) && e.moneda === p.moneda).reduce((s, e) => s + e.monto, 0)
    const reembolsos = (allIngresos ?? []).filter(i => ingresoIds.has(i.id) && i.moneda === p.moneda).reduce((s, i) => s + i.monto, 0)
    return gastos - reembolsos
  }

  type Movimiento = { tipo: 'egreso' | 'ingreso'; id: string; fecha: string; descripcion: string; categoria: string; monto: number; moneda: Moneda }

  const movimientosDelSeleccionado = useMemo((): Movimiento[] => {
    if (!selected) return []
    const et = etiquetaDe(selected)
    if (!et) return []
    const egresoIds  = new Set((egresoEtiquetas ?? []).filter(r => r.etiqueta_id === et.id).map(r => r.egreso_id))
    const ingresoIds = new Set((ingresoEtiquetas ?? []).filter(r => r.etiqueta_id === et.id).map(r => r.ingreso_id))
    const egr: Movimiento[] = (allEgresos ?? []).filter(e => egresoIds.has(e.id))
      .map(e => ({ tipo: 'egreso' as const, id: e.id, fecha: e.fecha, descripcion: e.descripcion, categoria: e.categoria, monto: e.monto, moneda: e.moneda as Moneda }))
    const ing: Movimiento[] = (allIngresos ?? []).filter(i => ingresoIds.has(i.id))
      .map(i => ({ tipo: 'ingreso' as const, id: i.id, fecha: i.fecha, descripcion: i.descripcion, categoria: i.tipo, monto: i.monto, moneda: i.moneda as Moneda }))
    return [...egr, ...ing].sort((a, b) => b.fecha.localeCompare(a.fecha))
  }, [allEgresos, allIngresos, egresoEtiquetas, ingresoEtiquetas, selected, etiquetas])

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
    const gastado   = gastadoDe(selected)
    const restante  = selected.presupuesto - gastado
    const pctUsado  = selected.presupuesto > 0 ? Math.round(gastado / selected.presupuesto * 100) : 0
    const totalComp = composicion.reduce((s, c) => s + c.value, 0)

    return (
      <div>
        <button onClick={() => setSelectedId(null)} className="text-sm text-slate-500 hover:text-slate-800 border-none bg-transparent cursor-pointer mb-4 px-0">
          ‹ Volver a proyectos
        </button>
        <PageHeader title={`${selected.icono} ${selected.nombre}`} subtitle={archivado ? 'Archivado — ya no se puede asociar a movimientos nuevos' : 'Presupuesto, gastos y composición del proyecto'}
          action={
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => openEdit(selected)}>✎ Editar</button>
              <button className="btn-ghost" onClick={() => handleArchivar(selected, !archivado)}>{archivado ? '↺ Reactivar' : '🗄 Archivar'}</button>
              <button className="btn-ghost" onClick={() => handleDelete(selected.id)}>✕ Eliminar</button>
            </div>
          } />

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { l: 'Presupuesto', v: fmt(selected.presupuesto, selected.moneda as Moneda), c: '#1A5E9E' },
            { l: 'Gastado',     v: fmt(gastado, selected.moneda as Moneda),               c: '#F54927' },
            { l: 'Restante',    v: fmt(restante, selected.moneda as Moneda),              c: restante >= 0 ? '#40B046' : '#F54927' },
            { l: '% usado',     v: `${pctUsado}%`,                                        c: '#E8A020' },
          ].map(k => (
            <div key={k.l} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card">
              <div className="label mb-1">{k.l}</div>
              <div className="text-2xl font-bold font-mono" style={{ color: k.c }}>{k.v}</div>
            </div>
          ))}
        </div>

        {selected.presupuesto > 0 && (
          <Card className="mb-5">
            <ProgressBar value={Math.min(100, pctUsado)} color={pctUsado >= 100 ? '#F54927' : selected.color} height={8} />
            <div className="text-slate-400 text-xs mt-2">{pctUsado}% del presupuesto usado</div>
          </Card>
        )}

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
          <div className="text-slate-900 font-semibold text-[15px] mb-4">Movimientos etiquetados ({movimientosDelSeleccionado.length})</div>
          {movimientosDelSeleccionado.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-6">Todavía no asociaste movimientos a este proyecto — hacelo desde el menú de un ingreso o egreso.</div>
          ) : (
            <div className="flex flex-col">
              {movimientosDelSeleccionado.map(mv => (
                <div key={`${mv.tipo}-${mv.id}`} className="flex justify-between items-center py-2.5 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-slate-400 text-xs font-mono flex-shrink-0">{fmtDate(mv.fecha)}</span>
                    <span className="text-slate-700 text-sm truncate">{mv.descripcion || (TIPOS_EGRESO[mv.categoria as keyof typeof TIPOS_EGRESO]?.label ?? mv.categoria)}</span>
                    {mv.tipo === 'ingreso' && <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full flex-shrink-0">reembolso</span>}
                  </div>
                  <span className={`font-mono font-bold text-sm flex-shrink-0 ${mv.tipo === 'egreso' ? 'text-red-600' : 'text-emerald-700'}`}>
                    {mv.tipo === 'egreso' ? '-' : '+'}{fmtFull(mv.monto, mv.moneda)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <ProyectoModal open={showModal} onClose={() => setShowModal(false)} editId={editId} form={form} setForm={setForm}
          saving={saving} onSave={handleSave} monedasPalette={monedasPalette} />
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
            const gastado   = gastadoDe(p)
            const pctUsado  = p.presupuesto > 0 ? Math.round(gastado / p.presupuesto * 100) : 0
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
                <div className="text-slate-500 text-sm mb-2">
                  {fmt(gastado, p.moneda as Moneda)} gastados {p.presupuesto > 0 && <>de {fmt(p.presupuesto, p.moneda as Moneda)}</>}
                </div>
                {p.presupuesto > 0 && (
                  <>
                    <ProgressBar value={Math.min(100, pctUsado)} color={pctUsado >= 100 ? '#F54927' : p.color} height={6} />
                    <div className="text-slate-400 text-xs mt-1.5">{pctUsado}% del presupuesto</div>
                  </>
                )}
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
  return (
    <Modal open={open} onClose={onClose} title={editId ? 'Editar proyecto' : 'Nuevo proyecto'}>
      <div className="flex flex-col gap-4">
        <div><FieldLabel>Nombre</FieldLabel><input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Ej: Vacaciones Brasil" className="input-field" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><FieldLabel>Presupuesto (opcional)</FieldLabel><MontoInput value={form.presupuesto} onChange={raw => setForm(p => ({ ...p, presupuesto: raw }))} placeholder="0" /></div>
          <div><FieldLabel>Moneda</FieldLabel>
            <select value={form.moneda} onChange={e => setForm(p => ({ ...p, moneda: e.target.value as Moneda }))} className="input-field">
              {monedasPalette.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
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
