'use client'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAppStore } from '@/store/appStore'
import {
  useEventosMes, useIngresosByAño, useEgresosByAño, useSaldoRealHistorico,
  useCashflowSimItems,
} from '@/hooks'
import {
  createCashflowSimItem, updateCashflowSimItem, deleteCashflowSimItem, upsertCashflowResumen,
} from '@/lib/queries'
import { fmt } from '@/lib/utils/formatters'
import { MESES } from '@/lib/utils/constants'
import { PageHeader, Card, CardTitle, LoadingSpinner, Modal, FieldLabel, ChartToggle } from '@/components/ui'
import MontoInput from '@/components/ui/MontoInput'
import { proyectarCashFlowMes, type DiaFlowDetallado } from '@/lib/utils/calculations'
import type { CashflowSimItem } from '@/types'

const TT  = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, color:'#0f172a' }
const HOY = new Date()
const DAYS_SHORT = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

const VISTAS = [
  { value: 'semana',   label: 'Semana' },
  { value: 'quincena', label: 'Quincena' },
  { value: 'mes',      label: 'Mes' },
]
type Vista = 'semana' | 'quincena' | 'mes'

const fmtM = (n: number) => {
  if (Math.abs(n) >= 1000000) return '$' + (n/1000000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1000) return '$' + Math.round(n/1000) + 'k'
  return '$' + Math.round(n)
}

const weekdayShort = (año: number, mes: number, dia: number) => {
  const dow = new Date(año, mes, dia).getDay() || 7
  return DAYS_SHORT[dow - 1]
}

