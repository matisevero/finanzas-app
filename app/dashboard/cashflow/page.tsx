'use client'
import { useState, useMemo, useRef } from 'react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useAppStore } from '@/store/appStore'
import { useEventosMes, useIngresos, useEgresos, useDeudas } from '@/hooks'
import { fmt } from '@/lib/utils/formatters'
import { MESES } from '@/lib/utils/constants'
import { PageHeader, Card, CardTitle, LoadingSpinner, Modal, FieldLabel } from '@/components/ui'
import { proyectarCashFlow } from '@/lib/utils/calculations'

const TT  = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, color:'#0f172a' }
const HOY = new Date()
const DAYS_SHORT = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

// ── tipos locales para items de simulación ────────────────────────────────────
interface SimItem {
  id: number
  label: string
  monto: number
  tipo: 'ingreso' | 'egreso' | 'deuda'
  dia: number | null  // null = sin fecha (holding)
}

const CHIP_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  ingreso: { bg: '#EAF3DE', border: '#97C459', text: '#27500A' },
  egreso:  { bg: '#FCEBEB', border: '#F09595', text: '#791F1F' },
  deuda:   { bg: '#FAEEDA', border: '#EF9F27', text: '#633806' },
}

// ── Componente calendario semanal ─────────────────────────────────────────────
function CalendarioSemanal({
  saldoBase, items, onItemsChange, mesBase, añoBase,
}: {
  saldoBase: number
  items: SimItem[]
  onItemsChange: (items: SimItem[]) => void
  mesBase: number
  añoBase: number
}) {
  const [weekOffset, setWeekOffset]   = useState(0)
  const [showModal, setShowModal]     = useState(false)
  const [newLabel, setNewLabel]       = useState('')
  const [newMonto, setNewMonto]       = useState('')
  const [newTipo, setNewTipo]         = useState<'ingreso'|'egreso'|'deuda'>('egreso')
  const [newDia, setNewDia]           = useState<string>('')
  const dragId   = useRef<number|null>(null)
  const nextId   = useRef(100)

  // Semana activa
  const weekDates = useMemo(() => {
    const d = new Date(añoBase, mesBase, 1)
    const dow = d.getDay() || 7
    d.setDate(d.getDate() - dow + 1 + weekOffset * 7)
    return Array.from({ length: 7 }, (_, i) => {
      const dd = new Date(d); dd.setDate(d.getDate() + i); return dd
    })
  }, [weekOffset, mesBase, añoBase])

  const weekLabel = `${weekDates[0].getDate()}/${weekDates[0].getMonth()+1} — ${weekDates[6].getDate()}/${weekDates[6].getMonth()+1}`

  // Días del mes que corresponden a esta semana
  const diasSemana = weekDates.map(d =>
    d.getMonth() === mesBase ? d.getDate() : null
  )

  // Saldo acumulado día a día para esta semana
  const saldosDia = useMemo(() => {
    let s = saldoBase
    return diasSemana.map(dia => {
      if (dia === null) return { saldo: s, entrada: 0, salida: 0 }
      const evs = items.filter(i => i.dia === dia)
      let entrada = 0, salida = 0
      evs.forEach(e => { if (e.tipo === 'ingreso') entrada += e.monto; else salida += e.monto })
      s = s + entrada - salida
      return { saldo: s, entrada, salida }
    })
  }, [items, diasSemana, saldoBase])

  const fmtM = (n: number) => {
    if (Math.abs(n) >= 1000000) return '$' + (n/1000000).toFixed(1) + 'M'
    if (Math.abs(n) >= 1000) return '$' + Math.round(n/1000) + 'k'
    return '$' + n
  }

  const handleDragStart = (id: number) => { dragId.current = id }

  const handleDrop = (dia: number | null) => {
    if (dragId.current === null) return
    onItemsChange(items.map(i => i.id === dragId.current ? { ...i, dia } : i))
    dragId.current = null
  }

  const removeItem = (id: number) => onItemsChange(items.filter(i => i.id !== id))

  const addItem = () => {
    const monto = parseFloat(newMonto.replace(/\./g, '').replace(',', '.'))
    if (!newLabel || isNaN(monto)) return
    onItemsChange([...items, {
      id: nextId.current++,
      label: newLabel, monto, tipo: newTipo,
      dia: newDia ? parseInt(newDia) : null,
    }])
    setNewLabel(''); setNewMonto(''); setNewDia(''); setShowModal(false)
  }

  const unscheduled = items.filter(i => i.dia === null)
  const maxBar = Math.max(...saldosDia.map(s => Math.max(s.entrada, s.salida)), 1)

  return (
    <Card className="mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-slate-900 font-semibold text-[15px]">Simulador semanal</div>
          <div className="text-slate-400 text-xs mt-0.5">Arrastrá los items para ver cómo cambia tu saldo día a día</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekOffset(w => w-1)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 bg-white cursor-pointer text-sm">‹</button>
          <span className="text-xs font-medium text-slate-600 min-w-[120px] text-center">{weekLabel}</span>
          <button onClick={() => setWeekOffset(w => w+1)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 bg-white cursor-pointer text-sm">›</button>
          <button onClick={() => setShowModal(true)}
            className="ml-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-medium border-none cursor-pointer hover:opacity-90">
            + Agregar item
          </button>
        </div>
      </div>

      {/* Grilla de saldos */}
      <div className="grid grid-cols-7 gap-2 mb-2">
        {diasSemana.map((dia, i) => {
          const s = saldosDia[i]
          const isToday = dia !== null && dia === HOY.getDate() && mesBase === HOY.getMonth() && añoBase === HOY.getFullYear()
          return (
            <div key={i} className={`rounded-xl border px-2 py-1.5 text-center ${isToday ? 'border-blue-400 bg-blue-50' : 'border-slate-100 bg-slate-50'}`}>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">{DAYS_SHORT[i]}</div>
              <div className={`text-sm font-medium ${dia === null ? 'text-slate-300' : 'text-slate-700'}`}>{dia ?? '—'}</div>
              <div className={`text-[10px] font-mono font-bold mt-0.5 ${s.saldo >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                {fmtM(s.saldo)}
              </div>
            </div>
          )
        })}
      </div>

      {/* Columnas drag & drop */}
      <div className="grid grid-cols-7 gap-2 mb-3">
        {diasSemana.map((dia, i) => {
          const evs = dia !== null ? items.filter(it => it.dia === dia) : []
          return (
            <div key={i}
              className="min-h-[80px] rounded-xl border border-dashed border-slate-200 p-1.5 flex flex-col gap-1.5 transition-colors"
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = '#EFF6FF'; e.currentTarget.style.borderColor = '#3B82F6' }}
              onDragLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = '' }}
              onDrop={e => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = ''; handleDrop(dia) }}>
              {evs.map(ev => {
                const st = CHIP_STYLE[ev.tipo]
                return (
                  <div key={ev.id} draggable
                    onDragStart={() => handleDragStart(ev.id)}
                    className="rounded-lg px-2 py-1.5 cursor-grab text-[11px] relative group"
                    style={{ background: st.bg, border: `0.5px solid ${st.border}`, color: st.text }}>
                    <button
                      onClick={() => removeItem(ev.id)}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border-none text-[10px] font-bold"
                      style={{ background: st.border, color: '#fff' }}>×</button>
                    <div className="font-medium leading-tight pr-3 truncate">{ev.label}</div>
                    <div className="font-mono text-[10px] mt-0.5 opacity-80">
                      {ev.tipo === 'ingreso' ? '+' : '-'}{fmtM(ev.monto)}
                    </div>
                  </div>
                )
              })}
              {dia === null || evs.length === 0 && (
                <div className="text-[10px] text-slate-300 text-center mt-2 select-none">
                  {dia !== null ? 'Soltá acá' : ''}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Mini barras entradas/salidas */}
      <div className="grid grid-cols-7 gap-2 mb-4">
        {saldosDia.map((s, i) => {
          const hi = Math.round(s.entrada / maxBar * 28)
          const ho = Math.round(s.salida  / maxBar * 28)
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="flex items-end gap-0.5 h-7">
                {s.entrada > 0 && <div className="w-2 rounded-sm" style={{ height: hi, background: '#86efac' }} />}
                {s.salida  > 0 && <div className="w-2 rounded-sm" style={{ height: ho, background: '#fca5a5' }} />}
              </div>
            </div>
          )
        })}
      </div>

      {/* Zona sin fecha */}
      <div className="border border-dashed border-slate-200 rounded-xl p-3">
        <div className="text-[11px] text-slate-400 mb-2">Sin fecha — arrastrá al día que quieras</div>
        <div className="flex flex-wrap gap-2 min-h-[28px]"
          onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = '#F8FAFC' }}
          onDragLeave={e => { e.currentTarget.style.background = '' }}
          onDrop={e => { e.currentTarget.style.background = ''; handleDrop(null) }}>
          {unscheduled.length === 0 && (
            <span className="text-[11px] text-slate-300 self-center">Todos los items tienen fecha asignada</span>
          )}
          {unscheduled.map(ev => {
            const st = CHIP_STYLE[ev.tipo]
            return (
              <div key={ev.id} draggable
                onDragStart={() => handleDragStart(ev.id)}
                className="rounded-lg px-2 py-1.5 cursor-grab text-[11px] flex items-center gap-2 relative group"
                style={{ background: st.bg, border: `0.5px solid ${st.border}`, color: st.text }}>
                <span className="font-medium">{ev.label}</span>
                <span className="font-mono text-[10px] opacity-80">{ev.tipo === 'ingreso' ? '+' : '-'}{fmtM(ev.monto)}</span>
                <button
                  onClick={() => removeItem(ev.id)}
                  className="w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border-none text-[10px] font-bold ml-1"
                  style={{ background: st.border, color: '#fff' }}>×</button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex gap-4 mt-3 flex-wrap">
        {[['ingreso','Ingreso'],['egreso','Egreso'],['deuda','Deuda/vencimiento']].map(([tipo, label]) => {
          const st = CHIP_STYLE[tipo]
          return (
            <div key={tipo} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm" style={{ background: st.border }} />
              <span className="text-[11px] text-slate-400">{label}</span>
            </div>
          )
        })}
        <span className="text-[11px] text-slate-300 ml-auto">Solo simulación — no se guarda</span>
      </div>

      {/* Modal agregar item */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Agregar item de simulación">
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Descripción</FieldLabel>
            <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Ej: Pago expensas" className="input-field" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Monto</FieldLabel>
              <input value={newMonto} onChange={e => setNewMonto(e.target.value)} placeholder="0" className="input-field font-mono" />
            </div>
            <div><FieldLabel>Tipo</FieldLabel>
              <select value={newTipo} onChange={e => setNewTipo(e.target.value as 'ingreso'|'egreso'|'deuda')} className="input-field">
                <option value="egreso">Egreso</option>
                <option value="ingreso">Ingreso</option>
                <option value="deuda">Deuda / vencimiento</option>
              </select>
            </div>
          </div>
          <div><FieldLabel>Día del mes (opcional)</FieldLabel>
            <input type="number" min="1" max="31" value={newDia} onChange={e => setNewDia(e.target.value)}
              placeholder="Sin fecha — lo asignás arrastrando" className="input-field" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={addItem} disabled={!newLabel || !newMonto} className="btn-primary flex-1 disabled:opacity-50">Agregar</button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function CashFlowPage() {
  const { monedaPrincipal: m } = useAppStore()
  const [mes, setMes] = useState(HOY.getMonth())
  const [año, setAño] = useState(HOY.getFullYear())
  const [simItems, setSimItems] = useState<SimItem[]>([])

  const { data: eventos,  loading: le } = useEventosMes(año, mes + 1)
  const { data: ingresos, loading: li } = useIngresos()
  const { data: egresos,  loading: lx } = useEgresos()
  const { data: deudas,   loading: ld } = useDeudas()

  const diasEnMes = new Date(año, mes + 1, 0).getDate()
  const mesNum    = mes + 1

  const saldoInicial = useMemo(() => {
    const totalIngresos = (ingresos ?? []).filter(i => i.mes === mesNum).reduce((s, i) => s + i.monto, 0)
    const totalEgresos  = (egresos  ?? []).filter(e => e.mes === mesNum).reduce((s, e) => s + e.monto, 0)
    const totalDeudas   = (deudas   ?? []).filter(d => {
      if (!d.fecha_vencimiento) return false
      const fv = new Date(d.fecha_vencimiento)
      return fv.getFullYear() === año && (fv.getMonth() + 1) === mesNum
    }).reduce((s, d) => s + (d.cuota_mensual ?? 0), 0)
    return totalIngresos - totalEgresos - totalDeudas
  }, [ingresos, egresos, deudas, mesNum, año])

  const flowData = useMemo(() =>
    proyectarCashFlow(saldoInicial, eventos ?? [], diasEnMes)
  , [saldoInicial, eventos, diasEnMes])

  const navMes = (dir: number) => {
    let m2 = mes + dir, a2 = año
    if (m2 < 0) { m2 = 11; a2-- } else if (m2 > 11) { m2 = 0; a2++ }
    setMes(m2); setAño(a2)
  }

  const saldoFin   = flowData[flowData.length - 1]?.saldo ?? 0
  const minDia     = flowData.reduce((a, b) => a.saldo < b.saldo ? a : b, flowData[0] ?? { saldo: 0, dia: 0 })
  const dispDia    = Math.max(0, Math.round(saldoFin / diasEnMes))
  const diasConEvs = flowData.filter(d => d.eventos.length > 0)

  const totalIngresos = (ingresos ?? []).filter(i => i.mes === mesNum).reduce((s, i) => s + i.monto, 0)
  const totalEgresos  = (egresos  ?? []).filter(e => e.mes === mesNum).reduce((s, e) => s + e.monto, 0)
  const totalDeudas   = (deudas   ?? []).filter(d => {
    if (!d.fecha_vencimiento) return false
    const fv = new Date(d.fecha_vencimiento)
    return fv.getFullYear() === año && (fv.getMonth() + 1) === mesNum
  }).reduce((s, d) => s + (d.cuota_mensual ?? 0), 0)

  if (le || li || lx || ld) return <LoadingSpinner />

  return (
    <div>
      <PageHeader
        title="Cash Flow Diario"
        subtitle="Tu disponibilidad día a día — cuándo conviene gastar"
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => navMes(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 bg-white cursor-pointer">‹</button>
            <span className="font-semibold text-slate-900 min-w-[140px] text-center">{MESES[mes]} {año}</span>
            <button onClick={() => navMes(1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 bg-white cursor-pointer">›</button>
          </div>
        }
      />

      {/* ── Calendario simulador ── */}
      <CalendarioSemanal
        saldoBase={saldoInicial}
        items={simItems}
        onItemsChange={setSimItems}
        mesBase={mes}
        añoBase={año}
      />

      {/* ── Banner saldo calculado ── */}
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 mb-6 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-slate-500 text-sm font-medium">Saldo disponible calculado para</span>
          <span className="text-slate-900 font-semibold text-sm">{MESES[mes]} {año}</span>
          <span className="text-xs text-slate-400 ml-1">— basado en tus datos reales</span>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
            <span className="text-slate-500 text-xs">Ingresos del mes</span>
            <span className="text-emerald-700 font-mono font-bold text-sm">+{fmt(totalIngresos, m)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
            <span className="text-slate-500 text-xs">Egresos del mes</span>
            <span className="text-red-600 font-mono font-bold text-sm">-{fmt(totalEgresos, m)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
            <span className="text-slate-500 text-xs">Deudas vencen este mes</span>
            <span className="text-amber-700 font-mono font-bold text-sm">-{fmt(totalDeudas, m)}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-slate-400 text-xs">Saldo inicial =</span>
            <span className={`text-2xl font-bold font-mono ${saldoInicial >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
              {fmt(saldoInicial, m)}
            </span>
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { l: 'Saldo inicial',          v: fmt(saldoInicial, m), s: 'Ingresos − Egresos − Deudas',    c: saldoInicial >= 0 ? '#1A5E9E' : '#C0392B' },
          { l: 'Saldo estimado fin mes', v: fmt(saldoFin, m),     s: 'Proyección con eventos del mes', c: saldoFin >= 0 ? '#1A5E9E' : '#C0392B' },
          { l: 'Punto más bajo',         v: fmt(minDia?.saldo ?? 0, m), s: `Día ${minDia?.dia ?? '-'} — tené cuidado`, c: (minDia?.saldo ?? 0) >= 0 ? '#E8A020' : '#C0392B' },
          { l: 'Gasto diario sugerido',  v: fmt(dispDia, m),      s: 'Para llegar bien al mes',        c: '#2D7D2D' },
        ].map(k => (
          <div key={k.l} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card">
            <div className="label mb-1">{k.l}</div>
            <div className="text-2xl font-bold font-mono" style={{ color: k.c }}>{k.v}</div>
            <div className="text-slate-400 text-xs mt-1">{k.s}</div>
          </div>
        ))}
      </div>

      {/* ── Gráfico saldo acumulado ── */}
      <Card className="mb-5">
        <CardTitle>Saldo disponible acumulado</CardTitle>
        <p className="text-slate-400 text-xs mb-4">Línea azul = zona cómoda · Rojo = déficit · Los puntos marcan días con movimientos</p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={flowData} margin={{ top: 5, right: 10, bottom: 0, left: 10 }}>
            <defs>
              <linearGradient id="gPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#1A5E9E" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#1A5E9E" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="dia" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false}
              tickFormatter={v => v % 5 === 0 || v === 1 ? String(v) : ''} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => fmt(v, m)} />
            <Tooltip contentStyle={TT} formatter={(v: number) => [fmt(v, m), 'Saldo']} labelFormatter={l => `Día ${l}`} />
            <ReferenceLine y={0} stroke="#C0392B" strokeDasharray="4 3" strokeWidth={1.5} />
            <Area type="monotone" dataKey="saldo" stroke="#1A5E9E" fill="url(#gPos)" strokeWidth={2.5}
              dot={(p: any) => p.payload.eventos?.length > 0
                ? <circle key={p.key} cx={p.cx} cy={p.cy} r={4} fill={p.payload.saldo < 0 ? '#C0392B' : '#1A5E9E'} stroke="#fff" strokeWidth={2} />
                : <g key={p.key} />} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* ── Gráfico entradas/salidas ── */}
      <Card className="mb-5">
        <CardTitle>Entradas y salidas por día</CardTitle>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={flowData} barCategoryGap="20%" barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="dia" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false}
              tickFormatter={v => v % 5 === 0 || v === 1 ? String(v) : ''} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => fmt(v, m)} />
            <Tooltip contentStyle={TT} formatter={(v: number, n: string) => [fmt(v, m), n === 'entradas' ? 'Entradas' : 'Salidas']} labelFormatter={l => `Día ${l}`} />
            <Bar dataKey="entradas" name="entradas" fill="#86efac" radius={0} maxBarSize={16} />
            <Bar dataKey="salidas"  name="salidas"  fill="#fca5a5" radius={0} maxBarSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* ── Días con movimientos ── */}
      {diasConEvs.length > 0 && (
        <div>
          <div className="text-slate-900 font-semibold text-[15px] mb-4">Días con movimientos</div>
          <div className="grid grid-cols-3 gap-4">
            {diasConEvs.map(d => {
              const isHoy = d.dia === HOY.getDate() && mes === HOY.getMonth() && año === HOY.getFullYear()
              const isNeg = d.saldo < 0
              const saldoC = isNeg ? '#C0392B' : d.saldo < saldoInicial * 0.3 ? '#E8A020' : '#1A5E9E'
              const badge = isHoy ? { l: 'hoy', bg: '#1A5E9E', c: '#fff' }
                          : isNeg ? { l: 'déficit', bg: '#FEF2F2', c: '#C0392B' }
                          : d.entradas > d.salidas ? { l: 'cobro', bg: '#EAF3DE', c: '#2D7D2D' }
                          : { l: 'pago', bg: '#FEF2F2', c: '#C0392B' }
              return (
                <div key={d.dia} className={`bg-white border rounded-2xl p-5 shadow-card ${isHoy ? 'border-blue-200 bg-blue-50/30' : isNeg ? 'border-red-100' : 'border-slate-200'}`}>
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold font-mono text-slate-900">Día {d.dia}</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: badge.bg, color: badge.c }}>{badge.l}</span>
                    </div>
                    <span className="text-lg font-bold font-mono" style={{ color: saldoC }}>{fmt(d.saldo, m)}</span>
                  </div>
                  <div className="flex flex-col gap-1.5 mb-3">
                    {d.eventos.map(ev => (
                      <div key={ev.id} className="flex justify-between items-center">
                        <span className="text-slate-500 text-xs truncate max-w-[160px]">
                          {ev.tipo === 'ingreso' ? '↑' : '↓'} {ev.descripcion}
                        </span>
                        <span className={`text-xs font-mono font-bold flex-shrink-0 ${ev.tipo === 'ingreso' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {ev.tipo === 'ingreso' ? '+' : '-'}{ev.monto ? fmt(ev.monto, m) : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between pt-2.5 border-t border-slate-100">
                    <span className="text-slate-400 text-xs">Neto del día</span>
                    <span className={`text-xs font-mono font-bold ${d.neto >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {d.neto >= 0 ? '+' : ''}{fmt(d.neto, m)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {diasConEvs.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-card">
          <div className="text-4xl mb-3">📅</div>
          <div className="text-slate-700 font-semibold">Sin eventos este mes</div>
          <div className="text-slate-400 text-sm mt-1">Agregá eventos en el módulo de Deudas → Calendario</div>
        </div>
      )}
    </div>
  )
}
