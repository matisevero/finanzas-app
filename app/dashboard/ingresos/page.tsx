'use client'
import { useState, useMemo, useRef, useCallback } from 'react'
import type { TooltipProps } from 'recharts'
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAppStore } from '@/store/appStore'
import { useIngresos, useCategoriasCustom } from '@/hooks'
import { createIngreso, updateIngreso, deleteIngreso } from '@/lib/queries'
import { fmt, fmtFull, fmtDate } from '@/lib/utils/formatters'
import { MESES_CORTOS, TIPOS_INGRESO } from '@/lib/utils/constants'
import { StatCard, PageHeader, Card, CardTitle, ChartToggle, Modal, LoadingSpinner, EmptyState, FieldLabel } from '@/components/ui'
import MontoInput from '@/components/ui/MontoInput'
import FechaInput from '@/components/ui/FechaInput'
import CategoriaSelector from '@/components/ui/CategoriaSelector'
import { parsePegadoTSV, matchOpcion, celdaFechaISO, parseCeldaMonto } from '@/lib/utils/pegado'
import type { Moneda, Quien, Ingreso, CategoriaCustom } from '@/types'

const TT = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, color: '#0f172a' }
const PIE_COLORS = ['#40B046','#52A852','#BA7517','#1A5E9E','#5B3FA6','#E8A020','#1D9E75','#888780']
const HOY = new Date()
const PAGE_SIZE = 30

const FORM_INIT = {
  tipo: 'salario', monto: '', descripcion: '',
  fecha: new Date().toISOString().split('T')[0],
  moneda: 'ARS' as Moneda, quien: 'ambos' as Quien, recurrente: false, etiqueta: '',
}

type SortKey = 'fecha' | 'monto' | 'tipo' | 'descripcion' | 'quien'
type SortDir = 'asc' | 'desc'
const COLS_DEFAULT: SortKey[] = ['fecha', 'descripcion', 'tipo', 'quien', 'monto']
const COL_LABEL: Record<SortKey, string> = { fecha: 'Fecha', descripcion: 'Descripción', tipo: 'Tipo', quien: 'Quién', monto: 'Importe' }

// ─── Widgets personalizables ────────────────────────────────────────────────
const WIDGET_OPTIONS_ING = [
  { id: 'total',        label: 'Total del período',   icon: '💰' },
  { id: 'salarios',     label: 'Salarios',            icon: '👔' },
  { id: 'extra',        label: 'Ingresos extra',      icon: '➕' },
  { id: 'promedio',     label: 'Promedio mensual',    icon: '📅' },
  { id: 'top_categoria',label: 'Mayor categoría',     icon: '🏆' },
  { id: 'cantidad',     label: 'Cantidad de ingresos',icon: '🔢' },
]
const DEFAULT_WIDGETS_ING = ['total', 'salarios', 'extra', 'promedio']

