'use client'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import type { TooltipProps } from 'recharts'
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAppStore, useMonedasDisponibles } from '@/store/appStore'
import { useEgresos, useCategoriasCustom, useFrecuenciaCategorias, useDescripcionesDistintas, useEtiquetasDistintas, useProyectos, useAhorros, useMetas, useEtiquetas, useEgresoEtiquetas, usePersonas } from '@/hooks'
import { createEgreso, updateEgreso, deleteEgreso, createProyecto, createAhorro, getEtiquetas, setEtiquetasDeEgreso, updateAhorro, getAllEgresos, aplicarContribucionPorEtiquetas, createAhorroAjuste, sincronizarAjusteManualAhorro } from '@/lib/queries'
import { fmt, fmtFull, fmtDate, ocultarValor } from '@/lib/utils/formatters'
import { quienOpciones, colorQuien } from '@/lib/utils/quien'
import { MESES_CORTOS, TIPOS_EGRESO, META_COLORS } from '@/lib/utils/constants'
import { StatCard, PageHeader, Card, CardTitle, ChartToggle, Modal, LoadingSpinner, EmptyState, FieldLabel, RowMenu } from '@/components/ui'
import { EtiquetaChips, EtiquetaPickerModal } from '@/components/ui/Etiquetas'
import MontoInput from '@/components/ui/MontoInput'
import FechaInput from '@/components/ui/FechaInput'
import CategoriaSelector from '@/components/ui/CategoriaSelector'
import AutocompleteInput from '@/components/ui/AutocompleteInput'
import { parsePegadoTSV, matchOpcion, celdaFechaISO, parseCeldaMonto } from '@/lib/utils/pegado'
import { calcularTendencia } from '@/lib/utils/tendencia'
import type { Moneda, Quien, Egreso, CategoriaCustom } from '@/types'

const TT = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, color: '#0f172a' }
const PIE_COLORS = ['#1A5E9E','#F54927','#40B046','#E8A020','#D4537E','#5B3FA6','#1D9E75','#888780']
const HOY = new Date()
const PAGE_SIZE = 30

const FORM_INIT = {
  categoria: 'tarjeta', monto: '', descripcion: '',
  fecha: new Date().toISOString().split('T')[0],
  moneda: 'ARS' as Moneda, quien: 'ambos' as Quien, recurrente: false, etiqueta: '',
  cotizacion: '',
}

type SortKey = 'fecha' | 'monto' | 'categoria' | 'descripcion' | 'quien'
type SortDir = 'asc' | 'desc'
const COLS_DEFAULT: SortKey[] = ['fecha', 'descripcion', 'categoria', 'quien', 'monto']
const COL_LABEL: Record<SortKey, string> = { fecha: 'Fecha', descripcion: 'Descripción', categoria: 'Categoría', quien: 'Quién', monto: 'Importe' }

// ─── Widgets personalizables ────────────────────────────────────────────────
const WIDGET_OPTIONS_EGR = [
  { id: 'total',        label: 'Total del período', icon: '📤' },
  { id: 'tarjetas',     label: 'Tarjetas crédito',  icon: '💳' },
  { id: 'usd',          label: 'Inversiones USD',   icon: '💵' },
  { id: 'promedio',     label: 'Promedio mensual',  icon: '📅' },
  { id: 'top_categoria',label: 'Mayor categoría',   icon: '🏆' },
  { id: 'cantidad',     label: 'Cantidad de egresos',icon: '🔢' },
]
const DEFAULT_WIDGETS_EGR = ['total', 'tarjetas', 'usd', 'promedio']


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
                  {selected.includes(opt.key) && <span className="text-white text-[8px]"></span>}
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
            <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>{fmtFull(p.value as number, m)} <span style={{ fontWeight: 400, color: '#94a3b8' }}>({total>0?Math.round((p.value as number)/total*100):0}%)</span></span>
          </div>
        )
      })}
      {top5.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, marginTop: 6, borderTop: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: 10, color: '#94a3b8' }}>Total</span>
          <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#334155' }}>{fmtFull(total, m)}</span>
        </div>
      )}

    </div>
  )
}

// ─── SheetNewRow — fila de carga siempre visible, pegado posicional ─────────
type DraftRow = { id: string; categoria: string; descripcion: string; fecha: string; monto: string; moneda: Moneda; quien: Quien | '' }
const cellBase = 'w-full h-8 px-2 bg-transparent border-none outline-none focus:ring-2 focus:ring-blue-400/40 focus:relative focus:z-10 text-xs'

function blankDraftRow(): DraftRow {
  return { id: Math.random().toString(36).slice(2), categoria: '', descripcion: '', fecha: '', monto: '', moneda: 'ARS', quien: '' }
}