// ── Calendario del simulador — semana / quincena / mes ────────────────────────
function CalendarioCashflow({
  flowData, simItems, mesBase, añoBase, diasEnMes,
  onAddSupuesto, onToggleChecked, onDeleteSupuesto, onMoveSupuesto,
}: {
  flowData: DiaFlowDetallado[]
  simItems: CashflowSimItem[]
  mesBase: number
  añoBase: number
  diasEnMes: number
  onAddSupuesto: (desc: string, monto: number, tipo: 'ingreso'|'egreso', dia: number|null) => void
  onToggleChecked: (id: string, checked: boolean) => void
  onDeleteSupuesto: (id: string) => void
  onMoveSupuesto: (id: string, dia: number|null) => void
}) {
  const [vista, setVista]     = useState<Vista>('semana')
  const [offset, setOffset]   = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [newLabel, setNewLabel]   = useState('')
  const [newMonto, setNewMonto]   = useState('')
  const [newTipo, setNewTipo]     = useState<'ingreso'|'egreso'>('egreso')
  const [newDia, setNewDia]       = useState('')
  const dragId = useRef<string|null>(null)

  useEffect(() => { setOffset(0) }, [vista, mesBase, añoBase])

  const dayList: (number|null)[] = useMemo(() => {
    if (vista === 'semana') {
      const d = new Date(añoBase, mesBase, 1)
      const dow = d.getDay() || 7
      d.setDate(d.getDate() - dow + 1 + offset * 7)
      return Array.from({ length: 7 }, (_, i) => {
        const dd = new Date(d); dd.setDate(d.getDate() + i)
        return (dd.getMonth() === mesBase && dd.getFullYear() === añoBase) ? dd.getDate() : null
      })
    }
    if (vista === 'quincena') {
      const start = 1 + offset * 14
      return Array.from({ length: 14 }, (_, i) => {
        const dia = start + i
        return (dia >= 1 && dia <= diasEnMes) ? dia : null
      })
    }
    return Array.from({ length: diasEnMes }, (_, i) => i + 1)
  }, [vista, offset, mesBase, añoBase, diasEnMes])

  const rangoLabel = useMemo(() => {
    const dias = dayList.filter((d): d is number => d !== null)
    if (dias.length === 0) return '—'
    if (vista === 'mes') return `${MESES[mesBase]} ${añoBase}`
    return `${dias[0]}/${mesBase+1} — ${dias[dias.length-1]}/${mesBase+1}`
  }, [dayList, vista, mesBase, añoBase])

  const puedeNavegar = vista !== 'mes'

  const handleDrop = (dia: number | null) => {
    if (dragId.current === null) return
    onMoveSupuesto(dragId.current, dia)
    dragId.current = null
  }

  const addSupuesto = () => {
    const monto = parseFloat(newMonto)
    if (!newLabel || isNaN(monto)) return
    onAddSupuesto(newLabel, monto, newTipo, newDia ? parseInt(newDia) : null)
    setNewLabel(''); setNewMonto(''); setNewDia(''); setShowModal(false)
  }

  const unscheduled = simItems.filter(i => i.dia === null)
  const gridCols = vista === 'semana' ? 7 : 7

  // saldo simulado (real + pendiente + supuestos) al final del rango visible
  const saldoSimuladoFinRango = useMemo(() => {
    const dias = dayList.filter((d): d is number => d !== null)
    if (dias.length === 0) return 0
    const ultimoDia = dias[dias.length - 1]
    const base = flowData[ultimoDia - 1]?.saldo ?? 0
    const supuestosHastaAca = simItems
      .filter(s => s.dia !== null && s.dia <= ultimoDia)
      .reduce((acc, s) => acc + (s.tipo === 'ingreso' ? s.monto : -s.monto), 0)
    return base + supuestosHastaAca
  }, [dayList, flowData, simItems])

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="text-slate-900 font-semibold text-[15px]">Simulador</div>
          <div className="text-slate-400 text-xs mt-0.5">Arrastrá los supuestos para ver cómo cambia tu saldo día a día</div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <ChartToggle options={VISTAS} value={vista} onChange={v => setVista(v as Vista)} />
          <div className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-blue-50 border-blue-200 text-blue-700">
            Con supuestos: {fmt(saldoSimuladoFinRango, 'ARS')}
          </div>
          {puedeNavegar && (
            <div className="flex items-center gap-2">
              <button onClick={() => setOffset(o => o-1)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 bg-white cursor-pointer text-sm">‹</button>
              <span className="text-xs font-medium text-slate-600 min-w-[110px] text-center">{rangoLabel}</span>
              <button onClick={() => setOffset(o => o+1)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 bg-white cursor-pointer text-sm">›</button>
            </div>
          )}
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-medium border-none cursor-pointer hover:opacity-90">
            + Agregar supuesto
          </button>
        </div>
      </div>

      <div className="overflow-x-auto -mx-1 px-1 pb-1">
      <div className={vista === 'mes' ? 'min-w-[820px]' : 'min-w-[560px]'}>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0,1fr))` }}>
        {dayList.map((dia, i) => {
          const dFlow = dia !== null ? flowData[dia - 1] : null
          const isToday = dia !== null && dia === HOY.getDate() && mesBase === HOY.getMonth() && añoBase === HOY.getFullYear()
          const supuestosDia = dia !== null ? simItems.filter(s => s.dia === dia) : []
          const label = dia !== null ? weekdayShort(añoBase, mesBase, dia) : ''
          return (
            <div key={i}
              className={`min-h-[120px] rounded-xl border p-1.5 flex flex-col gap-1.5 transition-colors ${isToday ? 'border-blue-400 bg-blue-50' : 'border-dashed border-slate-200'}`}
              onDragOver={e => { if (dia !== null) { e.preventDefault(); e.currentTarget.style.background = '#EFF6FF' } }}
              onDragLeave={e => { e.currentTarget.style.background = '' }}
              onDrop={e => { e.currentTarget.style.background = ''; if (dia !== null) handleDrop(dia) }}>
              {dia !== null && (
                <div className="text-center">
                  <div className="text-[9px] text-slate-400 uppercase tracking-wider">{label}{isToday ? ' · hoy' : ''}</div>
                  <div className="text-[13px] font-semibold text-slate-700">{dia}</div>
                  <div className={`text-[10px] font-mono font-bold ${(dFlow?.saldo ?? 0) >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{fmtM(dFlow?.saldo ?? 0)}</div>
                </div>
              )}
              {/* Real */}
              {(dFlow?.movimientos ?? []).filter(m => m.origen === 'real').map(m => (
                <div key={`r-${m.id}`} className="rounded-lg px-2 py-1 text-[10px]" style={{ background:'#E6F1FB', border:'0.5px solid #85B7EB', color:'#0C447C' }}>
                  <div className="font-medium leading-tight truncate">{m.descripcion}</div>
                  <div className="font-mono mt-0.5 opacity-80">{m.tipo === 'ingreso' ? '+' : '-'}{fmtM(m.monto)}</div>
                </div>
              ))}
              {/* Pendiente */}
              {(dFlow?.movimientos ?? []).filter(m => m.origen === 'pendiente').map(m => (
                <div key={`p-${m.id}`} className="rounded-lg px-2 py-1 text-[10px] relative" style={{ background:'#FAEEDA', border:'0.5px solid #EF9F27', color:'#633806' }}>
                  <span className="absolute top-0.5 right-0.5 text-[8px] font-bold px-1 rounded" style={{ background:'#EF9F27', color:'#fff' }}>venc.</span>
                  <div className="font-medium leading-tight truncate pr-6">{m.descripcion}</div>
                  <div className="font-mono mt-0.5 opacity-80">{m.tipo === 'ingreso' ? '+' : '-'}{fmtM(m.monto)}</div>
                </div>
              ))}
              {/* Supuestos */}
              {supuestosDia.map(s => (
                <div key={s.id} draggable={!s.checked}
                  onDragStart={() => { dragId.current = s.id }}
                  className={`rounded-lg px-2 py-1 text-[10px] relative group flex items-start gap-1.5 ${s.checked ? '' : 'cursor-grab'}`}
                  style={{ background:'#fff', border: `1px dashed ${s.checked ? '#94A3B8' : '#A9A29C'}`, color:'#475569' }}>
                  <input type="checkbox" checked={s.checked} onChange={() => onToggleChecked(s.id, !s.checked)}
                    className="mt-0.5 w-[11px] h-[11px] flex-shrink-0 cursor-pointer" />
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium leading-tight truncate ${s.checked ? 'line-through opacity-60' : ''}`}>{s.descripcion}</div>
                    <div className="font-mono mt-0.5 opacity-80">{s.tipo === 'ingreso' ? '+' : '-'}{fmtM(s.monto)}</div>
                  </div>
                  <button onClick={() => onDeleteSupuesto(s.id)}
                    className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border-none text-[9px] font-bold"
                    style={{ background:'#94A3B8', color:'#fff' }}>×</button>
                </div>
              ))}
            </div>
          )
        })}
      </div>
      </div>
      </div>

      {/* Zona sin fecha */}
      <div className="border border-dashed border-slate-200 rounded-xl p-3 mt-3">
        <div className="text-[11px] text-slate-400 mb-2">Supuestos sin fecha — arrastrá al día que quieras</div>
        <div className="flex flex-wrap gap-2 min-h-[28px]"
          onDragOver={e => e.preventDefault()}
          onDrop={() => handleDrop(null)}>
          {unscheduled.length === 0 && <span className="text-[11px] text-slate-300 self-center">Todos los supuestos tienen fecha asignada</span>}
          {unscheduled.map(s => (
            <div key={s.id} draggable={!s.checked}
              onDragStart={() => { dragId.current = s.id }}
              className="rounded-lg px-2 py-1.5 text-[11px] flex items-center gap-2 relative group"
              style={{ background:'#fff', border:'1px dashed #A9A29C', color:'#475569', cursor: s.checked ? 'default' : 'grab' }}>
              <input type="checkbox" checked={s.checked} onChange={() => onToggleChecked(s.id, !s.checked)} className="w-[10px] h-[10px] cursor-pointer" />
              <span className={`font-medium ${s.checked ? 'line-through opacity-60' : ''}`}>{s.descripcion}</span>
              <span className="font-mono text-[10px] opacity-80">{s.tipo === 'ingreso' ? '+' : '-'}{fmtM(s.monto)}</span>
              <button onClick={() => onDeleteSupuesto(s.id)}
                className="w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border-none text-[10px] font-bold ml-1"
                style={{ background:'#94A3B8', color:'#fff' }}>×</button>
            </div>
          ))}
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex gap-4 mt-3 flex-wrap">
        {[['Real','#1A5E9E'],['Pendiente (vencimiento)','#EF9F27'],['Supuesto','#A9A29C']].map(([label, color]) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{ background: color }} />
            <span className="text-[11px] text-slate-400">{label}</span>
          </div>
        ))}
        <span className="text-[11px] text-slate-300 ml-auto">Los supuestos se guardan solo para este mes</span>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Agregar supuesto">
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Descripción</FieldLabel>
            <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Ej: Pago expensas" className="input-field" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Monto</FieldLabel>
              <MontoInput value={newMonto} onChange={raw => setNewMonto(raw)} placeholder="0" />
            </div>
            <div><FieldLabel>Tipo</FieldLabel>
              <select value={newTipo} onChange={e => setNewTipo(e.target.value as 'ingreso'|'egreso')} className="input-field">
                <option value="egreso">Egreso</option>
                <option value="ingreso">Ingreso</option>
              </select>
            </div>
          </div>
          <div><FieldLabel>Día del mes (opcional)</FieldLabel>
            <input type="number" min="1" max="31" value={newDia} onChange={e => setNewDia(e.target.value)}
              placeholder="Sin fecha — lo asignás arrastrando" className="input-field" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={addSupuesto} disabled={!newLabel || !newMonto} className="btn-primary flex-1 disabled:opacity-50">Agregar</button>
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
  const mesNum = mes + 1
  const diasEnMes = new Date(año, mes + 1, 0).getDate()
  const primerDiaMes = `${año}-${String(mesNum).padStart(2, '0')}-01`

  const { data: eventos,  loading: le } = useEventosMes(año, mesNum)
  const { data: ingresosAño, loading: li } = useIngresosByAño(año)
  const { data: egresosAño,  loading: lx } = useEgresosByAño(año)
  const { data: saldoInicioMes, loading: ls } = useSaldoRealHistorico(m, primerDiaMes)
  const { data: simItemsRaw, loading: lsim, refetch: refSim } = useCashflowSimItems(año, mesNum)

  const ingresosDelMes = useMemo(() => (ingresosAño ?? []).filter(i => i.mes === mesNum && i.moneda === m), [ingresosAño, mesNum, m])
  const egresosDelMes  = useMemo(() => (egresosAño  ?? []).filter(e => e.mes === mesNum && e.moneda === m), [egresosAño, mesNum, m])
  const eventosPendientes = useMemo(() => (eventos ?? []).filter(ev => !ev.pagado), [eventos])
  const simItems = simItemsRaw ?? []

  const flowData = useMemo(() =>
    proyectarCashFlowMes(saldoInicioMes ?? 0, eventosPendientes, ingresosDelMes, egresosDelMes, diasEnMes)
  , [saldoInicioMes, eventosPendientes, ingresosDelMes, egresosDelMes, diasEnMes])

  const navMes = (dir: number) => {
    let m2 = mes + dir, a2 = año
    if (m2 < 0) { m2 = 11; a2-- } else if (m2 > 11) { m2 = 0; a2++ }
    setMes(m2); setAño(a2)
  }

  const saldoFin   = flowData[flowData.length - 1]?.saldo ?? 0
  const minDia     = flowData.reduce((a, b) => a.saldo < b.saldo ? a : b, flowData[0] ?? { saldo: 0, dia: 0 })
  const diasConEvs = flowData.filter(d => d.movimientos.length > 0)

  const diaHoy = (mes === HOY.getMonth() && año === HOY.getFullYear()) ? HOY.getDate() : 1
  const diasRestantes = Math.max(1, diasEnMes - diaHoy)
  const saldoHoy = flowData.find(d => d.dia === diaHoy)?.saldo ?? (saldoInicioMes ?? 0)
  const pagosRestantes = flowData
    .filter(d => d.dia > diaHoy)
    .reduce((s, d) => s + d.movimientos.filter(mv => mv.tipo === 'egreso').reduce((s2, mv) => s2 + mv.monto, 0), 0)
  const gastoDiarioDisp = Math.round((saldoHoy - pagosRestantes) / diasRestantes)

  const totalIngresos   = ingresosDelMes.reduce((s, i) => s + i.monto, 0)
  const totalPendientes = eventosPendientes.filter(ev => ev.tipo !== 'ingreso' && ev.monto).reduce((s, ev) => s + (ev.monto ?? 0), 0)

  // saldo simulado fin de mes incluyendo supuestos (checked o no, todos cuentan)
  const totalSupuestosNeto = simItems.reduce((s, i) => s + (i.tipo === 'ingreso' ? i.monto : -i.monto), 0)
  const saldoFinSimulado = saldoFin + totalSupuestosNeto
  const ahorroEstimado = saldoFinSimulado - (saldoInicioMes ?? 0)

  // Persistir resumen histórico del mes (debounced) — sobrevive aunque se limpien los
  // supuestos de este mes al pasar al siguiente.
  useEffect(() => {
    if (saldoInicioMes === null || saldoInicioMes === undefined) return
    const t = setTimeout(() => {
      upsertCashflowResumen({
        año, mes: mesNum, moneda: m,
        saldo_inicio_mes: saldoInicioMes,
        saldo_fin_proyectado: saldoFinSimulado,
        gasto_diario_disponible: gastoDiarioDisp,
        ahorro_estimado: ahorroEstimado,
      }).catch(() => {})
    }, 800)
    return () => clearTimeout(t)
  }, [año, mesNum, m, saldoInicioMes, saldoFinSimulado, gastoDiarioDisp, ahorroEstimado])

  const handleAddSupuesto = useCallback(async (desc: string, monto: number, tipo: 'ingreso'|'egreso', dia: number|null) => {
    await createCashflowSimItem({ año, mes: mesNum, dia, descripcion: desc, monto, moneda: m, tipo, checked: false })
    refSim()
  }, [año, mesNum, m, refSim])

  const handleToggleChecked = useCallback(async (id: string, checked: boolean) => {
    await updateCashflowSimItem(id, { checked })
    refSim()
  }, [refSim])

  const handleDeleteSupuesto = useCallback(async (id: string) => {
    await deleteCashflowSimItem(id)
    refSim()
  }, [refSim])

  const handleMoveSupuesto = useCallback(async (id: string, dia: number|null) => {
    await updateCashflowSimItem(id, { dia })
    refSim()
  }, [refSim])

  if ((le && !eventos) || (li && !ingresosAño) || (lx && !egresosAño) || ls || lsim) return <LoadingSpinner />

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

      <CalendarioCashflow
        flowData={flowData}
        simItems={simItems}
        mesBase={mes}
        añoBase={año}
        diasEnMes={diasEnMes}
        onAddSupuesto={handleAddSupuesto}
        onToggleChecked={handleToggleChecked}
        onDeleteSupuesto={handleDeleteSupuesto}
        onMoveSupuesto={handleMoveSupuesto}
      />

      {/* ── Banner saldo calculado ── */}
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 mb-6 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-slate-500 text-sm font-medium">Saldo real automático para</span>
          <span className="text-slate-900 font-semibold text-sm">{MESES[mes]} {año}</span>
          <span className="text-xs text-slate-400 ml-1">— calculado 100% desde Ingresos/Egresos, sin cargar nada a mano</span>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
            <span className="text-slate-500 text-xs">Ingresos del mes</span>
            <span className="text-emerald-700 font-mono font-bold text-sm">+{fmt(totalIngresos, m)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
            <span className="text-slate-500 text-xs">Pendientes (sin pagar aún)</span>
            <span className="text-amber-600 font-mono font-bold text-sm">-{fmt(totalPendientes, m)}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-slate-400 text-xs">Saldo al 1° del mes =</span>
            <span className={`text-2xl font-bold font-mono ${(saldoInicioMes ?? 0) >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
              {fmt(saldoInicioMes ?? 0, m)}
            </span>
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { l: 'Saldo al 1° del mes',    v: fmt(saldoInicioMes ?? 0, m), s: 'Ingresos − Egresos históricos', c: (saldoInicioMes ?? 0) >= 0 ? '#1A5E9E' : '#F54927' },
          { l: 'Saldo estimado fin mes', v: fmt(saldoFin, m),     s: 'Real + pendientes, sin supuestos', c: saldoFin >= 0 ? '#1A5E9E' : '#F54927' },
          { l: 'Punto más bajo',         v: fmt(minDia?.saldo ?? 0, m), s: `Día ${minDia?.dia ?? '-'} — tené cuidado`, c: (minDia?.saldo ?? 0) >= 0 ? '#E8A020' : '#F54927' },
          { l: 'Podés gastar por día',   v: gastoDiarioDisp >= 0 ? fmt(gastoDiarioDisp, m) : '⚠ Déficit', s: gastoDiarioDisp >= 0 ? `Balance libre ÷ ${diasRestantes} días restantes` : 'El mes está en déficit', c: gastoDiarioDisp >= 0 ? '#40B046' : '#F54927' },
        ].map(k => (
          <div key={k.l} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card">
            <div className="label mb-1">{k.l}</div>
            <div className="text-2xl font-bold font-mono" style={{ color: k.c }}>{k.v}</div>
            <div className="text-slate-400 text-xs mt-1">{k.s}</div>
          </div>
        ))}
      </div>

      {/* ── Con tus supuestos ── */}
      <Card className={`mb-5 ${saldoFinSimulado < 0 ? 'border border-red-200 bg-red-50/40' : 'border border-emerald-100 bg-emerald-50/30'}`}>
        <div className="flex flex-col md:flex-row items-start justify-between gap-6">
          <div className="flex-1">
            <CardTitle>Con tus supuestos, ¿cuánto te queda a fin de mes?</CardTitle>
            <p className="text-slate-400 text-xs mt-1 mb-4">
              Saldo real + pendientes + los supuestos que armaste en el simulador.
            </p>
            <div className="flex items-end gap-3">
              <div className={`text-4xl font-bold font-mono ${saldoFinSimulado >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(saldoFinSimulado, m)}</div>
              <div className="text-slate-500 text-sm mb-1">a fin de {MESES[mes].toLowerCase()}</div>
            </div>
          </div>
          <div className="flex flex-col gap-3 text-sm w-full md:w-auto md:min-w-[220px]">
            <div className="flex justify-between">
              <span className="text-slate-400">Saldo hoy (día {diaHoy})</span>
              <span className={`font-mono font-semibold ${saldoHoy >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{fmt(saldoHoy, m)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Pendientes restantes</span>
              <span className="font-mono font-semibold text-amber-600">−{fmt(pagosRestantes, m)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Supuestos (neto)</span>
              <span className={`font-mono font-semibold ${totalSupuestosNeto >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{totalSupuestosNeto >= 0 ? '+' : ''}{fmt(totalSupuestosNeto, m)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2">
              <span className="text-slate-400">Ahorro/variación del mes</span>
              <span className={`font-mono font-semibold ${ahorroEstimado >= 0 ? 'text-slate-800' : 'text-red-600'}`}>{fmt(ahorroEstimado, m)}</span>
            </div>
          </div>
        </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {diasConEvs.map(d => {
              const isHoy = d.dia === HOY.getDate() && mes === HOY.getMonth() && año === HOY.getFullYear()
              const isNeg = d.saldo < 0
              const saldoC = isNeg ? '#F54927' : d.saldo < (saldoInicioMes ?? 0) * 0.3 ? '#E8A020' : '#1A5E9E'
              const badge = isHoy ? { l: 'hoy', bg: '#1A5E9E', c: '#fff' }
                          : isNeg ? { l: 'déficit', bg: '#FEF2F2', c: '#F54927' }
                          : d.entradas > d.salidas ? { l: 'cobro', bg: '#E9F6EA', c: '#40B046' }
                          : { l: 'pago', bg: '#FEF2F2', c: '#F54927' }
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
                    {d.movimientos.map(mv => (
                      <div key={`${mv.origen}-${mv.id}`} className="flex justify-between items-center">
                        <span className="text-slate-500 text-xs truncate max-w-[160px]">
                          {mv.tipo === 'ingreso' ? '↑' : '↓'} {mv.descripcion}{mv.origen === 'pendiente' ? ' (pendiente)' : ''}
                        </span>
                        <span className={`text-xs font-mono font-bold flex-shrink-0 ${mv.tipo === 'ingreso' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {mv.tipo === 'ingreso' ? '+' : '-'}{fmt(mv.monto, m)}
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
          <div className="text-slate-700 font-semibold">Sin movimientos este mes</div>
          <div className="text-slate-400 text-sm mt-1">Cargá Ingresos/Egresos o agregá vencimientos en Deudas → Calendario</div>
        </div>
      )}
    </div>
  )
}
