'use client'
import { useState, useMemo } from 'react'
import { useMonedasDisponibles } from '@/store/appStore'
import { useProyectos, useAllEgresos } from '@/hooks'
import { createProyecto, updateProyecto, deleteProyecto } from '@/lib/queries'
import { fmt, fmtFull, fmtDate } from '@/lib/utils/formatters'
import { TIPOS_EGRESO, ICONOS_GENERALES, META_COLORS } from '@/lib/utils/constants'
import { PageHeader, Card, Modal, LoadingSpinner, EmptyState, FieldLabel, ProgressBar } from '@/components/ui'
import type { Moneda, Proyecto } from '@/types'

const FORM_INIT = { nombre: '', presupuesto: '', moneda: 'ARS' as Moneda, icono: '📁', color: '#1A5E9E' }
const CAT_COLORS = ['#1A5E9E', '#40B046', '#E8A020', '#5B3FA6', '#F54927', '#1D9E75', '#D4537E', '#888780']

export default function ProyectosPage() {
  const monedasPalette = useMonedasDisponibles()
  const { data: proyectos, loading, refetch } = useProyectos()
  const { data: allEgresos, loading: loadingEgresos } = useAllEgresos()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showModal, setShowModal]   = useState(false)
  const [editId, setEditId]         = useState<string | null>(null)
  const [saving, setSaving]         = useState(false)
  const [form, setForm]             = useState(FORM_INIT)

  const selected = (proyectos ?? []).find(p => p.id === selectedId) ?? null

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
      setShowModal(false); refetch()
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este proyecto? Los gastos asignados quedan sin proyecto, no se borran.')) return
    await deleteProyecto(id)
    if (selectedId === id) setSelectedId(null)
    refetch()
  }

  // Gastado por proyecto — se calcula sobre todos los egresos (sin acotar a un año), sumando
  // solo los que están en la misma moneda del proyecto para no mezclar pesos con dólares.
  const gastadoDe = (p: Proyecto) =>
    (allEgresos ?? []).filter(e => e.proyecto_id === p.id && e.moneda === p.moneda).reduce((s, e) => s + e.monto, 0)

  const gastosDelSeleccionado = useMemo(() =>
    selected ? (allEgresos ?? []).filter(e => e.proyecto_id === selected.id).sort((a, b) => b.fecha.localeCompare(a.fecha)) : []
  , [allEgresos, selected])

  const composicion = useMemo(() => {
    const map: Record<string, number> = {}
    gastosDelSeleccionado.filter(e => e.moneda === selected?.moneda).forEach(e => { map[e.categoria] = (map[e.categoria] ?? 0) + e.monto })
    return Object.entries(map)
      .map(([cat, value], i) => ({ label: TIPOS_EGRESO[cat as keyof typeof TIPOS_EGRESO]?.label ?? cat, value, color: TIPOS_EGRESO[cat as keyof typeof TIPOS_EGRESO]?.color ?? CAT_COLORS[i % CAT_COLORS.length] }))
      .sort((a, b) => b.value - a.value)
  }, [gastosDelSeleccionado, selected])

  if ((loading && !proyectos) || (loadingEgresos && !allEgresos)) return <LoadingSpinner />

  // ── Vista detalle ──────────────────────────────────────────────────────────
  if (selected) {
    const gastado   = gastadoDe(selected)
    const restante  = selected.presupuesto - gastado
    const pctUsado  = selected.presupuesto > 0 ? Math.round(gastado / selected.presupuesto * 100) : 0
    const totalComp = composicion.reduce((s, c) => s + c.value, 0)

    return (
      <div>
        <button onClick={() => setSelectedId(null)} className="text-sm text-slate-500 hover:text-slate-800 border-none bg-transparent cursor-pointer mb-4 px-0">
          ‹ Volver a proyectos
        </button>
        <PageHeader title={`${selected.icono} ${selected.nombre}`} subtitle="Presupuesto, gastos y composición del proyecto"
          action={
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => openEdit(selected)}>✎ Editar</button>
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
          <div className="text-slate-900 font-semibold text-[15px] mb-4">Gastos asignados ({gastosDelSeleccionado.length})</div>
          {gastosDelSeleccionado.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-6">Todavía no asignaste gastos a este proyecto — hacelo desde el formulario de Egresos.</div>
          ) : (
            <div className="flex flex-col">
              {gastosDelSeleccionado.map(e => (
                <div key={e.id} className="flex justify-between items-center py-2.5 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-slate-400 text-xs font-mono flex-shrink-0">{fmtDate(e.fecha)}</span>
                    <span className="text-slate-700 text-sm truncate">{e.descripcion || (TIPOS_EGRESO[e.categoria as keyof typeof TIPOS_EGRESO]?.label ?? e.categoria)}</span>
                  </div>
                  <span className="text-red-600 font-mono font-bold text-sm flex-shrink-0">-{fmtFull(e.monto, e.moneda as Moneda)}</span>
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
      <PageHeader title="Proyecto" subtitle="Asigná gastos a un proyecto puntual y seguí su presupuesto"
        action={<button className="btn-primary" onClick={openNew}>+ Nuevo proyecto</button>} />

      {(proyectos ?? []).length === 0 ? (
        <EmptyState icon="📁" title="Sin proyectos" description="Creá un proyecto (ej. Vacaciones, Mudanza) para agrupar gastos y controlar un presupuesto propio." action={<button className="btn-primary" onClick={openNew}>+ Nuevo proyecto</button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {(proyectos ?? []).map(p => {
            const gastado  = gastadoDe(p)
            const pctUsado = p.presupuesto > 0 ? Math.round(gastado / p.presupuesto * 100) : 0
            return (
              <div key={p.id} onClick={() => setSelectedId(p.id)}
                className="group cursor-pointer bg-white border-2 rounded-2xl p-6 shadow-card relative overflow-hidden hover:-translate-y-0.5 transition-all"
                style={{ borderColor: p.color + '22' }}>
                <div className="absolute top-0 right-0 w-20 h-20 rounded-bl-[80px]" style={{ background: p.color + '08' }} />
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-3xl">{p.icono}</span>
                  <div className="text-lg font-semibold text-slate-900">{p.nombre}</div>
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
          <div><FieldLabel>Presupuesto (opcional)</FieldLabel><input type="number" value={form.presupuesto} onChange={e => setForm(p => ({ ...p, presupuesto: e.target.value }))} placeholder="0" className="input-field" /></div>
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
