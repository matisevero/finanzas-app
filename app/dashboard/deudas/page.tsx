'use client'
import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAppStore } from '@/store/appStore'
import { useDeudas, useEventosMes, useEventosAño, useIngresos } from '@/hooks'
import { createDeuda, updateDeuda, deleteDeuda, pagarEvento, despagarEvento, updateEvento, deleteEvento, createEvento } from '@/lib/queries'
import { fmt, fmtFull, fmtDate } from '@/lib/utils/formatters'
import { MESES, MESES_CORTOS, TIPOS_EVENTO } from '@/lib/utils/constants'
import { PageHeader, Card, Modal, LoadingSpinner, FieldLabel, ProgressBar, Tabs, StatCard } from '@/components/ui'
import type { Moneda } from '@/types'

const HOY     = new Date()
const HOY_DIA = HOY.getDate()
const HOY_MES = HOY.getMonth()
const HOY_AÑO = HOY.getFullYear()

const CATEGORIAS_EVENTO = [
  { key: 'tarjeta',  label: 'Tarjeta',    color: '#1A5E9E' },
  { key: 'casa',     label: 'Casa',        color: '#40B046' },
  { key: 'servicio', label: 'Servicios',   color: '#E8A020' },
  { key: 'expensa',  label: 'Expensas',    color: '#5B3FA6' },
  { key: 'edu',      label: 'Educación',   color: '#D4537E' },
  { key: 'egreso',   label: 'Otro egreso', color: '#888780' },
]

// ─── InlineEditEvento ─────────────────────────────────────────────────────────
function InlineEditEvento({ ev, onSave, onCancel }: { ev: any; onSave: (id: string, data: any) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState({
    descripcion: ev.descripcion ?? '',
    monto: ev.monto != null ? String(ev.monto) : '',
    dia: String(ev.dia),
    tipo: ev.tipo,
  })
  const [saving, setSaving] = useState(false)
  const handle = async () => {
    setSaving(true)
    await onSave(ev.id, { descripcion: form.descripcion, monto: form.monto ? parseFloat(form.monto) : null, dia: parseInt(form.dia), tipo: form.tipo })
    setSaving(false)
  }
  return (
    <div className="flex items-center gap-2 px-2 py-2 bg-blue-50 rounded-lg">
      <input type="number" min="1" max="31" value={form.dia} onChange={e => setForm(p => ({ ...p, dia: e.target.value }))} className="input-field py-1 text-xs w-14 text-center" placeholder="Día" />
      <input value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} className="input-field py-1 text-xs flex-1" placeholder="Descripción" />
      <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))} className="input-field py-1 text-xs w-28">
        {CATEGORIAS_EVENTO.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
      <input type="number" value={form.monto} onChange={e => setForm(p => ({ ...p, monto: e.target.value }))} className="input-field py-1 text-xs w-32 text-right" placeholder="Monto" step="0.01" />
      <button onClick={handle} disabled={saving} className="text-xs bg-blue-700 text-white px-2 py-1 rounded-lg border-none cursor-pointer disabled:opacity-50">{saving ? '...' : '✓'}</button>
      <button onClick={onCancel} className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded-lg border-none cursor-pointer">✕</button>
    </div>
  )
}


