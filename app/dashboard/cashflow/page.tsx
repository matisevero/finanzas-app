'use client'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAppStore } from '@/store/appStore'
import {
  useEventosMes, useIngresosByAño, useEgresosByAño, useCashflowSimItems,
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

let tmpIdSeq = 0
const tmpId = () => `tmp-${Date.now()}-${tmpIdSeq++}`

// Normalizado (mayúsculas + default 'ARS') para no perder movimientos por
// diferencias de casing o campo vacío al comparar monedas.
const normMoneda = (mo: string | null | undefined) => (mo || 'ARS').trim().toUpperCase()

// ── Chip — colapsado muestra solo el monto; un click lo expande mostrando la
// descripción completa (usa más espacio, empuja el resto de la fila). El hover
// sigue mostrando el title nativo incluso expandido, y arrastrar sigue moviendo
// el supuesto de día — el click de expandir no interfiere con eso porque el
// navegador ya distingue click de dragstart.
function Chip({
  monto, tipo, origen, descripcion, checked, expanded, onToggleExpand, onToggle, onMenu, draggable, onDragStart,
}: {
  monto: number
  tipo: 'ingreso' | 'egreso'
  origen: 'real' | 'pendiente' | 'supuesto'
  descripcion: string
  checked?: boolean
  expanded: boolean
  onToggleExpand: () => void
  onToggle?: () => void
  onMenu?: () => void
  draggable?: boolean
  onDragStart?: () => void
}) {
  const styles = {
    real:      { bg: '#E6F1FB', border: '#85B7EB', text: '#0C447C' },
    pendiente: { bg: '#FAEEDA', border: '#EF9F27', text: '#633806' },
    supuesto:  { bg: '#fff',    border: checked ? '#94A3B8' : '#A9A29C', text: '#475569' },
  }[origen]
  const isDashed = origen === 'supuesto'
  const title = `${descripcion} · ${tipo === 'ingreso' ? '+' : '-'}${fmt(monto, 'ARS')}`

  return (
    <div
      title={title}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={e => { e.stopPropagation(); onToggleExpand() }}
      className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono font-bold leading-none cursor-pointer ${draggable ? 'cursor-grab' : ''} ${checked ? 'opacity-50' : ''} ${expanded ? 'w-full' : ''}`}
      style={{ background: styles.bg, border: `1px ${isDashed ? 'dashed' : 'solid'} ${styles.border}`, color: styles.text }}
    >
      {origen === 'supuesto' && (
        <input type="checkbox" checked={!!checked} onChange={onToggle} onClick={e => e.stopPropagation()}
          className="w-[9px] h-[9px] cursor-pointer flex-shrink-0" />
      )}
      {expanded ? (
        <span className={`whitespace-normal break-words flex-1 ${checked ? 'line-through' : ''}`}>
          {descripcion} · {tipo === 'ingreso' ? '+' : '-'}{fmt(monto, 'ARS')}
        </span>
      ) : (
        <span className={checked ? 'line-through' : ''}>{tipo === 'ingreso' ? '+' : '-'}{fmtM(monto)}</span>
      )}
      {origen === 'supuesto' && onMenu && (
        <button onClick={e => { e.stopPropagation(); onMenu() }}
          className="ml-0.5 border-none bg-transparent cursor-pointer text-[10px] leading-none px-0.5 flex-shrink-0"
          style={{ color: styles.text }} aria-label="Más opciones">⋮</button>
      )}
    </div>
  )
}

// ── Calendario del simulador — semana / quincena / mes ────────────────────────
function CalendarioCashflow({
  flowData, simItems, mesBase, añoBase, diasEnMes,
  onAddSupuesto, onToggleChecked, onDeleteSupuesto, onMoveSupuesto, onDuplicateSupuesto,
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
  onDuplicateSupuesto: (item: CashflowSimItem) => void
}) {
  const [vista, setVista]     = useState<Vista>('semana')
  const [offset, setOffset]   = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [newLabel, setNewLabel]   = useState('')
  const [newMonto, setNewMonto]   = useState('')
  const [newTipo, setNewTipo]     = useState<'ingreso'|'egreso'>('egreso')
  const [newDia, setNewDia]       = useState('')
  const [menuAbierto, setMenuAbierto] = useState<string | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const dragId = useRef<string|null>(null)

  useEffect(() => { setOffset(0) }, [vista, mesBase, añoBase])
  useEffect(() => {
    if (!menuAbierto) return
    const cerrar = () => setMenuAbierto(null)
    document.addEventListener('click', cerrar)
    return () => document.removeEventListener('click', cerrar)
  }, [menuAbierto])

  const esMesActual = añoBase === HOY.getFullYear() && mesBase === HOY.getMonth()

  const offsetHoy = useMemo(() => {
    if (vista === 'mes') return 0
    if (vista === 'quincena') return Math.floor((HOY.getDate() - 1) / 14)
    const d = new Date(añoBase, mesBase, 1)
    const dow = d.getDay() || 7
    d.setDate(d.getDate() - dow + 1)
    const diffDias = Math.floor((HOY.getTime() - d.getTime()) / 86400000)
    return Math.floor(diffDias / 7)
  }, [vista, mesBase, añoBase])

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
  const gridCols = 7

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
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div>
          <div className="text-slate-900 font-semibold text-[15px]">Simulador</div>
          <div className="text-slate-400 text-xs mt-0.5">Click en un monto para ver la descripción completa</div>
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
              {esMesActual && (
                <button onClick={() => setOffset(offsetHoy)}
                  className="px-2.5 py-1 rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 cursor-pointer text-xs font-semibold">
                  Hoy
                </button>
              )}
            </div>
          )}
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-medium border-none cursor-pointer hover:opacity-90">
            + Agregar supuesto
          </button>
        </div>
      </div>

      <div className="overflow-x-auto -mx-1 px-1 pb-1">
      <div className={vista === 'mes' ? 'min-w-[700px]' : 'min-w-[480px]'}>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0,1fr))` }}>
        {dayList.map((dia, i) => {
          const dFlow = dia !== null ? flowData[dia - 1] : null
          const isToday = dia !== null && dia === HOY.getDate() && mesBase === HOY.getMonth() && añoBase === HOY.getFullYear()
          const supuestosDia = dia !== null ? simItems.filter(s => s.dia === dia) : []
          const label = dia !== null ? weekdayShort(añoBase, mesBase, dia) : ''
          const movs = dFlow?.movimientos ?? []
          return (
            <div key={i}
              className={`min-h-[56px] rounded-lg border p-1 flex flex-col gap-0.5 transition-colors ${isToday ? 'border-blue-400 bg-blue-50' : 'border-dashed border-slate-200'}`}
              onDragOver={e => { if (dia !== null) { e.preventDefault(); e.currentTarget.style.background = '#EFF6FF' } }}
              onDragLeave={e => { e.currentTarget.style.background = '' }}
              onDrop={e => { e.currentTarget.style.background = ''; if (dia !== null) handleDrop(dia) }}>
              {dia !== null && (
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider">{label}{isToday ? ' ·' : ''}</span>
                  <span className="text-[11px] font-semibold text-slate-700">{dia}</span>
                </div>
              )}
              {dia !== null && (
                <div title="Disponible por día desde acá en adelante"
                  className={`text-[9px] font-mono font-bold px-0.5 ${(dFlow?.disponible ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {fmtM(dFlow?.disponible ?? 0)}/día
                </div>
              )}
              <div className="flex flex-wrap gap-0.5">
                {movs.map(m => {
                  const key = `${m.origen}-${m.id}`
                  return (
                    <Chip key={key} monto={m.monto} tipo={m.tipo} origen={m.origen} descripcion={m.descripcion}
                      expanded={expandedKey === key}
                      onToggleExpand={() => setExpandedKey(k => k === key ? null : key)} />
                  )
                })}
                {supuestosDia.map(s => (
                  <Chip key={s.id} monto={s.monto} tipo={s.tipo} origen="supuesto" descripcion={s.descripcion}
                    checked={s.checked} draggable={!s.checked}
                    expanded={expandedKey === s.id}
                    onToggleExpand={() => setExpandedKey(k => k === s.id ? null : s.id)}
                    onDragStart={() => { dragId.current = s.id }}
                    onToggle={() => onToggleChecked(s.id, !s.checked)}
                    onMenu={() => setMenuAbierto(o => o === s.id ? null : s.id)} />
                ))}
              </div>
              {supuestosDia.map(s => menuAbierto === s.id && (
                <div key={`menu-${s.id}`} className="relative z-10">
                  <div className="absolute left-0 top-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[110px]" onClick={e => e.stopPropagation()}>
                    <button onClick={() => { onDuplicateSupuesto(s); setMenuAbierto(null) }}
                      className="w-full text-left px-3 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50 border-none bg-transparent cursor-pointer">Duplicar</button>
                    <button onClick={() => { onDeleteSupuesto(s.id); setMenuAbierto(null) }}
                      className="w-full text-left px-3 py-1.5 text-[11px] text-red-600 hover:bg-red-50 border-none bg-transparent cursor-pointer">Eliminar</button>
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
      </div>
      </div>

      {/* Zona sin fecha */}
      <div className="border border-dashed border-slate-200 rounded-lg p-2 mt-2">
        <div className="text-[10px] text-slate-400 mb-1.5">Supuestos sin fecha — arrastrá al día que quieras</div>
        <div className="flex flex-wrap gap-1.5 min-h-[24px]"
          onDragOver={e => e.preventDefault()}
          onDrop={() => handleDrop(null)}>
          {unscheduled.length === 0 && <span className="text-[11px] text-slate-300 self-center">Todos los supuestos tienen fecha asignada</span>}
          {unscheduled.map(s => (
            <div key={s.id} className="relative">
              <Chip monto={s.monto} tipo={s.tipo} origen="supuesto" descripcion={s.descripcion}
                checked={s.checked} draggable={!s.checked}
                expanded={expandedKey === s.id}
                onToggleExpand={() => setExpandedKey(k => k === s.id ? null : s.id)}
                onDragStart={() => { dragId.current = s.id }}
                onToggle={() => onToggleChecked(s.id, !s.checked)}
                onMenu={() => setMenuAbierto(o => o === s.id ? null : s.id)} />
              {menuAbierto === s.id && (
                <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[110px] z-10" onClick={e => e.stopPropagation()}>
                  <button onClick={() => { onDuplicateSupuesto(s); setMenuAbierto(null) }}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50 border-none bg-transparent cursor-pointer">Duplicar</button>
                  <button onClick={() => { onDeleteSupuesto(s.id); setMenuAbierto(null) }}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-red-600 hover:bg-red-50 border-none bg-transparent cursor-pointer">Eliminar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex gap-4 mt-2 flex-wrap">
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
  const mNorm = normMoneda(m)

  const { data: eventos,  loading: le } = useEventosMes(año, mesNum)
  const { data: ingresosAño, loading: li } = useIngresosByAño(año)
  const { data: egresosAño,  loading: lx } = useEgresosByAño(año)
  const { data: simItemsRaw, loading: lsim } = useCashflowSimItems(año, mesNum)

  // Estado local optimista: se sincroniza cuando llega una carga nueva (cambio
  // de mes/año), pero las mutaciones (agregar/mover/tildar/duplicar/borrar) NO
  // dependen de un refetch — así no hay flicker de loading en cada acción.
  const [items, setItems] = useState<CashflowSimItem[]>([])
  useEffect(() => { if (simItemsRaw) setItems(simItemsRaw) }, [simItemsRaw])

  const ingresosDelMes = useMemo(() => (ingresosAño ?? []).filter(i => i.mes === mesNum && normMoneda(i.moneda) === mNorm), [ingresosAño, mesNum, mNorm])
  const egresosDelMes  = useMemo(() => (egresosAño  ?? []).filter(e => e.mes === mesNum && normMoneda(e.moneda) === mNorm), [egresosAño, mesNum, mNorm])
  const eventosPendientes = useMemo(() => (eventos ?? []).filter(ev => !ev.pagado), [eventos])

  // ── Saldo inicial: 100% mensual, sin arrastrar histórico de meses anteriores.
  // = Ingresos del mes − Egresos del mes − Deudas del mes (pendientes, todavía sin
  // pagar — las que ya se pagaron este mes entran como Egreso real y no están acá,
  // así no se cuentan dos veces). El día a día arranca de este número y va restando/
  // sumando los movimientos de cada día — como esos MISMOS movimientos ya están
  // adentro de este número, el flujo día a día no sale de $0 (arranca del neto total
  // y lo va "desarmando" día por día para mostrar la forma, no un saldo bancario real).
  const totalIngresosMes = ingresosDelMes.reduce((s, i) => s + i.monto, 0)
  const totalEgresosMes  = egresosDelMes.reduce((s, e) => s + e.monto, 0)
  const totalDeudasMes   = eventosPendientes.filter(ev => ev.tipo !== 'ingreso' && ev.monto).reduce((s, ev) => s + (ev.monto ?? 0), 0)
  const saldoInicioMes   = 0 // el punto de partida del día a día siempre es 0: el mes "no arrastra" nada.

  const flowData = useMemo(() =>
    proyectarCashFlowMes(saldoInicioMes, eventosPendientes, ingresosDelMes, egresosDelMes, diasEnMes)
  , [eventosPendientes, ingresosDelMes, egresosDelMes, diasEnMes])

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
  const saldoHoy = flowData.find(d => d.dia === diaHoy)?.saldo ?? saldoInicioMes
  const pagosRestantes = flowData
    .filter(d => d.dia > diaHoy)
    .reduce((s, d) => s + d.movimientos.filter(mv => mv.tipo === 'egreso').reduce((s2, mv) => s2 + mv.monto, 0), 0)
  const gastoDiarioDisp = Math.round((saldoHoy - pagosRestantes) / diasRestantes)

  const totalSupuestosNeto = items.reduce((s, i) => s + (i.tipo === 'ingreso' ? i.monto : -i.monto), 0)
  const saldoFinSimulado = saldoFin + totalSupuestosNeto
  const ahorroEstimado = saldoFinSimulado - saldoInicioMes

  // Persistir resumen histórico del mes (debounced) — sobrevive aunque se limpien los
  // supuestos de este mes al pasar al siguiente.
  useEffect(() => {
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
  }, [año, mesNum, m, saldoFinSimulado, gastoDiarioDisp, ahorroEstimado])

  // ── Mutaciones optimistas: actualizan el estado local al toque, sin esperar
  // ni refetchear — la llamada a Supabase corre en segundo plano. Si falla, se
  // revierte el cambio local.
  const handleAddSupuesto = useCallback((desc: string, monto: number, tipo: 'ingreso'|'egreso', dia: number|null) => {
    const optimista: CashflowSimItem = {
      id: tmpId(), user_id: '', año, mes: mesNum, dia, descripcion: desc, monto, moneda: m, tipo, checked: false,
      created_at: new Date().toISOString(),
    }
    setItems(prev => [...prev, optimista])
    createCashflowSimItem({ año, mes: mesNum, dia, descripcion: desc, monto, moneda: m, tipo, checked: false })
      .then(creado => setItems(prev => prev.map(i => i.id === optimista.id ? creado : i)))
      .catch(() => setItems(prev => prev.filter(i => i.id !== optimista.id)))
  }, [año, mesNum, m])

  const handleDuplicateSupuesto = useCallback((item: CashflowSimItem) => {
    handleAddSupuesto(`${item.descripcion} (copia)`, item.monto, item.tipo, item.dia)
  }, [handleAddSupuesto])

  const handleToggleChecked = useCallback((id: string, checked: boolean) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, checked } : i))
    updateCashflowSimItem(id, { checked }).catch(() => setItems(prev => prev.map(i => i.id === id ? { ...i, checked: !checked } : i)))
  }, [])

  const handleDeleteSupuesto = useCallback((id: string) => {
    const prevItems = items
    setItems(prev => prev.filter(i => i.id !== id))
    deleteCashflowSimItem(id).catch(() => setItems(prevItems))
  }, [items])

  const handleMoveSupuesto = useCallback((id: string, dia: number|null) => {
    const prevItems = items
    setItems(prev => prev.map(i => i.id === id ? { ...i, dia } : i))
    updateCashflowSimItem(id, { dia }).catch(() => setItems(prevItems))
  }, [items])

  if ((le && !eventos) || (li && !ingresosAño) || (lx && !egresosAño) || (lsim && !simItemsRaw)) return <LoadingSpinner />

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
        simItems={items}
        mesBase={mes}
        añoBase={año}
        diasEnMes={diasEnMes}
        onAddSupuesto={handleAddSupuesto}
        onToggleChecked={handleToggleChecked}
        onDeleteSupuesto={handleDeleteSupuesto}
        onMoveSupuesto={handleMoveSupuesto}
        onDuplicateSupuesto={handleDuplicateSupuesto}
      />

      {/* ── Banner resumen del mes ── */}
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 mb-6 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-slate-500 text-sm font-medium">Resumen de</span>
          <span className="text-slate-900 font-semibold text-sm">{MESES[mes]} {año}</span>
          <span className="text-xs text-slate-400 ml-1">— 100% de este mes, no arrastra saldo de meses anteriores</span>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
            <span className="text-slate-500 text-xs">Ingresos del mes</span>
            <span className="text-emerald-700 font-mono font-bold text-sm">+{fmt(totalIngresosMes, m)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
            <span className="text-slate-500 text-xs">Egresos del mes</span>
            <span className="text-blue-700 font-mono font-bold text-sm">-{fmt(totalEgresosMes, m)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
            <span className="text-slate-500 text-xs">Deudas pendientes del mes</span>
            <span className="text-amber-600 font-mono font-bold text-sm">-{fmt(totalDeudasMes, m)}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-slate-400 text-xs">Neto del mes =</span>
            <span className={`text-2xl font-bold font-mono ${saldoFin >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
              {fmt(saldoFin, m)}
            </span>
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {[
          { l: 'Saldo estimado fin mes', v: fmt(saldoFin, m),     s: 'Ingresos − Egresos − Deudas pendientes', c: saldoFin >= 0 ? '#1A5E9E' : '#F54927' },
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
              Neto del mes + los supuestos que armaste en el simulador.
            </p>
            <div className="flex items-end gap-3">
              <div className={`text-4xl font-bold font-mono ${saldoFinSimulado >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(saldoFinSimulado, m)}</div>
              <div className="text-slate-500 text-sm mb-1">a fin de {MESES[mes].toLowerCase()}</div>
            </div>
          </div>
          <div className="flex flex-col gap-3 text-sm w-full md:w-auto md:min-w-[220px]">
            <div className="flex justify-between">
              <span className="text-slate-400">Acumulado hoy (día {diaHoy})</span>
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
              const saldoC = isNeg ? '#F54927' : '#1A5E9E'
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