function SheetNewRow({ cols, tiposBase, categoriasCustom, frecuencia, descripciones, quienOpts, onSave, refetchCats }: {
  cols: SortKey[]
  tiposBase: { key: string; label: string; icon: string; color: string }[]
  categoriasCustom: CategoriaCustom[]
  frecuencia?: Record<string, number>
  descripciones?: string[]
  quienOpts: { key: string; label: string }[]
  onSave: (data: typeof FORM_INIT) => Promise<void>
  refetchCats: () => void
}) {
  const añoActivo = useAppStore(s => s.añoActivo)
  const [nuevaFila, setNuevaFila] = useState<DraftRow>(blankDraftRow())
  const [pendientes, setPendientes] = useState<DraftRow[]>([])
  const [justSaved, setJustSaved] = useState(false)

  const categoriasConocidas = [...tiposBase.map(t => ({ key: t.key, label: t.label })), ...categoriasCustom.map(c => ({ key: c.nombre, label: c.nombre }))]

  // Enter guarda con lo mínimo: fecha, descripción y monto. Categoría/Quién quedan en "Otro"/"Ambos" si no se eligieron.
  const puedeGuardar = (r: DraftRow) => !!(r.fecha && r.descripcion.trim() && r.monto)
  const filaConAlgo  = (r: DraftRow) => !!(r.fecha || r.descripcion.trim() || r.categoria || r.quien || r.monto)

  const commitFila = async (r: DraftRow) => {
    if (!puedeGuardar(r)) return
    await onSave({ categoria: r.categoria || 'otro', descripcion: r.descripcion, monto: r.monto, fecha: r.fecha, moneda: r.moneda, quien: (r.quien || 'ambos') as Quien, recurrente: false, etiqueta: '', cotizacion: '' })
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
        else if (col === 2) row.categoria = matchOpcion(val, categoriasConocidas)
        else if (col === 3) row.quien = matchOpcion(val, quienOpts) as Quien | ''
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
        <AutocompleteInput value={r.descripcion} onChange={v => onChange({ descripcion: v })} suggestions={descripciones ?? []} onPaste={handlePasteEnCelda(startRow, 1)}
          onKeyDown={handleKey} className={cellBase} />
      </td>
      <td className="border border-slate-200" style={{width:150}}>
        <CategoriaSelector bare modulo="egresos" value={r.categoria} onChange={v => onChange({ categoria: v })} frecuencia={frecuencia} onPaste={handlePasteEnCelda(startRow, 2)}
          onKeyDown={handleKey}
          categorias={categoriasCustom} categoriasBase={tiposBase} onCategoriasChange={refetchCats} />
      </td>
      <td className="border border-slate-200" style={{width:100}}>
        <select value={r.quien} onChange={e => onChange({ quien: e.target.value as Quien })} onPaste={handlePasteEnCelda(startRow, 3)}
          onKeyDown={handleKey} className={cellBase}>
          <option value="">—</option>
          {quienOpts.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
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
function InlineEditRow({ egreso, tiposBase, categoriasCustom, frecuencia, descripciones, quienOpts, onSave, onCancel, refetchCats }: {
  egreso: Egreso
  tiposBase: { key: string; label: string; icon: string; color: string }[]
  categoriasCustom: CategoriaCustom[]
  frecuencia?: Record<string, number>
  descripciones?: string[]
  quienOpts: { key: string; label: string }[]
  onSave: (id: string, data: Partial<typeof FORM_INIT>) => Promise<void>
  onCancel: () => void
  refetchCats: () => void
}) {
  const [form, setForm] = useState({
    categoria: egreso.categoria, monto: String(egreso.monto),
    descripcion: egreso.descripcion, fecha: egreso.fecha,
    moneda: egreso.moneda as Moneda, quien: egreso.quien as Quien,
    recurrente: egreso.recurrente,
  })
  const [saving, setSaving] = useState(false)
  const handle = async () => { setSaving(true); await onSave(egreso.id, form); setSaving(false) }
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handle() }
    if (e.key === 'Escape') onCancel()
  }

  return (
    <tr className="bg-blue-50/60">
      <td className="border border-slate-200" style={{width:100}}><FechaInput bare value={form.fecha} onChange={iso => setForm(p => ({ ...p, fecha: iso }))} onKeyDown={handleKeyDown} className={cellBase} /></td>
      <td className="border border-slate-200"><AutocompleteInput value={form.descripcion} onChange={v => setForm(p => ({ ...p, descripcion: v }))} suggestions={descripciones ?? []} onKeyDown={handleKeyDown} className={cellBase} placeholder="Descripción" /></td>
      <td className="border border-slate-200" style={{width:150}}>
        <CategoriaSelector bare modulo="egresos" value={form.categoria} onChange={v => setForm(p => ({ ...p, categoria: v }))} frecuencia={frecuencia} onKeyDown={handleKeyDown}
          categorias={categoriasCustom} categoriasBase={tiposBase} onCategoriasChange={refetchCats} />
      </td>
      <td className="border border-slate-200" style={{width:100}}>
        <select value={form.quien} onChange={e => setForm(p => ({ ...p, quien: e.target.value as Quien }))} onKeyDown={handleKeyDown} className={cellBase}>
          {quienOpts.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
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
export default function EgresosPage() {
  const { añoActivo, vistaTipo, mesActivo, monedaPrincipal: m, vistaTablaTarjetas, setVistaTablaTarjetas, saldosOcultos } = useAppStore()
  const monedasPalette = useMonedasDisponibles()
  const esMensual = vistaTipo === 'mensual'
  const { data: egresos, loading, refetch } = useEgresos()
  const { data: rawCategorias, refetch: refetchCats } = useCategoriasCustom('egresos')
  const frecuenciaCats = useFrecuenciaCategorias('egresos')
  const descripcionesQ = useDescripcionesDistintas('egresos')
  const etiquetasQ = useEtiquetasDistintas()
  const { data: proyectos, refetch: refetchProyectos } = useProyectos()
  const { data: ahorros, refetch: refetchAhorros } = useAhorros()
  const { data: metas, refetch: refetchMetas } = useMetas()
  const { data: etiquetas, refetch: refetchEtiquetas } = useEtiquetas()
  const { data: egresoEtiquetas, refetch: refetchEgresoEtiquetas } = useEgresoEtiquetas()
  const { data: personas } = usePersonas()
  const quienOpts = useMemo(() => quienOpciones(personas), [personas])
  const [pickerTipo, setPickerTipo]   = useState<'proyecto'|'ahorro'|'meta'|null>(null)
  const [pickerEgreso, setPickerEgreso] = useState<string|null>(null)
  const [filterEtiquetas, setFilterEtiquetas] = useState<string[]>([])

  const etiquetasDeEgreso = (id: string) => (egresoEtiquetas ?? []).filter(r => r.egreso_id === id).map(r => r.etiqueta_id)

  const abrirPicker = (tipo: 'proyecto'|'ahorro'|'meta', egresoId: string) => { setPickerTipo(tipo); setPickerEgreso(egresoId) }

  const handleConfirmEtiquetas = async (ids: string[]) => {
    if (!pickerEgreso) return
    const egreso = (egresos ?? []).find(e => e.id === pickerEgreso)
    const idsAntes = etiquetasDeEgreso(pickerEgreso)
    await setEtiquetasDeEgreso(pickerEgreso, ids)
    // Un egreso etiquetado a Ahorro/Meta de su misma moneda suma automático al total
    // (como ya pasaba antes solo para conversión de moneda) — queda registrado en su historial.
    if (egreso) {
      await aplicarContribucionPorEtiquetas({
        idsAntes, idsDespues: ids, etiquetas: etiquetas ?? [], ahorros: ahorros ?? [], metas: metas ?? [],
        monto: egreso.monto, moneda: egreso.moneda as Moneda, fecha: egreso.fecha, signo: 1,
        nota: `Egreso: ${egreso.descripcion}`,
      })
      refetchAhorros(); refetchMetas()
    }
    refetchEgresoEtiquetas()
  }

  const handleCrearProyecto = async (nombre: string) => {
    const p = await createProyecto({ nombre, presupuesto: 0, moneda: m, icono: '📁', color: META_COLORS[Math.floor(Math.random()*META_COLORS.length)], activo: true, fecha_inicio: null, fecha_fin: null })
    const fresh = await getEtiquetas()
    refetchProyectos(); refetchEtiquetas()
    return fresh.find(e => e.proyecto_id === p.id)?.id ?? null
  }

  const handleCrearAhorro = async (nombre: string) => {
    const a = await createAhorro({ nombre, categoria: nombre, moneda: m, icono: '💰', color: META_COLORS[Math.floor(Math.random()*META_COLORS.length)], ajuste_manual: 0 })
    const fresh = await getEtiquetas()
    refetchAhorros(); refetchEtiquetas()
    return fresh.find(e => e.ahorro_id === a.id)?.id ?? null
  }
  const categoriasCustom = (rawCategorias ?? []) as CategoriaCustom[]

  const data = useMemo(() =>
    esMensual ? (egresos ?? []).filter(e => e.mes === mesActivo) : (egresos ?? [])
  , [egresos, esMensual, mesActivo])

  // Para widgets/gráficos: los movimientos de conversión de moneda no son egresos reales.
  // La tabla de abajo (filtered, más abajo) sigue mostrando todo, para poder gestionarlos.
  const egresosSinConv = egresos ?? []
  const dataSinConv    = data

  const periodoLabel = esMensual ? `${MESES_CORTOS[mesActivo-1]} ${añoActivo}` : `${añoActivo}`

  const [chartType, setChartType]     = useState<'apilado'|'agrupado'>('apilado')
  const [sidePanel, setSidePanel]     = useState<'composicion'|'top'>('composicion')
  const [compMes, setCompMes]         = useState(HOY.getMonth())
  const [hiddenKeys, setHiddenKeys]   = useState<string[]>([])
  const [filterCats, setFilterCats]   = useState<string[]>([])
  const [filterQuien, setFilterQuien] = useState<string[]>([])
  const [search, setSearch]           = useState('')
  const [showModal, setShowModal]     = useState(false)
  const [widgets, setWidgets]           = useState<string[]>(DEFAULT_WIDGETS_EGR)
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

  useEffect(() => {
    if (!expandedChart) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedChart(null) }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [expandedChart])
  const dragCol  = useRef<number|null>(null)
  const dragOver = useRef<number|null>(null)

  const tiposBase = useMemo(() =>
    Object.entries(TIPOS_EGRESO).map(([key, cfg]) => ({ key, label: cfg.label, icon: cfg.icon, color: cfg.color }))
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

  const getTipoInfo = (cat: string) =>
    allTipos.find(t => t.key === cat) ?? { key: cat, label: cat, icon: '', color: '#888780' }

  const chartDataAnual = useMemo(() => MESES_CORTOS.map((month, i) => {
    const mes = i + 1
    const point: Record<string, number|string> = { month }
    tiposBase.forEach(({ key }) => {
      point[key] = egresosSinConv.filter(x => x.mes === mes && x.categoria === key).reduce((s, x) => s + x.monto, 0)
    })
    return point
  }), [egresosSinConv, tiposBase])

  const chartDataMensual = useMemo(() => {
    const diasEnMes = new Date(añoActivo, mesActivo, 0).getDate()
    return Array.from({ length: diasEnMes }, (_, i) => {
      const dia = i + 1
      const point: Record<string, number|string> = { month: String(dia) }
      tiposBase.forEach(({ key }) => {
        point[key] = dataSinConv.filter(x => Number(x.fecha.slice(8,10)) === dia && x.categoria === key).reduce((s, x) => s + x.monto, 0)
      })
      return point
    })
  }, [dataSinConv, tiposBase, añoActivo, mesActivo])

  const chartData = esMensual ? chartDataMensual : chartDataAnual

  const compData = useMemo(() => {
    const src = esMensual ? dataSinConv : (compMes === -1 ? egresosSinConv : egresosSinConv.filter(x => x.mes === compMes + 1))
    return allTipos
      .map(t => ({ name: t.label, color: t.color, value: src.filter(e => e.categoria === t.key).reduce((s, e) => s + e.monto, 0) }))
      .filter(d => d.value > 0).sort((a, b) => b.value - a.value)
  }, [egresosSinConv, dataSinConv, esMensual, compMes, allTipos])

  const topAño = useMemo(() =>
    allTipos
      .map(t => ({ key: t.key, label: t.label, color: t.color, value: dataSinConv.filter(e => e.categoria === t.key).reduce((s, e) => s + e.monto, 0) }))
      .filter(d => d.value > 0).sort((a, b) => b.value - a.value).slice(0, 8)
  , [dataSinConv, allTipos])
  const totalTopAño = useMemo(() => topAño.reduce((s, d) => s + d.value, 0), [topAño])

  const filtered = useMemo(() => {
    const rows = data
      .filter(e => filterCats.length === 0 || filterCats.includes(e.categoria))
      .filter(e => filterQuien.length === 0 || filterQuien.includes(e.quien))
      .filter(e => filterEtiquetas.length === 0 || etiquetasDeEgreso(e.id).some(id => filterEtiquetas.includes(id)))
      .filter(e => !search || e.descripcion.toLowerCase().includes(search.toLowerCase()) || (e.etiqueta ?? '').toLowerCase().includes(search.toLowerCase()))
    return [...rows].sort((a, b) => {
      const va = a[sortKey as keyof Egreso] as string|number
      const vb = b[sortKey as keyof Egreso] as string|number
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [data, filterCats, filterQuien, filterEtiquetas, egresoEtiquetas, search, sortKey, sortDir])

  const visibleRows = filtered.slice(0, page * PAGE_SIZE)
  const hasMore     = filtered.length > visibleRows.length

  const total         = dataSinConv.reduce((s, e) => s + e.monto, 0)
  // Tendencia real segun la vista activa (mes activo vs mes anterior, o año activo vs año anterior) —
  // antes esto se calculaba siempre contra el mes calendario real, ignorando la vista/mes elegidos.
  const { trend: trendMes, label: trendMesLabel } = calcularTendencia(egresosSinConv, vistaTipo, mesActivo, añoActivo)
  const totalTarjetas = dataSinConv.filter(e => e.categoria === 'tarjeta').reduce((s, e) => s + e.monto, 0)
  const totalUSD      = dataSinConv.filter(e => e.categoria === 'usd').reduce((s, e) => s + e.monto, 0)
  const mesesConDatos = new Set(egresosSinConv.map(e => e.mes)).size
  const promedio      = mesesConDatos > 0 ? Math.round(egresosSinConv.reduce((s,e)=>s+e.monto,0) / mesesConDatos) : 0

  // Tendencia real para el resto de los widgets — mismo criterio que "Total" (mes/año activo vs período anterior).
  const { trend: trendTarjetas, label: trendTarjetasLabel } = calcularTendencia(egresosSinConv.filter(e => e.categoria === 'tarjeta'), vistaTipo, mesActivo, añoActivo)
  const { trend: trendUSD, label: trendUSDLabel } = calcularTendencia(egresosSinConv.filter(e => e.categoria === 'usd'), vistaTipo, mesActivo, añoActivo)
  const { trend: trendCantidad, label: trendCantidadLabel } = calcularTendencia(egresosSinConv.map(e => ({ monto: 1, mes: e.mes, año: e.año })), vistaTipo, mesActivo, añoActivo)
  const trendTop = topAño[0] ? calcularTendencia(egresosSinConv.filter(e => e.categoria === topAño[0].key), vistaTipo, mesActivo, añoActivo) : { trend: undefined, label: '' }
  // "Promedio mensual" es un promedio histórico, no del período activo — su comparativa natural
  // es año activo vs año anterior (promedio mensual de cada año completo).
  const promedioPorAño = (año: number) => {
    const regs = egresosSinConv.filter(e => e.año === año)
    const meses = new Set(regs.map(e => e.mes)).size
    return meses > 0 ? regs.reduce((s, e) => s + e.monto, 0) / meses : 0
  }
  const promedioAñoAnt = promedioPorAño(añoActivo - 1)
  const trendPromedio  = promedioAñoAnt > 0 ? Math.round((promedioPorAño(añoActivo) - promedioAñoAnt) / promedioAñoAnt * 100) : undefined

  const getWidgetValue = (id: string) => {
    switch (id) {
      case 'total':         return { value: fmt(total, m), sub: 'Acumulado', trend: trendMes, trendInvert: true, trendLabel: trendMesLabel, color: '#F54927' }
      case 'tarjetas':      return { value: fmt(totalTarjetas, m), sub: `${total > 0 ? Math.round(totalTarjetas / total * 100) : 0}% del total`, trend: trendTarjetas, trendInvert: true, trendLabel: trendTarjetasLabel, color: '#1A5E9E' }
      case 'usd':           return { value: fmt(totalUSD, m), sub: `${total > 0 ? Math.round(totalUSD / total * 100) : 0}% del total`, trend: trendUSD, trendInvert: true, trendLabel: trendUSDLabel, color: '#40B046' }
      case 'promedio':      return { value: fmt(promedio, m), sub: 'Sobre meses con datos', trend: trendPromedio, trendInvert: true, trendLabel: 'vs promedio año anterior', color: '#E8A020' }
      case 'top_categoria': return { value: topAño[0]?.label ?? '—', sub: topAño[0] ? fmt(topAño[0].value, m) : 'Sin datos', trend: trendTop.trend, trendInvert: true, trendLabel: trendTop.label, color: topAño[0]?.color ?? '#888780' }
      case 'cantidad':      return { value: String(data.length), sub: 'Egresos registrados', trend: trendCantidad, trendInvert: true, trendLabel: trendCantidadLabel, color: '#5B3FA6' }
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
      const payload = {
        categoria: form.categoria, descripcion: form.descripcion, monto: parseFloat(form.monto), moneda: form.moneda,
        fecha: form.fecha, quien: form.quien, recurrente: form.recurrente, etiqueta: form.etiqueta || null,
        cotizacion: form.cotizacion ? parseFloat(form.cotizacion) : null,
      }
      if (modalEditId) {
        await updateEgreso(modalEditId, payload)
      } else {
        await createEgreso(payload)
      }
      setShowModal(false); setForm(FORM_INIT); setModalEditId(null); refetch()
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  const openEditModal = (egreso: Egreso) => {
    setForm({
      categoria: egreso.categoria, monto: String(egreso.monto), descripcion: egreso.descripcion,
      fecha: egreso.fecha, moneda: egreso.moneda as Moneda, quien: egreso.quien, recurrente: egreso.recurrente,
      etiqueta: egreso.etiqueta ?? '',
      cotizacion: egreso.cotizacion != null ? String(egreso.cotizacion) : '',
    })
    setModalEditId(egreso.id)
    setShowModal(true)
  }

  // Venir desde "Revisión" (Salud de los datos) con ?editar=<id> abre directo el modal
  // de ese movimiento, sin importar si está fuera del período que tenés seleccionado.
  const searchParams = useSearchParams()
  useEffect(() => {
    const editarId = searchParams.get('editar')
    if (!editarId) return
    getAllEgresos().then(todos => {
      const item = todos.find(e => e.id === editarId)
      if (item) openEditModal(item)
    }).catch(()=>{})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handleSheetSave = useCallback(async (data: typeof FORM_INIT) => {
    await createEgreso({ categoria: data.categoria, descripcion: data.descripcion, monto: parseFloat(data.monto), moneda: data.moneda, fecha: data.fecha, quien: data.quien, recurrente: data.recurrente, etiqueta: data.etiqueta || null })
    refetch()
  }, [refetch])

  const handleUpdate = async (id: string, data: Partial<typeof FORM_INIT>) => {
    await updateEgreso(id, { categoria: data.categoria, descripcion: data.descripcion, monto: parseFloat(data.monto ?? '0'), moneda: data.moneda, fecha: data.fecha, quien: data.quien, recurrente: data.recurrente })
    setEditingId(null); refetch()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este egreso?')) return
    await deleteEgreso(id); refetch()
  }

  const handleDuplicar = async (egreso: Egreso) => {
    const nuevo = await createEgreso({
      categoria: egreso.categoria, monto: egreso.monto, moneda: egreso.moneda,
      descripcion: egreso.descripcion, fecha: egreso.fecha, quien: egreso.quien,
      recurrente: false, etiqueta: egreso.etiqueta,
    })
    const propias = (egresoEtiquetas ?? []).filter(r => r.egreso_id === egreso.id).map(r => r.etiqueta_id)
    if (propias.length > 0) await setEtiquetasDeEgreso(nuevo.id, propias)
    refetch(); refetchEgresoEtiquetas()
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

  const setFilterCatsR  = (v: string[]) => { setFilterCats(v); setPage(1) }
  const setFilterQuienR = (v: string[]) => { setFilterQuien(v); setPage(1) }
  const setSearchR      = (v: string)   => { setSearch(v); setPage(1) }

  const renderTooltip = (props: TooltipProps<ValueType, NameType>) =>
    <CustomTooltip {...props} getTipoInfo={getTipoInfo} m={m} />

  if (loading && !egresos) return <LoadingSpinner />

  return (
    <div>
      <PageHeader title="Egresos"
        action={
          <div className="flex gap-2 flex-wrap justify-end">
            <button
              onClick={() => setEditingWidgets(v => !v)}
              className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${editingWidgets ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
              {editingWidgets ? '✓ Listo' : '⚙ Personalizar widgets'}
            </button>
            <button className="btn-primary hidden md:inline-block" onClick={() => { setForm(FORM_INIT); setModalEditId(null); setShowModal(true) }}>+ Nuevo egreso</button>
          </div>
        } />

      {/* ── StatCards personalizables ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {widgets.map((widgetId, index) => {
          const opt = WIDGET_OPTIONS_EGR.find(o => o.id === widgetId)!
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
                    {WIDGET_OPTIONS_EGR.map(o => <option key={o.id} value={o.id}>{o.icon} {o.label}</option>)}
                  </select>
                </div>
              )}
              <div className={editingWidgets ? 'ring-2 ring-blue-400 ring-offset-1 rounded-2xl' : ''}>
                <StatCard label={label} value={wv.value} sub={wv.sub} color={wv.color}
                  trend={'trend' in wv ? wv.trend : undefined} trendInvert={'trendInvert' in wv ? wv.trendInvert : undefined}
                  trendLabel={'trendLabel' in wv ? wv.trendLabel : undefined} />
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Layout principal: Transacciones 2/3 | Widgets 1/3 ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">

        {/* ── Columna izquierda: Transacciones ── */}
        <div className="md:col-span-2">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="text-slate-900 font-semibold text-[15px]">Transacciones</div>
              <span className="text-slate-400 text-xs">{filtered.length} registros · {saldosOcultos ? ocultarValor(fmt(filtered.reduce((s, e) => s + e.monto, 0), m)) : fmt(filtered.reduce((s, e) => s + e.monto, 0), m)}</span>
            </div>
            <div className="flex gap-2 flex-wrap mb-4 items-center">
              <div className="relative flex-1 min-w-[140px] max-w-[220px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">⌕</span>
                <input value={search} onChange={e => setSearchR(e.target.value)} placeholder="Buscar descripción..." className="input-field pl-8 py-1.5 text-xs" />
              </div>
              <MultiDropdown label="Categoría" options={allTipos.map(t => ({ key: t.key, label: t.label }))} selected={filterCats} onChange={setFilterCatsR} />
              <MultiDropdown label="Quién" options={quienOpts} selected={filterQuien} onChange={setFilterQuienR} />
              {(etiquetas ?? []).length > 0 && (
                <MultiDropdown label="Etiquetas" options={(etiquetas ?? []).filter(e=>e.estado==='activa').map(e => ({ key: e.id, label: e.nombre }))} selected={filterEtiquetas} onChange={v => { setFilterEtiquetas(v); setPage(1) }} />
              )}
              {(filterCats.length > 0 || filterQuien.length > 0 || filterEtiquetas.length > 0 || search) && (
                <button onClick={() => { setFilterCatsR([]); setFilterQuienR([]); setFilterEtiquetas([]); setSearchR('') }}
                  className="text-xs text-slate-400 hover:text-slate-600 border-none bg-transparent cursor-pointer underline">
                  Limpiar
                </button>
              )}
              <div className="hidden md:flex gap-1 ml-auto flex-shrink-0">
                <button onClick={() => setVistaTablaTarjetas('tabla')}
                  className={`text-xs px-2.5 py-1 rounded-lg border cursor-pointer transition-all ${vistaTablaTarjetas === 'tabla' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
                  ▦ Tabla
                </button>
                <button onClick={() => setVistaTablaTarjetas('tarjetas')}
                  className={`text-xs px-2.5 py-1 rounded-lg border cursor-pointer transition-all ${vistaTablaTarjetas === 'tarjetas' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
                  ▤ Tarjetas
                </button>
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState title="Sin resultados" description="Probá cambiando los filtros o la búsqueda." />
            ) : (
              <>
                <div className={`overflow-x-auto ${vistaTablaTarjetas === 'tabla' ? 'hidden md:block' : 'hidden'}`}>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        {cols.map((col, i) => (
                          <th key={col} draggable
                            onDragStart={() => onDragStart(i)} onDragEnter={() => onDragEnter(i)}
                            onDragEnd={onDragEnd} onDragOver={e => e.preventDefault()}
                            onClick={() => toggleSort(col)}
                            style={col==='fecha'?{width:100}:col==='categoria'?{width:150}:col==='quien'?{width:100}:col==='monto'?{width:130}:undefined}
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
                      <SheetNewRow cols={cols} tiposBase={tiposBase} categoriasCustom={categoriasCustom} frecuencia={frecuenciaCats.data ?? undefined} descripciones={descripcionesQ.data ?? undefined} quienOpts={quienOpts} onSave={handleSheetSave} refetchCats={refetchCats} />
                      {visibleRows.map((egreso, rowIdx) => {
                        const cfg       = getTipoInfo(egreso.categoria)
                        const isEditing = editingId === egreso.id
                        const bg        = rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'

                        if (isEditing) return (
                          <InlineEditRow key={egreso.id} egreso={egreso} tiposBase={tiposBase}
                            categoriasCustom={categoriasCustom} frecuencia={frecuenciaCats.data ?? undefined} descripciones={descripcionesQ.data ?? undefined} quienOpts={quienOpts} onSave={handleUpdate}
                            onCancel={() => setEditingId(null)} refetchCats={refetchCats} />
                        )

                        const cellFor = (col: SortKey) => {
                          switch (col) {
                            case 'fecha':       return <td key={col} className="border border-slate-200 py-2 px-2 text-sm" style={{width:100}}><span className="text-slate-500 text-xs font-mono whitespace-nowrap">{fmtDate(egreso.fecha)}</span></td>
                            case 'descripcion': return <td key={col} className="border border-slate-200 py-2 px-2 text-sm"><span onClick={() => openEditModal(egreso)} className="text-slate-700 font-medium cursor-pointer hover:underline hover:font-bold">{egreso.descripcion || cfg.label}</span>{egreso.etiqueta && <span className="ml-2 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{egreso.etiqueta}</span>}<EtiquetaChips etiquetaIds={etiquetasDeEgreso(egreso.id)} etiquetas={etiquetas ?? []} proyectos={proyectos ?? []} ahorros={ahorros ?? []} /></td>
                            case 'categoria':   return <td key={col} className="border border-slate-200 py-2 px-2 text-sm" style={{width:150}}><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: cfg.color + '18', color: cfg.color }}>{cfg.label}</span></td>
                            case 'quien':       { const cq = colorQuien(egreso.quien); return <td key={col} className="border border-slate-200 py-2 px-2 text-sm" style={{width:100}}><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cq.bg} ${cq.text}`}>{egreso.quien}</span></td> }
                            case 'monto':       return <td key={col} className="border border-slate-200 py-2 px-2 text-sm text-right" style={{width:130}}><span className="text-red-600 font-mono font-bold">{saldosOcultos ? ocultarValor('-'+fmtFull(egreso.monto, egreso.moneda as Moneda)) : '-'+fmtFull(egreso.monto, egreso.moneda as Moneda)}</span></td>
                            default: return null
                          }
                        }

                        return (
                          <tr key={egreso.id} className={`group ${bg} hover:bg-blue-50 transition-colors`}>
                            {cols.map(col => cellFor(col))}
                            <td className="border border-slate-200 text-right px-1 select-none" style={{width:32}}>
                              <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                <RowMenu items={[
                                  { label: 'Editar', onClick: () => setEditingId(egreso.id) },
                                  { label: 'Asociar a proyecto', onClick: () => abrirPicker('proyecto', egreso.id) },
                                  { label: 'Asociar a ahorro', onClick: () => abrirPicker('ahorro', egreso.id) },
                                  { label: 'Asociar a meta', onClick: () => abrirPicker('meta', egreso.id) },
                                  { label: 'Duplicar', onClick: () => handleDuplicar(egreso) },
                                  { label: 'Eliminar', onClick: () => handleDelete(egreso.id), danger: true },
                                ]} />
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ── Vista lista (mobile): fecha, descripción, importe, categoría, quién — sin editar/borrar inline, tocar abre el modal completo ── */}
                <div className={`flex flex-col ${vistaTablaTarjetas === "tarjetas" ? "" : "md:hidden"}`}>
                  {visibleRows.map((egreso, rowIdx) => {
                    const cfg = getTipoInfo(egreso.categoria)
                    const bg  = rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                    return (
                      <div key={egreso.id} onClick={() => openEditModal(egreso)}
                        className={`px-3 py-3 border-b border-slate-100 last:border-0 cursor-pointer ${bg} md:flex md:items-center md:gap-4`}>
                        {/* Columna 1: fecha */}
                        <div className="text-slate-400 text-[12px] font-mono mb-0.5 md:mb-0 md:w-16 md:flex-shrink-0">{fmtDate(egreso.fecha)}</div>
                        {/* Columna 2: descripción */}
                        <div className="text-slate-700 font-medium text-[15px] mb-1 md:mb-0 md:flex-1 md:min-w-0 md:truncate">
                          {egreso.descripcion || cfg.label}
                          <EtiquetaChips etiquetaIds={etiquetasDeEgreso(egreso.id)} etiquetas={etiquetas ?? []} proyectos={proyectos ?? []} ahorros={ahorros ?? []} />
                        </div>
                        {/* Columna 3: categoría + quién */}
                        <div className="flex items-center gap-1.5 flex-wrap md:flex-nowrap md:order-3 md:w-[190px] md:flex-shrink-0">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: cfg.color + '18', color: cfg.color }}>{cfg.label}</span>
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${colorQuien(egreso.quien).bg} ${colorQuien(egreso.quien).text}`}>{egreso.quien}</span>
                                                    {egreso.etiqueta && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{egreso.etiqueta}</span>}
                        </div>
                        {/* Columna 4: monto */}
                        <div className="text-red-600 font-mono font-bold text-[17px] mb-1.5 md:mb-0 md:order-4 md:text-[15px] md:w-[130px] md:flex-shrink-0 md:text-right">{saldosOcultos ? ocultarValor('-'+fmtFull(egreso.monto, egreso.moneda as Moneda)) : '-'+fmtFull(egreso.monto, egreso.moneda as Moneda)}</div>
                      </div>
                    )
                  })}
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
              Evolución {periodoLabel}
            </CardTitle>
            <div className="flex gap-2 flex-wrap mb-3">
              {tiposBase.map(({ key, label, color }) => (
                <button key={key} type="button" onClick={() => setHiddenKeys(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key])}
                  className="flex items-center gap-1.5 border-none bg-transparent cursor-pointer p-0 transition-opacity"
                  style={{ opacity: hiddenKeys.includes(key) ? 0.3 : 1 }}>
                  <div className="w-2 h-2 rounded-sm" style={{ background: color }} />
                  <span className="text-slate-500 text-[10px]">{label}</span>
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
          <Card className="cursor-pointer hover:border-blue-200 hover:shadow-lg hover:-translate-y-0.5 transition-all" onClick={()=>{ if(sidePanel==='composicion') setExpandedChart('composicion') }}>
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-4" onClick={e=>e.stopPropagation()}>
              {(['composicion', 'top'] as const).map(v => (
                <button key={v} onClick={(e) => { e.stopPropagation(); setSidePanel(v) }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all border-none cursor-pointer ${sidePanel === v ? 'bg-white text-slate-900 shadow-sm' : 'bg-transparent text-slate-500'}`}>
                  {v === 'composicion' ? 'Composición' : 'Top categorías'}
                </button>
              ))}
            </div>

            {sidePanel === 'composicion' && (
              <>
                {!esMensual && (
                  <div className="flex items-center justify-between mb-3" onClick={e=>e.stopPropagation()}>
                    <span className="text-slate-500 text-xs font-medium">Mes</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setCompMes(v => Math.max(-1, v - 1))} className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer text-sm">‹</button>
                      <span className="text-xs font-medium text-slate-700 min-w-[44px] text-center">{compMes === -1 ? 'Acum.' : MESES_CORTOS[compMes]}</span>
                      <button onClick={() => setCompMes(v => Math.min(11, v + 1))} className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer text-sm">›</button>
                    </div>
                  </div>
                )}
                {compData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={130}>
                      <PieChart>
                        <Pie data={compData} cx="50%" cy="50%" innerRadius={36} outerRadius={58} paddingAngle={3} dataKey="value">
                          {compData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={TT} formatter={(v: number, _: string, e: { payload?: { name?: string } }) => { const tot = compData.reduce((s, x) => s + x.value, 0); return [`${fmt(v, m)} (${tot > 0 ? Math.round(v / tot * 100) : 0}%)`, e?.payload?.name ?? ''] }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col gap-1 mt-1">
                      {compData.slice(0, 5).map((d, i) => (
                        <div key={d.name} className="flex justify-between items-center">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="text-slate-500 text-[10px]">{d.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400 text-[10px]">{Math.round(d.value / compData.reduce((s, x) => s + x.value, 0) * 100)}%</span>
                            <span className="text-slate-900 text-[10px] font-mono font-bold">{fmt(d.value, m)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <div className="text-center text-slate-400 text-sm py-4">Sin datos</div>}
              </>
            )}

            {sidePanel === 'top' && (
              <>
                <div className="text-xs text-slate-400 mb-3 font-medium">{esMensual ? `${MESES_CORTOS[mesActivo-1]} ${añoActivo}` : `Año ${añoActivo}`} — por categoría</div>
                {topAño.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {topAño.map((d, i) => {
                      const pct = topAño[0].value > 0 ? Math.round(d.value / topAño[0].value * 100) : 0
                      const pctTotal = totalTopAño > 0 ? Math.round(d.value / totalTopAño * 100) : 0
                      return (
                        <div key={d.label}>
                          <div className="flex justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-slate-400 w-3">{i + 1}</span>
                              <span className="text-xs font-medium text-slate-700">{d.label} <span className="text-slate-400">({pctTotal}%)</span></span>
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

      <Modal open={showModal} onClose={() => { setShowModal(false); setForm(FORM_INIT); setModalEditId(null) }} title={modalEditId ? 'Editar egreso' : 'Nuevo egreso'}>
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Categoría</FieldLabel>
            <CategoriaSelector modulo="egresos" value={form.categoria} onChange={v => setForm(p => ({ ...p, categoria: v }))} frecuencia={frecuenciaCats.data ?? undefined}
              categorias={categoriasCustom} categoriasBase={tiposBase} onCategoriasChange={refetchCats} />
          </div>
          <div><FieldLabel>Descripción</FieldLabel>
            <AutocompleteInput value={form.descripcion} onChange={v => setForm(p => ({ ...p, descripcion: v }))} suggestions={descripcionesQ.data ?? []} placeholder="Ej: Pago tarjeta Galicia" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Monto</FieldLabel><MontoInput value={form.monto} onChange={raw => setForm(p => ({ ...p, monto: raw }))} /></div>
            <div><FieldLabel>Moneda</FieldLabel>
              <select value={form.moneda} onChange={e => setForm(p => ({ ...p, moneda: e.target.value as Moneda }))} className="input-field">
                {monedasPalette.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {form.moneda !== 'ARS' && (
            <div><FieldLabel>Cotización <span className="text-slate-400 font-normal normal-case">(opcional — cuántos ARS vale 1 {form.moneda} ese día)</span></FieldLabel>
              <MontoInput value={form.cotizacion} onChange={raw => setForm(p => ({ ...p, cotizacion: raw }))} placeholder="0" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Fecha</FieldLabel><FechaInput value={form.fecha} onChange={iso => setForm(p => ({ ...p, fecha: iso }))} /></div>
            <div><FieldLabel>Quién</FieldLabel>
              <select value={form.quien} onChange={e => setForm(p => ({ ...p, quien: e.target.value as Quien }))} className="input-field">
                {quienOpts.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <FieldLabel>Etiqueta <span className="text-slate-400 font-normal normal-case">(opcional, para agrupar o filtrar después)</span></FieldLabel>
            <AutocompleteInput value={form.etiqueta} onChange={v => setForm(p => ({ ...p, etiqueta: v }))} suggestions={etiquetasQ.data ?? []} placeholder="Ej: Viaje Brasil" />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.recurrente} onChange={e => setForm(p => ({ ...p, recurrente: e.target.checked }))} className="w-4 h-4 accent-blue-700" />
            <span className="text-slate-600 text-sm">Egreso recurrente</span>
          </label>
          <div className="flex gap-3 pt-2">
            {modalEditId && (
              <button onClick={() => { handleDelete(modalEditId); setShowModal(false); setForm(FORM_INIT); setModalEditId(null) }}
                className="text-red-500 hover:text-red-700 text-sm font-medium border-none bg-transparent cursor-pointer px-2">
                Eliminar
              </button>
            )}
            <button onClick={() => { setShowModal(false); setForm(FORM_INIT); setModalEditId(null) }} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={handleSave} disabled={saving || !form.monto || !form.fecha} className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Guardando...' : modalEditId ? 'Guardar cambios' : 'Guardar'}</button>
          </div>
        </div>
      </Modal>
      {/* ── Modal gráfico expandido ── */}
      {expandedChart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6" style={{background:'rgba(15,23,42,0.55)'}} onClick={()=>setExpandedChart(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-auto p-4 md:p-8 relative" onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setExpandedChart(null)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 border-none cursor-pointer text-lg">✕</button>

            {expandedChart==='evolucion' && <>
              <div className="flex items-center justify-between mb-4">
                <div className="text-slate-900 font-semibold text-lg">Evolución {periodoLabel}</div>
                <ChartToggle options={[{ value: 'apilado', label: '▋ Apilado' }, { value: 'agrupado', label: '▋ Agrupado' }]} value={chartType} onChange={v => setChartType(v as 'apilado'|'agrupado')} />
              </div>
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
              <div className="flex items-center justify-between mb-5">
                <div className="text-slate-900 font-semibold text-lg">Composición {periodoLabel}</div>
                {!esMensual && (
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 text-xs">Mes:</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setCompMes(v => Math.max(-1, v - 1))} className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer text-sm">‹</button>
                      <span className="text-xs font-medium text-slate-700 min-w-[44px] text-center">{compMes === -1 ? 'Acum.' : MESES_CORTOS[compMes]}</span>
                      <button onClick={() => setCompMes(v => Math.min(11, v + 1))} className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer text-sm">›</button>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-8 items-center">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={compData} cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={3} dataKey="value">
                      {compData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={TT} formatter={(v: number, _: string, e: { payload?: { name?: string } }) => { const tot = compData.reduce((s, x) => s + x.value, 0); return [`${fmtFull(v, m)} (${tot > 0 ? Math.round(v / tot * 100) : 0}%)`, e?.payload?.name ?? ''] }} />
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

      {pickerTipo && pickerEgreso && (() => {
        const egresoPicker = (egresos ?? []).find(e => e.id === pickerEgreso)
        return (
        <EtiquetaPickerModal
          open={!!pickerTipo}
          onClose={() => { setPickerTipo(null); setPickerEgreso(null) }}
          tipo={pickerTipo}
          etiquetas={etiquetas ?? []}
          proyectos={proyectos ?? []}
          ahorros={ahorros ?? []}
          metas={metas ?? []}
          seleccionadas={etiquetasDeEgreso(pickerEgreso).filter(id => (etiquetas ?? []).find(e => e.id === id)?.tipo === pickerTipo)}
          onConfirm={async (ids) => {
            const otras = etiquetasDeEgreso(pickerEgreso).filter(id => (etiquetas ?? []).find(e => e.id === id)?.tipo !== pickerTipo)
            await handleConfirmEtiquetas([...otras, ...ids])
          }}
          onCrear={pickerTipo === 'proyecto' ? handleCrearProyecto : pickerTipo === 'ahorro' ? handleCrearAhorro : undefined}
          modo="compra"
          origenMoneda={egresoPicker?.moneda}
          origenMonto={egresoPicker?.monto}
          onConfirmConversion={async (ahorroId, montoConvertido, cotizacionUsdRef) => {
            const ahorro = (ahorros ?? []).find(a => a.id === ahorroId)
            if (!ahorro || !egresoPicker) return
            const esCripto = ['BTC', 'ETH'].includes(ahorro.moneda)
            const cotiz = esCripto ? cotizacionUsdRef : (egresoPicker.monto / montoConvertido)
            const notaTxt = esCripto
              ? `Compra de ${montoConvertido} ${ahorro.moneda}${cotiz ? ` — cotización USD ref: $${cotiz.toLocaleString('es-AR')}` : ''}`
              : `Compra de ${montoConvertido} ${ahorro.moneda} — cotización: $${cotiz!.toLocaleString('es-AR')} por ${ahorro.moneda}`
            if (esCripto) {
              await updateAhorro(ahorroId, { cantidad: (ahorro.cantidad ?? 0) + montoConvertido })
            } else {
              // Se registra como un ahorro_ajustes real (no solo un número tocado en el cache) para
              // que quede visible en el Historial y se pueda editar/desasociar como cualquier otro.
              await createAhorroAjuste({ ahorro_id: ahorroId, monto: montoConvertido, fecha: egresoPicker.fecha, nota: notaTxt })
              await sincronizarAjusteManualAhorro(ahorroId)
            }
            await updateEgreso(egresoPicker.id, { cotizacion: cotiz ?? null, nota: notaTxt })
            refetchAhorros(); refetch()
          }}
        />
        )
      })()}
    </div>
  )
}