// ─── InlineEditDeuda ──────────────────────────────────────────────────────────
function InlineEditDeuda({ d, onSave, onCancel }: { d: any; onSave: (id: string, data: any) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState({
    nombre: d.nombre ?? '', banco: d.banco ?? '',
    total_original: String(d.total_original), pendiente: String(d.pendiente),
    cuota_mensual: String(d.cuota_mensual), cuota_actual: String(d.cuota_actual),
    cuota_total: String(d.cuota_total), fecha_vencimiento: d.fecha_vencimiento ?? '',
    moneda: d.moneda ?? 'ARS', color: d.color ?? '#5B3FA6',
  })
  const [saving, setSaving] = useState(false)
  const handle = async () => {
    setSaving(true)
    await onSave(d.id, {
      nombre: form.nombre, banco: form.banco,
      total_original: parseFloat(form.total_original), pendiente: parseFloat(form.pendiente),
      cuota_mensual: parseFloat(form.cuota_mensual), cuota_actual: parseInt(form.cuota_actual),
      cuota_total: parseInt(form.cuota_total), fecha_vencimiento: form.fecha_vencimiento,
      moneda: form.moneda, color: form.color,
    })
    setSaving(false)
  }
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card">
      <div className="text-xs font-bold text-blue-700 mb-3 uppercase tracking-wider">Editando deuda</div>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label mb-1.5 block">Nombre</label><input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} className="input-field py-1.5 text-sm" /></div>
          <div><label className="label mb-1.5 block">Banco / descripción</label><input value={form.banco} onChange={e => setForm(p => ({ ...p, banco: e.target.value }))} className="input-field py-1.5 text-sm" /></div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div><label className="label mb-1.5 block">Total original</label><input type="number" step="0.01" value={form.total_original} onChange={e => setForm(p => ({ ...p, total_original: e.target.value }))} className="input-field py-1.5 text-sm" /></div>
          <div><label className="label mb-1.5 block">Pendiente</label><input type="number" step="0.01" value={form.pendiente} onChange={e => setForm(p => ({ ...p, pendiente: e.target.value }))} className="input-field py-1.5 text-sm" /></div>
          <div><label className="label mb-1.5 block">Cuota/mes</label><input type="number" step="0.01" value={form.cuota_mensual} onChange={e => setForm(p => ({ ...p, cuota_mensual: e.target.value }))} className="input-field py-1.5 text-sm" /></div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div><label className="label mb-1.5 block">Cuota actual</label><input type="number" value={form.cuota_actual} onChange={e => setForm(p => ({ ...p, cuota_actual: e.target.value }))} className="input-field py-1.5 text-sm" /></div>
          <div><label className="label mb-1.5 block">Total cuotas</label><input type="number" value={form.cuota_total} onChange={e => setForm(p => ({ ...p, cuota_total: e.target.value }))} className="input-field py-1.5 text-sm" /></div>
          <div><label className="label mb-1.5 block">Vencimiento</label><input type="date" value={form.fecha_vencimiento} onChange={e => setForm(p => ({ ...p, fecha_vencimiento: e.target.value }))} className="input-field py-1.5 text-sm" /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label mb-1.5 block">Moneda</label>
            <select value={form.moneda} onChange={e => setForm(p => ({ ...p, moneda: e.target.value }))} className="input-field py-1.5 text-sm">
              {['ARS','USD','EUR'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><label className="label mb-1.5 block">Color</label>
            <div className="flex gap-2 mt-1">
              {['#5B3FA6','#F54927','#1D9E75','#40B046','#1A5E9E','#E8A020','#D4537E'].map(col => (
                <button key={col} type="button" onClick={() => setForm(p => ({ ...p, color: col }))}
                  className={"w-7 h-7 rounded-full border-2 cursor-pointer transition-all " + (form.color === col ? 'border-slate-900 scale-110' : 'border-transparent')}
                  style={{ background: col }} />
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCancel} className="btn-ghost flex-1 text-sm">Cancelar</button>
          <button type="button" onClick={handle} disabled={saving} className="btn-primary flex-1 text-sm disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DeudasPage() {
  const { añoActivo, monedaPrincipal: m } = useAppStore()
  const { data: deudas, loading: ld, refetch: refDeudas } = useDeudas()
  const { data: ingresos } = useIngresos()
  const [tab, setTab] = useState<'calendario'|'largo'>('calendario')
  const [calMes, setCalMes] = useState(HOY_MES)
  const [calAño, setCalAño] = useState(HOY_AÑO)
  const { data: eventos, loading: le, refetch: refEventos } = useEventosMes(calAño, calMes + 1)
  const { data: eventosAño } = useEventosAño(calAño)
  const [expanded, setExpanded] = useState<Record<string,boolean>>({})
  const [editingEventoId, setEditingEventoId] = useState<string|null>(null)
  const [editingDeudaId, setEditingDeudaId] = useState<string|null>(null)
  const [mostrarPagados, setMostrarPagados] = useState(false)
  const [saving, setSaving] = useState(false)

  // Modal nuevo evento (calendario)
  const [showEvModal, setShowEvModal] = useState(false)
  const [evForm, setEvForm] = useState({
    descripcion: '', tipo: 'egreso', dia: String(HOY_DIA),
    monto: '', moneda: 'ARS' as Moneda, recurrente: false,
    cuotas: '1', gastoFijo: false,
  })

  // Modal nueva deuda largo plazo
  const [showDeudaModal, setShowDeudaModal] = useState(false)
  const [modalEditDeudaId, setModalEditDeudaId] = useState<string|null>(null)
  const [deudaForm, setDeudaForm] = useState({
    nombre: '', banco: '', total_original: '', cuota_mensual: '',
    fecha_inicio: new Date().toISOString().split('T')[0],
    fecha_vencimiento: '', cuota_actual: '1', cuota_total: '1',
    moneda: 'ARS' as Moneda, color: '#5B3FA6',
  })

  // ── Stats ──────────────────────────────────────────────────────────────────
  const diasEnMes   = new Date(calAño, calMes+1, 0).getDate()
  const primerDia   = new Date(calAño, calMes, 1).getDay()
  const offsetLunes = primerDia === 0 ? 6 : primerDia - 1

  const eventosFiltrados = useMemo(() => {
    const base = (eventos ?? []).filter(e => e.tipo !== 'ingreso')
    return mostrarPagados ? base : base.filter(e => !e.pagado)
  }, [eventos, mostrarPagados])

  const eventosPorDia = useMemo(() => {
    const mp: Record<number, typeof eventos> = {}
    eventosFiltrados.forEach(e => { if (!mp[e.dia]) mp[e.dia] = []; mp[e.dia]!.push(e) })
    return mp
  }, [eventosFiltrados])

  const totalPendiente = (deudas ?? []).reduce((s, d) => s + d.pendiente, 0)
  const cuotaMensual   = (deudas ?? []).reduce((s, d) => s + d.cuota_mensual, 0)
  const venceMes       = (eventos ?? []).filter(e => e.tipo !== 'ingreso' && !e.pagado && e.monto).reduce((s, e) => s + (e.monto ?? 0), 0)
  const pagadoMes      = (eventos ?? []).filter(e => e.pagado && e.monto).reduce((s, e) => s + (e.monto ?? 0), 0)
  const pendientes     = (eventos ?? []).filter(e => !e.pagado && e.tipo !== 'ingreso').length

  // Gráfico anual: vencimientos reales por mes vs ingresos del mes
  const chartAnual = useMemo(() => {
    const LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
    return Array.from({length: 12}, (_, i) => {
      const mesNum = i + 1
      const ingMes = (ingresos ?? []).filter(ing => ing.mes === mesNum && ing.año === calAño).reduce((s, ing) => s + ing.monto, 0)
      const deudaMes = (eventosAño ?? []).filter(ev => ev.mes === mesNum && ev.tipo !== 'ingreso' && ev.monto).reduce((s, ev) => s + (ev.monto ?? 0), 0)
      const pct = ingMes > 0 ? Math.round(deudaMes / ingMes * 100) : 0
      return { month: LABELS[i], ingresos: ingMes, deudas: deudaMes, pct }
    })
  }, [ingresos, eventosAño, calAño])

  // % deuda vs ingresos del mes
  const totalIngresosMes = (ingresos ?? []).filter(i => i.mes === calMes + 1 && i.año === calAño).reduce((s, i) => s + i.monto, 0)
  const pctDeudaIngresos = totalIngresosMes > 0 ? Math.round(venceMes / totalIngresosMes * 100) : 0

  // mes anterior para trend
  const venceMesAnt = useMemo(() => {
    // approximate from deudas cuota_mensual (we don't load prev month events here)
    return cuotaMensual
  }, [cuotaMensual])

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleToggle = async (ev: any) => {
    if (!ev.pagado) {
      if (!ev.monto) {
        await import('@/lib/queries').then(q => q.togglePagado(ev.id, true))
      } else {
        await pagarEvento({ id: ev.id, descripcion: ev.descripcion, monto: ev.monto, moneda: ev.moneda ?? 'ARS', dia: ev.dia, mes: ev.mes, año: ev.año, tipo: ev.tipo })
      }
    } else {
      await despagarEvento(ev.id, ev.egreso_id)
    }
    refEventos()
  }

  const handleUpdateEvento = async (id: string, data: any) => {
    await updateEvento(id, data); setEditingEventoId(null); refEventos()
  }

  const handleDeleteEvento = async (id: string) => {
    if (!confirm('¿Eliminar este evento?')) return
    await deleteEvento(id); refEventos()
  }

  const handleDuplicarEvento = async (ev: any) => {
    await createEvento({
      dia: ev.dia, mes: ev.mes, año: ev.año,
      tipo: ev.tipo, descripcion: ev.descripcion,
      monto: ev.monto, moneda: ev.moneda ?? 'ARS',
      recurrente: false, pagado: false,
    })
    refEventos()
  }

  const handleSaveEvento = async () => {
    if (!evForm.descripcion || !evForm.dia) return
    setSaving(true)
    try {
      const cuotas = parseInt(evForm.cuotas) || 1
      for (let i = 0; i < cuotas; i++) {
        let mes = calMes + 1 + i
        let año = calAño
        while (mes > 12) { mes -= 12; año++ }
        await createEvento({
          dia: parseInt(evForm.dia), mes, año,
          tipo: evForm.tipo as any,
          descripcion: cuotas > 1 ? `${evForm.descripcion} (${i+1}/${cuotas})` : evForm.descripcion,
          monto: evForm.monto ? parseFloat(evForm.monto) : undefined,
          moneda: evForm.moneda, recurrente: evForm.recurrente, pagado: false, gasto_fijo: evForm.gastoFijo,
        })
      }
      setShowEvModal(false)
      setEvForm({ descripcion: '', tipo: 'egreso', dia: String(HOY_DIA), monto: '', moneda: 'ARS', recurrente: false, cuotas: '1', gastoFijo: false })
      refEventos()
    } catch(e) { console.error(e) } finally { setSaving(false) }
  }

  const handleSaveDeuda = async () => {
    if (!deudaForm.nombre || !deudaForm.total_original || !deudaForm.fecha_vencimiento) return
    setSaving(true)
    try {
      if (modalEditDeudaId) {
        await updateDeuda(modalEditDeudaId, {
          nombre: deudaForm.nombre, banco: deudaForm.banco,
          cuota_mensual: parseFloat(deudaForm.cuota_mensual) || 0,
          moneda: deudaForm.moneda,
          fecha_inicio: deudaForm.fecha_inicio, fecha_vencimiento: deudaForm.fecha_vencimiento,
          cuota_actual: parseInt(deudaForm.cuota_actual), cuota_total: parseInt(deudaForm.cuota_total),
          color: deudaForm.color,
        })
      } else {
        await createDeuda({
          nombre: deudaForm.nombre, banco: deudaForm.banco,
          total_original: parseFloat(deudaForm.total_original),
          pendiente: parseFloat(deudaForm.total_original),
          cuota_mensual: parseFloat(deudaForm.cuota_mensual) || 0,
          tasa_interes: 0, moneda: deudaForm.moneda,
          fecha_inicio: deudaForm.fecha_inicio, fecha_vencimiento: deudaForm.fecha_vencimiento,
          cuota_actual: parseInt(deudaForm.cuota_actual), cuota_total: parseInt(deudaForm.cuota_total),
          color: deudaForm.color, activa: true,
        })
      }
      setShowDeudaModal(false); setModalEditDeudaId(null); refDeudas()
    } catch(e) { console.error(e) } finally { setSaving(false) }
  }

  const openEditDeudaModal = (d: any) => {
    setDeudaForm({
      nombre: d.nombre ?? '', banco: d.banco ?? '',
      total_original: String(d.total_original ?? ''), cuota_mensual: String(d.cuota_mensual ?? ''),
      fecha_inicio: d.fecha_inicio ?? new Date().toISOString().split('T')[0],
      fecha_vencimiento: d.fecha_vencimiento ?? '',
      cuota_actual: String(d.cuota_actual ?? '1'), cuota_total: String(d.cuota_total ?? '1'),
      moneda: d.moneda ?? 'ARS', color: d.color ?? '#5B3FA6',
    })
    setModalEditDeudaId(d.id)
    setShowDeudaModal(true)
  }

  const handleUpdateDeuda = async (id: string, data: any) => {
    await updateDeuda(id, data); setEditingDeudaId(null); refDeudas()
  }

  const handleDeleteDeuda = async (id: string) => {
    if (!confirm('¿Eliminar esta deuda?')) return
    await deleteDeuda(id); refDeudas()
  }

  const navMes = (dir: number) => {
    let mes = calMes + dir, año = calAño
    if (mes < 0) { mes = 11; año-- } else if (mes > 11) { mes = 0; año++ }
    setCalMes(mes); setCalAño(año)
  }

  if (ld || le) return <LoadingSpinner />

  return (
    <div>
      <PageHeader title="Deudas"
        action={
          <div className="flex gap-2">
            <button className="btn-ghost text-sm" onClick={() => setShowEvModal(true)}>+ Vencimiento</button>
            <button className="btn-primary" onClick={() => { setModalEditDeudaId(null); setDeudaForm({ nombre:'', banco:'', total_original:'', cuota_mensual:'', fecha_inicio:new Date().toISOString().split('T')[0], fecha_vencimiento:'', cuota_actual:'1', cuota_total:'1', moneda:'ARS', color:'#5B3FA6' }); setShowDeudaModal(true) }}>+ Deuda largo plazo</button>
          </div>
        } />

      {/* ── StatCards ── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Vence este mes"     value={fmt(venceMes, m)}           color="#F54927" sub={`${pendientes} pendientes`} />
        <StatCard label="Pagado este mes"    value={fmt(pagadoMes, m)}           color="#40B046" sub="del mes actual" />
        <StatCard label="% sobre ingresos"   value={`${pctDeudaIngresos}%`}      color={pctDeudaIngresos > 40 ? '#F54927' : pctDeudaIngresos > 25 ? '#E8A020' : '#40B046'} sub="deudas / ingresos del mes" />
        <StatCard label="Deudas LP activas"  value={String((deudas ?? []).length)} color="#5B3FA6" sub={`Cuota fija: ${fmt(cuotaMensual, m)}`} />
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center justify-between mb-5">
        <Tabs tabs={[{value:'calendario',label:'Calendario'},{value:'largo',label:'Largo plazo'}]} value={tab} onChange={v => setTab(v as any)} />
        {tab === 'calendario' && (
          <div className="flex items-center gap-5 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Total a pagar:</span>
              <span className="font-mono font-bold text-red-600">{fmt(venceMes, m)}</span>
            </div>
            <div className="w-px h-4 bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Pagado:</span>
              <span className="font-mono font-bold text-emerald-600">{fmt(pagadoMes, m)}</span>
            </div>
            <div className="w-px h-4 bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Restante:</span>
              <span className="font-mono font-bold text-red-600">{fmt(Math.max(0, venceMes - pagadoMes), m)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Calendario ── */}
      {tab === 'calendario' && (
        <div className="grid grid-cols-2 gap-5">

          {/* Lista */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <button onClick={() => navMes(-1)} className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer">‹</button>
                <span className="font-semibold text-slate-900 text-sm">{MESES[calMes]} {calAño}</span>
                <button onClick={() => navMes(1)} className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer">›</button>
              </div>
              <button onClick={() => setMostrarPagados(p => !p)}
                className={`px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer transition-all ${mostrarPagados ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}>
                {mostrarPagados ? 'Ocultar pagados' : 'Ver pagados'}
              </button>
            </div>

            {/* + Nuevo vencimiento inline trigger */}
            <button onClick={() => setShowEvModal(true)}
              className="w-full text-left text-xs font-semibold text-red-500 hover:text-red-700 border-none bg-transparent cursor-pointer flex items-center gap-1.5 py-2 mb-2 border-b border-slate-100 transition-colors">
              <span className="text-sm font-bold">+</span> Nuevo vencimiento
            </button>

            {eventosFiltrados.length === 0 ? (
              <div className="text-slate-400 text-xs text-center py-6">Sin pendientes este mes</div>
            ) : eventosFiltrados.sort((a, b) => a.dia - b.dia).map((ev, rowIdx) => {
              const catInfo = CATEGORIAS_EVENTO.find(c => c.key === ev.tipo) ?? CATEGORIAS_EVENTO[CATEGORIAS_EVENTO.length - 1]
              const bg = rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
              if (editingEventoId === ev.id) return (
                <div key={ev.id} className="mb-1">
                  <InlineEditEvento ev={ev} onSave={handleUpdateEvento} onCancel={() => setEditingEventoId(null)} />
                </div>
              )
              return (
                <div key={ev.id} className={`group flex items-center gap-3 px-2 py-2.5 rounded-lg ${bg} ${ev.pagado ? 'opacity-50' : ''}`}>
                  {/* Día badge */}
                  <div className="w-9 h-9 rounded-lg flex flex-col items-center justify-center flex-shrink-0" style={{ background: catInfo.color + '18' }}>
                    <span className="text-sm font-bold font-mono leading-none" style={{ color: catInfo.color }}>{ev.dia}</span>
                    <span className="text-[8px] font-bold uppercase" style={{ color: catInfo.color }}>{MESES_CORTOS[calMes]}</span>
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium text-slate-700 truncate ${ev.pagado ? 'line-through' : ''}`}>{ev.descripcion}</div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: catInfo.color + '15', color: catInfo.color }}>{catInfo.label}</span>
                      {ev.gasto_fijo && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-purple-50 text-purple-700">Gasto fijo</span>}
                    </div>
                  </div>
                  {/* Monto */}
                  <div className="text-sm font-mono font-bold text-red-600 flex-shrink-0">
                    {ev.monto != null ? fmtFull(ev.monto, 'ARS') : '—'}
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => setEditingEventoId(ev.id)} className="text-slate-400 hover:text-blue-600 border-none bg-transparent cursor-pointer px-1 text-sm" title="Editar">✎</button>
                    <button onClick={() => handleDuplicarEvento(ev)} className="text-slate-400 hover:text-emerald-600 border-none bg-transparent cursor-pointer px-1 text-sm" title="Duplicar">⧉</button>
                    <button onClick={() => handleDeleteEvento(ev.id)} className="text-slate-300 hover:text-red-500 border-none bg-transparent cursor-pointer px-1 text-sm" title="Eliminar">✕</button>
                  </div>
                  {/* Checkbox */}
                  <button onClick={() => handleToggle(ev)}
                    className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 cursor-pointer transition-all ${ev.pagado ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-transparent'}`}>
                    {ev.pagado && <span className="text-[10px]">✓</span>}
                  </button>
                </div>
              )
            })}
          </Card>

          {/* Calendario visual */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button onClick={() => navMes(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer">‹</button>
                <span className="font-semibold text-slate-900 min-w-[160px] text-center">{MESES[calMes]} {calAño}</span>
                <button onClick={() => navMes(1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer">›</button>
              </div>
              <div className="text-xs text-slate-400">{pctDeudaIngresos}% de tus ingresos</div>
            </div>
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => (
                <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({length: offsetLunes}).map((_, i) => <div key={`e${i}`} className="min-h-[72px]" />)}
              {Array.from({length: diasEnMes}).map((_, i) => {
                const dia = i + 1
                const isHoy = dia === HOY_DIA && calMes === HOY_MES && calAño === HOY_AÑO
                const isPast = new Date(calAño, calMes, dia) < new Date(HOY_AÑO, HOY_MES, HOY_DIA)
                const dayEvs = eventosPorDia[dia] ?? []
                const visible = dayEvs.slice(0, 3)
                const extra = dayEvs.length - 3
                return (
                  <div key={dia} className={`min-h-[72px] rounded-lg p-1.5 border transition-all ${isHoy ? 'bg-blue-50 border-blue-200' : 'border-transparent'} ${dayEvs.length > 0 ? 'hover:bg-slate-50 cursor-pointer' : ''} ${isPast && !isHoy ? 'opacity-50' : ''}`}>
                    <div className={`text-xs font-bold mb-1 ${isHoy ? 'text-blue-700' : 'text-slate-500'}`}>
                      {dia}{isHoy && <span className="ml-1 text-[8px] bg-blue-700 text-white rounded px-1">hoy</span>}
                    </div>
                    {visible.map(ev => {
                      const catInfo = CATEGORIAS_EVENTO.find(c => c.key === ev.tipo) ?? CATEGORIAS_EVENTO[CATEGORIAS_EVENTO.length - 1]
                      return (
                        <div key={ev.id} onClick={() => handleToggle(ev)}
                          className={`text-[9px] font-medium px-1 py-0.5 rounded mb-0.5 truncate cursor-pointer transition-opacity ${ev.pagado ? 'opacity-40 line-through' : ''}`}
                          style={{ background: catInfo.color + '18', color: catInfo.color }}>
                          {ev.descripcion}
                        </div>
                      )
                    })}
                    {extra > 0 && <div className="text-[9px] text-slate-400">+{extra} más</div>}
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ── Largo plazo ── */}
      {tab === 'largo' && (
        <div>
          {(deudas ?? []).length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <div className="text-4xl mb-3">📋</div>
              <div className="font-semibold text-slate-600 mb-1">Sin deudas de largo plazo</div>
              <div className="text-sm mb-4">Agregá préstamos, créditos o cuotas fijas.</div>
              <button onClick={() => { setModalEditDeudaId(null); setDeudaForm({ nombre:'', banco:'', total_original:'', cuota_mensual:'', fecha_inicio:new Date().toISOString().split('T')[0], fecha_vencimiento:'', cuota_actual:'1', cuota_total:'1', moneda:'ARS', color:'#5B3FA6' }); setShowDeudaModal(true) }} className="btn-primary">+ Nueva deuda LP</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-5">
              {(deudas ?? []).map(d => {
                if (editingDeudaId === d.id) return (
                  <InlineEditDeuda key={d.id} d={d} onSave={handleUpdateDeuda} onCancel={() => setEditingDeudaId(null)} />
                )
                const pagado = d.total_original - d.pendiente
                const pct    = Math.round((pagado / d.total_original) * 100)
                const isExp  = expanded[d.id]
                return (
                  <Card key={d.id}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1 min-w-0">
                        <div onClick={() => openEditDeudaModal(d)} className="text-base font-semibold text-slate-900 truncate cursor-pointer hover:underline hover:font-bold">{d.nombre}</div>
                        {d.banco && <div className="text-slate-400 text-xs mt-0.5">{d.banco}</div>}
                      </div>
                      <div className="flex items-start gap-2 flex-shrink-0 ml-3">
                        <div className="text-right">
                          <div className="text-lg font-bold font-mono" style={{ color: d.color }}>{fmtFull(d.pendiente, d.moneda as Moneda)}</div>
                          <div className="text-slate-400 text-xs">pendiente</div>
                        </div>
                        <div className="flex gap-0.5 mt-1">
                          <button onClick={() => setEditingDeudaId(d.id)} className="text-slate-400 hover:text-blue-600 border-none bg-transparent cursor-pointer px-1 text-sm">✎</button>
                          <button onClick={() => handleDeleteDeuda(d.id)} className="text-slate-300 hover:text-red-500 border-none bg-transparent cursor-pointer px-1 text-sm">✕</button>
                        </div>
                      </div>
                    </div>
                    <ProgressBar value={pct} color={d.color} height={6} />
                    <div className="flex justify-between mt-1.5 mb-3">
                      <span className="text-slate-400 text-xs">Pagado: {fmtFull(pagado, d.moneda as Moneda)}</span>
                      <span className="text-xs font-bold" style={{ color: d.color }}>{pct}%</span>
                    </div>
                    {/* Cuotas como cuadraditos */}
                    <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                      <div className="flex-1">
                        <div className="label mb-1.5">Cuotas</div>
                        <div className="flex flex-wrap gap-1">
                          {Array.from({length: Math.min(d.cuota_total, 24)}).map((_, i) => (
                            <div key={i}
                              className={`w-5 h-5 rounded text-[8px] flex items-center justify-center font-bold transition-all ${i < d.cuota_actual ? 'text-white' : 'text-slate-400 bg-slate-100'}`}
                              style={i < d.cuota_actual ? { background: d.color } : {}}>
                              {i + 1}
                            </div>
                          ))}
                          {d.cuota_total > 24 && <span className="text-[9px] text-slate-400">+{d.cuota_total - 24}</span>}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">{d.cuota_actual} de {d.cuota_total} · {fmtFull(d.cuota_mensual, d.moneda as Moneda)}/mes</div>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Gráfico anual % deuda vs ingresos ── */}
      <div className="mt-6">
        <div className="mb-3">
          <div className="text-slate-900 font-semibold text-[15px]">Vencimientos vs Ingresos — {calAño}</div>
          <div className="text-slate-400 text-xs mt-0.5">Qué % de tus ingresos del mes se va en pago de deudas</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <p className="text-slate-400 text-xs mb-4">Barras = ingresos del mes · Línea = cuota fija mensual · % = proporción</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartAnual} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v+'%'} domain={[0, 100]} />
                <Tooltip contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [`${v}%`, '% de ingresos']}
                  labelFormatter={(l: string) => l} />
                <Bar dataKey="pct" name="% deudas/ingresos" radius={[3,3,0,0]} maxBarSize={40}
                  fill="#F54927"
                  label={{ position: 'top', fontSize: 10, fill: '#94a3b8', formatter: (v: number) => v > 0 ? `${v}%` : '' }} />
              </BarChart>
            </ResponsiveContainer>
        </div>
      </div>

      {/* ── Modal nuevo vencimiento ── */}
      <Modal open={showEvModal} onClose={() => setShowEvModal(false)} title="Nuevo vencimiento">
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Descripción</FieldLabel>
            <input value={evForm.descripcion} onChange={e => setEvForm(p => ({ ...p, descripcion: e.target.value }))}
              placeholder="Ej: Pago tarjeta Galicia" className="input-field" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Categoría</FieldLabel>
              <select value={evForm.tipo} onChange={e => setEvForm(p => ({ ...p, tipo: e.target.value }))} className="input-field">
                {CATEGORIAS_EVENTO.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div><FieldLabel>Día del mes</FieldLabel>
              <input type="number" min="1" max="31" value={evForm.dia}
                onChange={e => setEvForm(p => ({ ...p, dia: e.target.value }))} className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Monto</FieldLabel>
              <input type="number" step="0.01" value={evForm.monto}
                onChange={e => setEvForm(p => ({ ...p, monto: e.target.value }))}
                placeholder="0" className="input-field" />
            </div>
            <div><FieldLabel>Moneda</FieldLabel>
              <select value={evForm.moneda} onChange={e => setEvForm(p => ({ ...p, moneda: e.target.value as Moneda }))} className="input-field">
                {['ARS','USD','EUR'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div><FieldLabel>Cantidad de cuotas</FieldLabel>
            <div className="flex items-center gap-3">
              <input type="number" min="1" max="60" value={evForm.cuotas}
                onChange={e => setEvForm(p => ({ ...p, cuotas: e.target.value }))}
                className="input-field w-24" />
              {parseInt(evForm.cuotas) > 1 && (
                <span className="text-slate-400 text-xs">
                  Se crearán {evForm.cuotas} vencimientos mensuales a partir de {MESES[calMes]} {calAño}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={evForm.recurrente} onChange={e => setEvForm(p => ({ ...p, recurrente: e.target.checked }))} className="w-4 h-4 accent-blue-700" />
              <span className="text-slate-600 text-sm">Recurrente</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={evForm.gastoFijo} onChange={e => setEvForm(p => ({ ...p, gastoFijo: e.target.checked }))} className="w-4 h-4 accent-purple-700" />
              <span className="text-slate-600 text-sm">Gasto fijo</span>
            </label>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowEvModal(false)} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={handleSaveEvento} disabled={saving || !evForm.descripcion}
              className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Modal nueva deuda LP ── */}
      <Modal open={showDeudaModal} onClose={() => { setShowDeudaModal(false); setModalEditDeudaId(null) }} title={modalEditDeudaId ? 'Editar deuda' : 'Nueva deuda — Largo plazo'}>
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Nombre</FieldLabel>
            <input value={deudaForm.nombre} onChange={e => setDeudaForm(p => ({ ...p, nombre: e.target.value }))}
              placeholder="Ej: Crédito auto" className="input-field" autoFocus />
          </div>
          <div><FieldLabel>Descripción / Banco</FieldLabel>
            <input value={deudaForm.banco} onChange={e => setDeudaForm(p => ({ ...p, banco: e.target.value }))}
              placeholder="Ej: Banco Galicia" className="input-field" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Monto total{modalEditDeudaId ? ' (no editable)' : ''}</FieldLabel>
              <input type="number" step="0.01" value={deudaForm.total_original} disabled={!!modalEditDeudaId}
                onChange={e => setDeudaForm(p => ({ ...p, total_original: e.target.value }))} placeholder="0" className="input-field disabled:opacity-50 disabled:cursor-not-allowed" />
            </div>
            <div><FieldLabel>Cuota mensual</FieldLabel>
              <input type="number" step="0.01" value={deudaForm.cuota_mensual}
                onChange={e => setDeudaForm(p => ({ ...p, cuota_mensual: e.target.value }))} placeholder="0" className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Cuota actual</FieldLabel>
              <input type="number" value={deudaForm.cuota_actual}
                onChange={e => setDeudaForm(p => ({ ...p, cuota_actual: e.target.value }))} className="input-field" />
            </div>
            <div><FieldLabel>Total cuotas</FieldLabel>
              <input type="number" value={deudaForm.cuota_total}
                onChange={e => setDeudaForm(p => ({ ...p, cuota_total: e.target.value }))} className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Fecha inicio</FieldLabel>
              <input type="date" value={deudaForm.fecha_inicio}
                onChange={e => setDeudaForm(p => ({ ...p, fecha_inicio: e.target.value }))} className="input-field" />
            </div>
            <div><FieldLabel>Fecha vencimiento</FieldLabel>
              <input type="date" value={deudaForm.fecha_vencimiento}
                onChange={e => setDeudaForm(p => ({ ...p, fecha_vencimiento: e.target.value }))} className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Moneda</FieldLabel>
              <select value={deudaForm.moneda} onChange={e => setDeudaForm(p => ({ ...p, moneda: e.target.value as Moneda }))} className="input-field">
                {['ARS','USD','EUR'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><FieldLabel>Color</FieldLabel>
              <div className="flex gap-2 mt-1">
                {['#5B3FA6','#F54927','#1D9E75','#40B046','#1A5E9E','#E8A020','#D4537E'].map(c => (
                  <button key={c} onClick={() => setDeudaForm(p => ({ ...p, color: c }))}
                    className={`w-7 h-7 rounded-full border-2 cursor-pointer transition-all ${deudaForm.color === c ? 'border-slate-900 scale-110' : 'border-transparent'}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => { setShowDeudaModal(false); setModalEditDeudaId(null) }} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={handleSaveDeuda} disabled={saving || !deudaForm.nombre || !deudaForm.total_original}
              className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Guardando...' : modalEditDeudaId ? 'Guardar cambios' : 'Guardar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