// ─── MultiDropdown ────────────────────────────────────────────────────────────
function MultiDropdown({ label, options, selected, onChange }: {
  label: string
  options: { key: string; label: string }[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const allSelected = selected.length === 0
  const activeLabel = allSelected ? label
    : selected.length === 1 ? (options.find(o => o.key === selected[0])?.label ?? label)
    : `${label} (${selected.length})`
  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key])

  return (
    <div ref={ref} className="relative">
      <button type="button"
        onClick={() => setOpen(v => !v)}
        onBlur={e => { if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false) }}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-all ${!allSelected ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
        {activeLabel} <span className="opacity-60">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-modal min-w-[180px] overflow-hidden">
          <div className="p-1 max-h-56 overflow-y-auto">
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => onChange([])}
              className={`w-full text-left px-3 py-2 text-xs rounded-lg cursor-pointer border-none transition-colors ${allSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'bg-transparent text-slate-600 hover:bg-slate-50'}`}>
              Todos
            </button>
            {options.map(opt => (
              <button key={opt.key} type="button" onMouseDown={e => e.preventDefault()} onClick={() => toggle(opt.key)}
                className={`w-full text-left px-3 py-2 text-xs rounded-lg cursor-pointer border-none transition-colors flex items-center gap-2 ${selected.includes(opt.key) ? 'bg-blue-50 text-blue-700 font-semibold' : 'bg-transparent text-slate-600 hover:bg-slate-50'}`}>
                <span className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 ${selected.includes(opt.key) ? 'bg-blue-700 border-blue-700' : 'border-slate-300'}`}>
                  {selected.includes(opt.key) && <span className="text-white text-[8px]">✓</span>}
                </span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
type CustomTooltipProps = TooltipProps<ValueType, NameType> & {
  getTipoInfo: (k: string) => { label: string; color: string }
  m: Moneda
}
function CustomTooltip({ active, payload, label, getTipoInfo, m }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const top5 = [...payload]
    .filter(p => (p.value as number) > 0)
    .sort((a, b) => (b.value as number) - (a.value as number))
    .slice(0, 5)
  const total = top5.reduce((s, p) => s + (p.value as number), 0)
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', minWidth: 180 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>{label}</div>
      {top5.map(p => {
        const key  = String(p.name ?? '')
        const info = getTipoInfo(key)
        return (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: info.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#475569' }}>{info.label}</span>
            </div>
            <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>{fmt(p.value as number, m)}</span>
          </div>
        )
      })}
      {top5.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, marginTop: 6, borderTop: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: 10, color: '#94a3b8' }}>Total</span>
          <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#334155' }}>{fmt(total, m)}</span>
        </div>
      )}

    </div>
  )
}

// ─── SheetNewRow — fila de carga siempre visible, pegado posicional ─────────
type DraftRow = { id: string; tipo: string; descripcion: string; fecha: string; monto: string; moneda: Moneda; quien: Quien | '' }
const cellBase = 'w-full h-8 px-2 bg-transparent border-none outline-none focus:ring-2 focus:ring-blue-400/40 focus:relative focus:z-10 text-xs'

function blankDraftRow(): DraftRow {
  return { id: Math.random().toString(36).slice(2), tipo: '', descripcion: '', fecha: '', monto: '', moneda: 'ARS', quien: '' }
}

function SheetNewRow({ cols, tiposBase, categoriasCustom, onSave, refetchCats }: {
  cols: SortKey[]
  tiposBase: { key: string; label: string; icon: string; color: string }[]
  categoriasCustom: CategoriaCustom[]
  onSave: (data: typeof FORM_INIT) => Promise<void>
  refetchCats: () => void
}) {
  const añoActivo = useAppStore(s => s.añoActivo)
  const [nuevaFila, setNuevaFila] = useState<DraftRow>(blankDraftRow())
  const [pendientes, setPendientes] = useState<DraftRow[]>([])
  const [justSaved, setJustSaved] = useState(false)

  const categoriasConocidas = [...tiposBase.map(t => ({ key: t.key, label: t.label })), ...categoriasCustom.map(c => ({ key: c.nombre, label: c.nombre }))]
  const quienOpciones = [{ key: 'ambos', label: 'Ambos' }, { key: 'Mati', label: 'Mati' }, { key: 'Dani', label: 'Dani' }]

  // Enter guarda con lo mínimo: fecha, descripción y monto. Tipo/Quién quedan en "Otro"/"Ambos" si no se eligieron.
  const puedeGuardar = (r: DraftRow) => !!(r.fecha && r.descripcion.trim() && r.monto)
  const filaConAlgo  = (r: DraftRow) => !!(r.fecha || r.descripcion.trim() || r.tipo || r.quien || r.monto)

  const commitFila = async (r: DraftRow) => {
    if (!puedeGuardar(r)) return
    await onSave({ tipo: r.tipo || 'otro', descripcion: r.descripcion, monto: r.monto, fecha: r.fecha, moneda: r.moneda, quien: (r.quien || 'ambos') as Quien, recurrente: false, etiqueta: '' })
  }

  const handleEnterNueva = async () => {
    if (!puedeGuardar(nuevaFila)) return
    await commitFila(nuevaFila)
    setNuevaFila(blankDraftRow())
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 700)
  }

  const handleEnterPendiente = async (idx: number) => {
    const r = pendientes[idx]
    if (!puedeGuardar(r)) return
    await commitFila(r)
    setPendientes(ps => ps.filter((_, i) => i !== idx))
  }

  const descartarPendiente = (idx: number) => setPendientes(ps => ps.filter((_, i) => i !== idx))

  // Pegado posicional (Excel/Sheets): cae en la celda donde hiciste click y se expande derecha/abajo.
  // Nada se guarda solo — todas las filas pegadas quedan como borrador editable, se confirman a mano con Enter.
  const handlePasteEnCelda = (startRow: number, startCol: number) => (e: React.ClipboardEvent) => {
    const texto = e.clipboardData.getData('text')
    if (!texto || !/\t|\n/.test(texto)) return
    e.preventDefault()
    const grilla = parsePegadoTSV(texto)

    const virtual = [nuevaFila, ...pendientes]
    while (virtual.length < startRow + grilla.length) virtual.push(blankDraftRow())

    grilla.forEach((linea, i) => {
      const rowIdx = startRow + i
      const row = { ...virtual[rowIdx] }
      linea.forEach((celdaTexto, j) => {
        const col = startCol + j
        if (col > 4) return
        const val = celdaTexto.trim()
        if (col === 0) row.fecha = celdaFechaISO(val, añoActivo)
        else if (col === 1) row.descripcion = val
        else if (col === 2) row.tipo = matchOpcion(val, categoriasConocidas)
        else if (col === 3) row.quien = matchOpcion(val, quienOpciones) as Quien | ''
        else if (col === 4) { const m = parseCeldaMonto(val); row.monto = m !== null ? String(m) : '' }
      })
      virtual[rowIdx] = row
    })

    setNuevaFila(virtual[0] ?? blankDraftRow())
    setPendientes(virtual.slice(1))
  }

  const filaHTML = (r: DraftRow, onChange: (patch: Partial<DraftRow>) => void, onEnter: () => void, startRow: number, key: string, onEscape: () => void, onDescartar?: () => void, flash?: boolean) => {
    const handleKey = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') onEnter()
      if (e.key === 'Escape') onEscape()
    }
    return (
    <tr key={key} className={`transition-colors duration-500 ${flash ? 'bg-emerald-100' : filaConAlgo(r) ? 'bg-amber-50/50' : ''}`}>
      <td className="border border-slate-200" style={{width:100}}>
        <FechaInput bare value={r.fecha} onChange={iso => onChange({ fecha: iso })} onPaste={handlePasteEnCelda(startRow, 0)}
          onKeyDown={handleKey} className={cellBase} />
      </td>
      <td className="border border-slate-200">
        <input value={r.descripcion} onChange={e => onChange({ descripcion: e.target.value })} onPaste={handlePasteEnCelda(startRow, 1)}
          onKeyDown={handleKey} className={cellBase} />
      </td>
      <td className="border border-slate-200" style={{width:150}}>
        <CategoriaSelector bare modulo="ingresos" value={r.tipo} onChange={v => onChange({ tipo: v })} onPaste={handlePasteEnCelda(startRow, 2)}
          onKeyDown={handleKey}
          categorias={categoriasCustom} categoriasBase={tiposBase} onCategoriasChange={refetchCats} />
      </td>
      <td className="border border-slate-200" style={{width:100}}>
        <select value={r.quien} onChange={e => onChange({ quien: e.target.value as Quien })} onPaste={handlePasteEnCelda(startRow, 3)}
          onKeyDown={handleKey} className={cellBase}>
          <option value="">—</option>
          <option value="ambos">Ambos</option>
          <option value="Mati">Mati</option>
          <option value="Dani">Dani</option>
        </select>
      </td>
      <td className="border border-slate-200" style={{width:130}}>
        <MontoInput bare value={r.monto} onChange={raw => onChange({ monto: raw })} onPaste={handlePasteEnCelda(startRow, 4)}
          onKeyDown={handleKey} className={cellBase} />
      </td>
      <td className="border border-slate-200 text-right px-1" style={{width:32}}>
        {onDescartar && (
          <button onClick={onDescartar} title="Descartar" className="text-xs text-slate-400 hover:text-slate-600 border-none bg-transparent cursor-pointer">✕</button>
        )}
      </td>
    </tr>
  )}

  return (
    <>
      {filaHTML(nuevaFila, patch => setNuevaFila(p => ({ ...p, ...patch })), handleEnterNueva, 0, 'nueva', () => setNuevaFila(blankDraftRow()), undefined, justSaved)}
      {pendientes.map((r, i) => filaHTML(
        r,
        patch => setPendientes(ps => ps.map((x, j) => j === i ? { ...x, ...patch } : x)),
        () => handleEnterPendiente(i),
        i + 1,
        `pend-${r.id}`,
        () => descartarPendiente(i),
        () => descartarPendiente(i),
      ))}
    </>
  )
}

// ─── InlineEditRow ────────────────────────────────────────────────────────────
function InlineEditRow({ ingreso, tiposBase, categoriasCustom, onSave, onCancel, refetchCats }: {
  ingreso: Ingreso
  tiposBase: { key: string; label: string; icon: string; color: string }[]
  categoriasCustom: CategoriaCustom[]
  onSave: (id: string, data: Partial<typeof FORM_INIT>) => Promise<void>
  onCancel: () => void
  refetchCats: () => void
}) {
  const [form, setForm] = useState({
    tipo: ingreso.tipo, monto: String(ingreso.monto),
    descripcion: ingreso.descripcion, fecha: ingreso.fecha,
    moneda: ingreso.moneda as Moneda, quien: ingreso.quien as Quien,
    recurrente: ingreso.recurrente,
  })
  const [saving, setSaving] = useState(false)
  const handle = async () => { setSaving(true); await onSave(ingreso.id, form); setSaving(false) }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handle() }
    if (e.key === 'Escape') onCancel()
  }

  return (
    <tr className="bg-blue-50/60">
      <td className="border border-slate-200" style={{width:100}}><FechaInput bare value={form.fecha} onChange={iso => setForm(p => ({ ...p, fecha: iso }))} onKeyDown={handleKeyDown} className={cellBase} /></td>
      <td className="border border-slate-200"><input value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} onKeyDown={handleKeyDown} className={cellBase} placeholder="Descripción" /></td>
      <td className="border border-slate-200" style={{width:150}}>
        <CategoriaSelector bare modulo="ingresos" value={form.tipo} onChange={v => setForm(p => ({ ...p, tipo: v }))} onKeyDown={handleKeyDown}
          categorias={categoriasCustom} categoriasBase={tiposBase} onCategoriasChange={refetchCats} />
      </td>
      <td className="border border-slate-200" style={{width:100}}>
        <select value={form.quien} onChange={e => setForm(p => ({ ...p, quien: e.target.value as Quien }))} onKeyDown={handleKeyDown} className={cellBase}>
          <option value="ambos">Ambos</option><option value="Mati">Mati</option><option value="Dani">Dani</option>
        </select>
      </td>
      <td className="border border-slate-200" style={{width:130}}><MontoInput bare value={form.monto} onChange={raw => setForm(p => ({ ...p, monto: raw }))} onKeyDown={handleKeyDown} className={cellBase} /></td>
      <td className="border border-slate-200 text-right px-1" style={{width:32}}>
        <div className="flex gap-1 justify-end">
          <button onClick={handle} disabled={saving} className="text-xs bg-blue-700 text-white px-2 py-1 rounded-lg border-none cursor-pointer disabled:opacity-50">{saving ? '...' : '✓'}</button>
          <button onClick={onCancel} className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded-lg border-none cursor-pointer">✕</button>
        </div>
      </td>
    </tr>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function IngresosPage() {
  const { añoActivo, vistaTipo, mesActivo, monedaPrincipal: m } = useAppStore()
  const esMensual = vistaTipo === 'mensual'
  const { data: ingresos, loading, refetch } = useIngresos()
  const { data: rawCategorias, refetch: refetchCats } = useCategoriasCustom('ingresos')
  const categoriasCustom = (rawCategorias ?? []) as CategoriaCustom[]

  const data = useMemo(() =>
    esMensual ? (ingresos ?? []).filter(i => i.mes === mesActivo) : (ingresos ?? [])
  , [ingresos, esMensual, mesActivo])

  const periodoLabel = esMensual ? `${MESES_CORTOS[mesActivo-1]} ${añoActivo}` : `${añoActivo}`

  const [chartType, setChartType]     = useState<'apilado'|'agrupado'>('apilado')
  const [sidePanel, setSidePanel]     = useState<'composicion'|'top'>('composicion')
  const [compMes, setCompMes]         = useState(HOY.getMonth())
  const [hiddenKeys, setHiddenKeys]   = useState<string[]>([])
  const [filterTipos, setFilterTipos] = useState<string[]>([])
  const [filterQuien, setFilterQuien] = useState<string[]>([])
  const [search, setSearch]           = useState('')
  const [showModal, setShowModal]     = useState(false)
  const [widgets, setWidgets]           = useState<string[]>(DEFAULT_WIDGETS_ING)
  const [editingWidgets, setEditingWidgets] = useState(false)
  const [modalEditId, setModalEditId] = useState<string|null>(null)
  const [saving, setSaving]           = useState(false)
  const [form, setForm]               = useState(FORM_INIT)
  const [editingId, setEditingId]     = useState<string|null>(null)
  const [sortKey, setSortKey]         = useState<SortKey>('fecha')
  const [sortDir, setSortDir]         = useState<SortDir>('desc')
  const [cols, setCols]               = useState<SortKey[]>(COLS_DEFAULT)
  const [page, setPage]               = useState(1)
  const [expandedChart, setExpandedChart] = useState<'evolucion'|'composicion'|null>(null)
  const dragCol  = useRef<number|null>(null)
  const dragOver = useRef<number|null>(null)

  const tiposBase = useMemo(() =>
    Object.entries(TIPOS_INGRESO).map(([key, cfg]) => ({ key, label: cfg.label, icon: cfg.icon, color: cfg.color }))
  , [])

  const allTipos = useMemo(() => {
    const flat: { key: string; label: string; icon: string; color: string }[] = []
    const traverse = (cats: CategoriaCustom[], prefix = '') => {
      cats.forEach(c => {
        flat.push({ key: c.id, label: prefix + c.nombre, icon: c.icono, color: c.color })
        if (c.children?.length) traverse(c.children, prefix + '  ')
      })
    }
    traverse(categoriasCustom)
    return [...tiposBase, ...flat]
  }, [categoriasCustom, tiposBase])

  const getTipoInfo = (tipo: string) =>
    allTipos.find(t => t.key === tipo) ?? { key: tipo, label: tipo, icon: '', color: '#888780' }

  const chartDataAnual = useMemo(() => MESES_CORTOS.map((month, i) => {
    const mes = i + 1
    const point: Record<string, number|string> = { month }
    tiposBase.forEach(({ key }) => {
      point[key] = (ingresos ?? []).filter(x => x.mes === mes && x.tipo === key).reduce((s, x) => s + x.monto, 0)
    })
    return point
  }), [ingresos, tiposBase])

  const chartDataMensual = useMemo(() => {
    const diasEnMes = new Date(añoActivo, mesActivo, 0).getDate()
    return Array.from({ length: diasEnMes }, (_, i) => {
      const dia = i + 1
      const point: Record<string, number|string> = { month: String(dia) }
      tiposBase.forEach(({ key }) => {
        point[key] = data.filter(x => Number(x.fecha.slice(8,10)) === dia && x.tipo === key).reduce((s, x) => s + x.monto, 0)
      })
      return point
    })
  }, [data, tiposBase, añoActivo, mesActivo])

  const chartData = esMensual ? chartDataMensual : chartDataAnual

  const compData = useMemo(() => {
    const src = esMensual ? data : (compMes === -1 ? (ingresos ?? []) : (ingresos ?? []).filter(x => x.mes === compMes + 1))
    return allTipos
      .map(t => ({ name: t.label, color: t.color, value: src.filter(i => i.tipo === t.key).reduce((s, i) => s + i.monto, 0) }))
      .filter(d => d.value > 0)
  }, [ingresos, data, esMensual, compMes, allTipos])

  const topAño = useMemo(() =>
    allTipos
      .map(t => ({ label: t.label, color: t.color, value: data.filter(i => i.tipo === t.key).reduce((s, i) => s + i.monto, 0) }))
      .filter(d => d.value > 0).sort((a, b) => b.value - a.value).slice(0, 8)
  , [data, allTipos])

  const filtered = useMemo(() => {
    const rows = data
      .filter(i => filterTipos.length === 0 || filterTipos.includes(i.tipo))
      .filter(i => filterQuien.length === 0 || filterQuien.includes(i.quien))
      .filter(i => !search || i.descripcion.toLowerCase().includes(search.toLowerCase()) || (i.etiqueta ?? '').toLowerCase().includes(search.toLowerCase()))
    return [...rows].sort((a, b) => {
      const va = a[sortKey as keyof Ingreso] as string|number
      const vb = b[sortKey as keyof Ingreso] as string|number
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [data, filterTipos, filterQuien, search, sortKey, sortDir])

  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set([HOY.getMonth() + 1]))
  const rowsByMonth = useMemo(() => {
    const map: Record<number, typeof filtered> = {}
    filtered.forEach(i => { if (!map[i.mes]) map[i.mes] = []; map[i.mes].push(i) })
    return map
  }, [filtered])
  const sortedMonths = useMemo(() => Object.keys(rowsByMonth).map(Number).sort((a,b) => b - a), [rowsByMonth])
  const visibleRows = filtered.slice(0, page * PAGE_SIZE)
  const hasMore     = filtered.length > visibleRows.length

  const total         = data.reduce((s, i) => s + i.monto, 0)
  const mesActual     = HOY.getMonth() + 1
  const totalMesAct   = (ingresos ?? []).filter(i => i.mes === mesActual).reduce((s, i) => s + i.monto, 0)
  const totalMesAnt   = (ingresos ?? []).filter(i => i.mes === mesActual - 1).reduce((s, i) => s + i.monto, 0)
  const trendMes      = totalMesAnt > 0 ? Math.round((totalMesAct - totalMesAnt) / totalMesAnt * 100) : undefined
  const salarios      = data.filter(i => i.tipo === 'salario').reduce((s, i) => s + i.monto, 0)
  const mesesConDatos = new Set((ingresos ?? []).map(i => i.mes)).size
  const promedio      = mesesConDatos > 0 ? Math.round((ingresos??[]).reduce((s,i)=>s+i.monto,0) / mesesConDatos) : 0

  const getWidgetValue = (id: string) => {
    switch (id) {
      case 'total':         return { value: fmt(total, m), sub: 'Acumulado', trend: trendMes, trendLabel: 'vs mes anterior', color: '#40B046' }
      case 'salarios':      return { value: fmt(salarios, m), sub: `${total > 0 ? Math.round(salarios / total * 100) : 0}% del total`, color: '#40B046' }
      case 'extra':         return { value: fmt(total - salarios, m), sub: 'Freelance + alquiler + otros', color: '#52A852' }
      case 'promedio':      return { value: fmt(promedio, m), sub: 'Sobre meses con datos', color: '#1A5E9E' }
      case 'top_categoria': return { value: topAño[0]?.label ?? '—', sub: topAño[0] ? fmt(topAño[0].value, m) : 'Sin datos', color: topAño[0]?.color ?? '#888780' }
      case 'cantidad':      return { value: String(data.length), sub: 'Ingresos registrados', color: '#5B3FA6' }
      default: return { value: '—', sub: '', color: '#888780' }
    }
  }

  const changeWidget = (index: number, newId: string) => {
    const next = [...widgets]
    next[index] = newId
    setWidgets(next)
  }

  const handleSave = async () => {
    if (!form.monto || !form.fecha) return
    setSaving(true)
    try {
      if (modalEditId) {
        await updateIngreso(modalEditId, { tipo: form.tipo, descripcion: form.descripcion, monto: parseFloat(form.monto), moneda: form.moneda, fecha: form.fecha, quien: form.quien, recurrente: form.recurrente, etiqueta: form.etiqueta || null })
      } else {
        await createIngreso({ tipo: form.tipo, descripcion: form.descripcion, monto: parseFloat(form.monto), moneda: form.moneda, fecha: form.fecha, quien: form.quien, recurrente: form.recurrente, etiqueta: form.etiqueta || null })
      }
      setShowModal(false); setForm(FORM_INIT); setModalEditId(null); refetch()
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  const openEditModal = (ingreso: Ingreso) => {
    setForm({
      tipo: ingreso.tipo, monto: String(ingreso.monto), descripcion: ingreso.descripcion,
      fecha: ingreso.fecha, moneda: ingreso.moneda as Moneda, quien: ingreso.quien, recurrente: ingreso.recurrente,
      etiqueta: ingreso.etiqueta ?? '',
    })
    setModalEditId(ingreso.id)
    setShowModal(true)
  }

  // Fila Sheet — guardar nuevo ingreso rápido
  const handleSheetSave = useCallback(async (data: typeof FORM_INIT) => {
    await createIngreso({ tipo: data.tipo, descripcion: data.descripcion, monto: parseFloat(data.monto), moneda: data.moneda, fecha: data.fecha, quien: data.quien, recurrente: data.recurrente, etiqueta: data.etiqueta || null })
    refetch()
  }, [refetch])

  const handleUpdate = async (id: string, data: Partial<typeof FORM_INIT>) => {
    await updateIngreso(id, { tipo: data.tipo, descripcion: data.descripcion, monto: parseFloat(data.monto ?? '0'), moneda: data.moneda, fecha: data.fecha, quien: data.quien, recurrente: data.recurrente })
    setEditingId(null); refetch()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este ingreso?')) return
    await deleteIngreso(id); refetch()
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const onDragStart = (i: number) => { dragCol.current = i }
  const onDragEnter = (i: number) => { dragOver.current = i }
  const onDragEnd   = () => {
    if (dragCol.current === null || dragOver.current === null) return
    const next = [...cols]; const [removed] = next.splice(dragCol.current, 1); next.splice(dragOver.current, 0, removed)
    setCols(next); dragCol.current = null; dragOver.current = null
  }

  const setFilterTiposR = (v: string[]) => { setFilterTipos(v); setPage(1) }
  const setFilterQuienR = (v: string[]) => { setFilterQuien(v); setPage(1) }
  const setSearchR      = (v: string)   => { setSearch(v); setPage(1) }

  const quienOptions = [{ key: 'Mati', label: 'Mati' }, { key: 'Dani', label: 'Dani' }, { key: 'ambos', label: 'Ambos' }]

  const renderTooltip = (props: TooltipProps<ValueType, NameType>) =>
    <CustomTooltip {...props} getTipoInfo={getTipoInfo} m={m} />

  if (loading) return <LoadingSpinner />


  return (
    <div>
      <PageHeader title="Ingresos"
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setEditingWidgets(v => !v)}
              className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${editingWidgets ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
              {editingWidgets ? '✓ Listo' : '⚙ Personalizar widgets'}
            </button>
            <button className="btn-primary" onClick={() => { setForm(FORM_INIT); setModalEditId(null); setShowModal(true) }}>+ Nuevo ingreso</button>
          </div>
        } />

      {/* ── StatCards personalizables ── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {widgets.map((widgetId, index) => {
          const opt = WIDGET_OPTIONS_ING.find(o => o.id === widgetId)!
          const wv  = getWidgetValue(widgetId)
          const label = widgetId === 'total' ? `Total ${periodoLabel}` : opt.label
          return (
            <div key={index} className="relative">
              {editingWidgets && (
                <div className="absolute -top-2 -right-2 z-10">
                  <select
                    value={widgetId}
                    onChange={e => changeWidget(index, e.target.value)}
                    className="text-[10px] bg-slate-900 text-white rounded-lg px-2 py-1 border-none cursor-pointer shadow-lg">
                    {WIDGET_OPTIONS_ING.map(o => <option key={o.id} value={o.id}>{o.icon} {o.label}</option>)}
                  </select>
                </div>
              )}
              <div className={editingWidgets ? 'ring-2 ring-blue-400 ring-offset-1 rounded-2xl' : ''}>
                <StatCard label={label} value={wv.value} sub={wv.sub} color={wv.color}
                  trend={'trend' in wv ? wv.trend : undefined}
                  trendLabel={'trendLabel' in wv ? wv.trendLabel : undefined} />
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Layout principal: Transacciones 2/3 | Widgets 1/3 ── */}
      <div className="grid grid-cols-3 gap-5 items-start">

        {/* ── Columna izquierda: Transacciones ── */}
        <div className="col-span-2">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="text-slate-900 font-semibold text-[15px]">Transacciones</div>
              <span className="text-slate-400 text-xs">{filtered.length} registros · {fmt(filtered.reduce((s, i) => s + i.monto, 0), m)}</span>
            </div>
            <div className="flex gap-2 flex-wrap mb-4 items-center">
              <div className="relative flex-1 min-w-[180px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">⌕</span>
                <input value={search} onChange={e => setSearchR(e.target.value)} placeholder="Buscar descripción..." className="input-field pl-8 py-1.5 text-xs" />
              </div>
              <MultiDropdown label="Tipo" options={allTipos.map(t => ({ key: t.key, label: t.label }))} selected={filterTipos} onChange={setFilterTiposR} />
              <MultiDropdown label="Quién" options={quienOptions} selected={filterQuien} onChange={setFilterQuienR} />
              {(filterTipos.length > 0 || filterQuien.length > 0 || search) && (
                <button onClick={() => { setFilterTiposR([]); setFilterQuienR([]); setSearchR('') }}
                  className="text-xs text-slate-400 hover:text-slate-600 border-none bg-transparent cursor-pointer underline">
                  Limpiar
                </button>
              )}
            </div>

            {filtered.length === 0 ? (
              <EmptyState title="Sin resultados" description="Probá cambiando los filtros o la búsqueda." />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        {cols.map((col, i) => (
                          <th key={col} draggable
                            onDragStart={() => onDragStart(i)} onDragEnter={() => onDragEnter(i)}
                            onDragEnd={onDragEnd} onDragOver={e => e.preventDefault()}
                            onClick={() => toggleSort(col)}
                            style={col==='fecha'?{width:100}:col==='tipo'?{width:150}:col==='quien'?{width:100}:col==='monto'?{width:130}:undefined}
                            className={`text-slate-400 text-[11px] font-bold uppercase tracking-widest py-2.5 px-2 border border-slate-200 cursor-pointer select-none hover:text-slate-600 ${col === 'monto' ? 'text-right' : 'text-left'}`}>
                            <span className="inline-flex items-center gap-1">
                              <span className="cursor-grab opacity-30 hover:opacity-60">⠿</span>
                              {COL_LABEL[col]}
                              {sortKey === col && <span className="text-blue-500">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                            </span>
                          </th>
                        ))}
                        <th className="border border-slate-200 bg-slate-50" style={{width:32}} />
                      </tr>
                    </thead>
                    <tbody>
                      <SheetNewRow cols={cols} tiposBase={tiposBase} categoriasCustom={categoriasCustom} onSave={handleSheetSave} refetchCats={refetchCats} />
                      {visibleRows.map((ingreso, rowIdx) => {
                        const cfg       = getTipoInfo(ingreso.tipo)
                        const isEditing = editingId === ingreso.id
                        const bg        = rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'

                        if (isEditing) return (
                          <InlineEditRow key={ingreso.id} ingreso={ingreso} tiposBase={tiposBase}
                            categoriasCustom={categoriasCustom} onSave={handleUpdate}
                            onCancel={() => setEditingId(null)} refetchCats={refetchCats} />
                        )

                        const cellFor = (col: SortKey) => {
                          switch (col) {
                            case 'fecha':       return <td key={col} className="border border-slate-200 py-2 px-2 text-sm" style={{width:100}}><span className="text-slate-500 text-xs font-mono whitespace-nowrap">{fmtDate(ingreso.fecha)}</span></td>
                            case 'descripcion': return <td key={col} className="border border-slate-200 py-2 px-2 text-sm"><span onClick={() => openEditModal(ingreso)} className="text-slate-700 font-medium cursor-pointer hover:underline hover:font-bold">{ingreso.descripcion || cfg.label}</span>{ingreso.etiqueta && <span className="ml-2 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{ingreso.etiqueta}</span>}</td>
                            case 'tipo':        return <td key={col} className="border border-slate-200 py-2 px-2 text-sm" style={{width:150}}><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: cfg.color + '18', color: cfg.color }}>{cfg.label}</span></td>
                            case 'quien':       return <td key={col} className="border border-slate-200 py-2 px-2 text-sm" style={{width:100}}><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ingreso.quien === 'Mati' ? 'bg-blue-50 text-blue-700' : ingreso.quien === 'Dani' ? 'bg-pink-50 text-pink-700' : 'bg-slate-100 text-slate-500'}`}>{ingreso.quien}</span></td>
                            case 'monto':       return <td key={col} className="border border-slate-200 py-2 px-2 text-sm text-right" style={{width:130}}><span className="text-emerald-700 font-mono font-bold">+{fmtFull(ingreso.monto, ingreso.moneda as Moneda)}</span></td>
                            default: return null
                          }
                        }

                        return (
                          <tr key={ingreso.id} className={`group ${bg} hover:bg-blue-50 transition-colors`}>
                            {cols.map(col => cellFor(col))}
                            <td className="border border-slate-200 text-right px-1" style={{width:32}}>
                              <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setEditingId(ingreso.id)} className="text-slate-400 hover:text-blue-600 border-none bg-transparent cursor-pointer px-1 text-sm">✎</button>
                                <button onClick={() => handleDelete(ingreso.id)} className="text-slate-300 hover:text-red-500 border-none bg-transparent cursor-pointer px-1 text-sm">✕</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {hasMore && (
                  <div className="flex items-center justify-center pt-4 border-t border-slate-100 mt-2">
                    <button onClick={() => setPage(p => p + 1)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium border-none bg-transparent cursor-pointer">
                      Ver más ({filtered.length - visibleRows.length} restantes)
                    </button>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

        {/* ── Columna derecha: Widgets ── */}
        <div className="col-span-1 flex flex-col gap-5">

          {/* Gráfico evolución */}
          <Card className="cursor-pointer hover:border-blue-200 hover:shadow-lg hover:-translate-y-0.5 transition-all group" onClick={()=>setExpandedChart('evolucion')}>
            <CardTitle action={<div onClick={e=>e.stopPropagation()}><ChartToggle options={[{ value: 'apilado', label: '▋ Apilado' }, { value: 'agrupado', label: '▋ Agrupado' }]} value={chartType} onChange={v => setChartType(v as 'apilado'|'agrupado')} /></div>}>
              Evolución {añoActivo}
            </CardTitle>
            <div className="flex gap-2 flex-wrap mb-3">
              {tiposBase.map(({ key, label, color }) => (
                <button key={key} type="button" onClick={() => setHiddenKeys(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key])}
                  className="flex items-center gap-1.5 border-none bg-transparent cursor-pointer p-0 transition-opacity"
                  style={{ opacity: hiddenKeys.includes(key) ? 0.3 : 1 }}>
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                  <span className="text-slate-500 text-xs">{label}</span>
                </button>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} barCategoryGap="28%" barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v === 0 ? '' : fmt(v, m)} />
                <Tooltip content={renderTooltip} />
                {tiposBase.filter(({ key }) => !hiddenKeys.includes(key)).map(({ key, color }) => (
                  <Bar key={key} dataKey={key} name={key} fill={color} radius={0} maxBarSize={28} stackId={chartType === 'apilado' ? 'stack' : undefined} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Composición / Top */}
          <Card className="cursor-pointer hover:border-blue-200 hover:shadow-lg hover:-translate-y-0.5 transition-all" onClick={()=>setExpandedChart('composicion')}>
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-4">
              {(['composicion', 'top'] as const).map(v => (
                <button key={v} onClick={(e) => { e.stopPropagation(); setSidePanel(v) }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all border-none cursor-pointer ${sidePanel === v ? 'bg-white text-slate-900 shadow-sm' : 'bg-transparent text-slate-500'}`}>
                  {v === 'composicion' ? 'Composición' : 'Top categorías'}
                </button>
              ))}
            </div>

            {sidePanel === 'composicion' && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-slate-500 text-xs font-medium">Mes</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setCompMes(v => Math.max(-1, v - 1))} className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer text-sm">‹</button>
                    <span className="text-xs font-medium text-slate-700 min-w-[44px] text-center">{compMes === -1 ? 'Acum.' : MESES_CORTOS[compMes]}</span>
                    <button onClick={() => setCompMes(v => Math.min(11, v + 1))} className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer text-sm">›</button>
                  </div>
                </div>
                {compData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={130}>
                      <PieChart>
                        <Pie data={compData} cx="50%" cy="50%" innerRadius={36} outerRadius={58} paddingAngle={3} dataKey="value">
                          {compData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={TT} formatter={(v: number, _: string, e: { payload?: { name?: string } }) => [fmt(v, m), e?.payload?.name ?? '']} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col gap-1.5 mt-2">
                      {compData.map((d, i) => (
                        <div key={d.name} className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="text-slate-500 text-xs">{d.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400 text-xs">{Math.round(d.value / compData.reduce((s, x) => s + x.value, 0) * 100)}%</span>
                            <span className="text-slate-900 text-xs font-mono font-bold">{fmt(d.value, m)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <div className="text-center text-slate-400 text-sm py-8">Sin datos</div>}
              </>
            )}

            {sidePanel === 'top' && (
              <>
                <div className="text-xs text-slate-400 mb-3 font-medium">{esMensual ? `${MESES_CORTOS[mesActivo-1]} ${añoActivo}` : `Año ${añoActivo}`} — por categoría</div>
                {topAño.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {topAño.map((d, i) => {
                      const pct = topAño[0].value > 0 ? Math.round(d.value / topAño[0].value * 100) : 0
                      return (
                        <div key={d.label}>
                          <div className="flex justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-slate-400 w-3">{i + 1}</span>
                              <span className="text-xs font-medium text-slate-700">{d.label}</span>
                            </div>
                            <span className="text-xs font-mono font-bold" style={{ color: d.color }}>{fmt(d.value, m)}</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: d.color }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : <div className="text-center text-slate-400 text-sm py-8">Sin datos</div>}
              </>
            )}
          </Card>

        </div>
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); setForm(FORM_INIT); setModalEditId(null) }} title={modalEditId ? 'Editar ingreso' : 'Nuevo ingreso'}>
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Tipo</FieldLabel>
            <CategoriaSelector modulo="ingresos" value={form.tipo} onChange={v => setForm(p => ({ ...p, tipo: v }))}
              categorias={categoriasCustom} categoriasBase={tiposBase} onCategoriasChange={refetchCats} />
          </div>
          <div><FieldLabel>Descripción</FieldLabel>
            <input value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Ej: Salario enero" className="input-field" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Monto</FieldLabel><MontoInput value={form.monto} onChange={raw => setForm(p => ({ ...p, monto: raw }))} /></div>
            <div><FieldLabel>Moneda</FieldLabel>
              <select value={form.moneda} onChange={e => setForm(p => ({ ...p, moneda: e.target.value as Moneda }))} className="input-field">
                {['ARS','USD','EUR'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Fecha</FieldLabel><FechaInput value={form.fecha} onChange={iso => setForm(p => ({ ...p, fecha: iso }))} /></div>
            <div><FieldLabel>Quién</FieldLabel>
              <select value={form.quien} onChange={e => setForm(p => ({ ...p, quien: e.target.value as Quien }))} className="input-field">
                <option value="ambos">Ambos</option><option value="Mati">Mati</option><option value="Dani">Dani</option>
              </select>
            </div>
          </div>
          <div>
            <FieldLabel>Etiqueta <span className="text-slate-400 font-normal normal-case">(opcional, para agrupar o filtrar después)</span></FieldLabel>
            <input value={form.etiqueta} onChange={e => setForm(p => ({ ...p, etiqueta: e.target.value }))} placeholder="Ej: Viaje Brasil" className="input-field" />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.recurrente} onChange={e => setForm(p => ({ ...p, recurrente: e.target.checked }))} className="w-4 h-4 accent-blue-700" />
            <span className="text-slate-600 text-sm">Ingreso recurrente</span>
          </label>
          <div className="flex gap-3 pt-2">
            <button onClick={() => { setShowModal(false); setForm(FORM_INIT); setModalEditId(null) }} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={handleSave} disabled={saving || !form.monto || !form.fecha} className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Guardando...' : modalEditId ? 'Guardar cambios' : 'Guardar'}</button>
          </div>
        </div>
      </Modal>
      {/* ── Modal gráfico expandido ── */}
      {expandedChart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{background:'rgba(15,23,42,0.55)'}} onClick={()=>setExpandedChart(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-auto p-8 relative" onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setExpandedChart(null)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 border-none cursor-pointer text-lg">✕</button>

            {expandedChart==='evolucion' && <>
              <div className="text-slate-900 font-semibold text-lg mb-2">Evolución {periodoLabel}</div>
              <div className="flex gap-2 flex-wrap mb-4">
                {tiposBase.map(({ key, label, color }) => (
                  <button key={key} type="button" onClick={() => setHiddenKeys(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key])}
                    className="flex items-center gap-1.5 border-none bg-transparent cursor-pointer p-0 transition-opacity"
                    style={{ opacity: hiddenKeys.includes(key) ? 0.3 : 1 }}>
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                    <span className="text-slate-500 text-xs">{label}</span>
                  </button>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={chartData} barCategoryGap="28%" barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => v === 0 ? '' : fmtFull(v, m)} width={120} />
                  <Tooltip content={renderTooltip} />
                  {tiposBase.filter(({ key }) => !hiddenKeys.includes(key)).map(({ key, color }) => (
                    <Bar key={key} dataKey={key} name={key} fill={color} radius={0} maxBarSize={36} stackId={chartType === 'apilado' ? 'stack' : undefined} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </>}

            {expandedChart==='composicion' && <>
              <div className="text-slate-900 font-semibold text-lg mb-5">Composición {periodoLabel}</div>
              <div className="grid grid-cols-2 gap-8 items-center">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={compData} cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={3} dataKey="value">
                      {compData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={TT} formatter={(v: number, _: string, e: { payload?: { name?: string } }) => [fmtFull(v, m), e?.payload?.name ?? '']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-3">
                  {compData.map((d, i) => (
                    <div key={d.name} className="flex justify-between items-center">
                      <div className="flex items-center gap-2.5">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-slate-600 text-sm">{d.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 text-xs">{Math.round(d.value / compData.reduce((s, x) => s + x.value, 0) * 100)}%</span>
                        <span className="text-slate-900 text-sm font-mono font-bold">{fmtFull(d.value, m)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>}
          </div>
        </div>
      )}

    </div>
  )
}
