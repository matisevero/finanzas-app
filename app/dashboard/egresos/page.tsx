'use client'
import { useState, useMemo, useRef, useCallback } from 'react'
import type { TooltipProps } from 'recharts'
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAppStore } from '@/store/appStore'
import { useEgresos, useCategoriasCustom } from '@/hooks'
import { createEgreso, updateEgreso, deleteEgreso } from '@/lib/queries'
import { fmt, fmtFull, fmtDate } from '@/lib/utils/formatters'
import { MESES_CORTOS, TIPOS_EGRESO } from '@/lib/utils/constants'
import { StatCard, PageHeader, Card, CardTitle, ChartToggle, Modal, LoadingSpinner, EmptyState, FieldLabel } from '@/components/ui'
import MontoInput from '@/components/ui/MontoInput'
import CategoriaSelector from '@/components/ui/CategoriaSelector'
import type { Moneda, Quien, Egreso, CategoriaCustom } from '@/types'

const TT = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, color: '#0f172a' }
const PIE_COLORS = ['#1A5E9E','#C0392B','#2D7D2D','#E8A020','#D4537E','#5B3FA6','#1D9E75','#888780']
const HOY = new Date()
const PAGE_SIZE = 30

const FORM_INIT = {
  categoria: 'tarjeta', monto: '', descripcion: '',
  fecha: new Date().toISOString().split('T')[0],
  moneda: 'ARS' as Moneda, quien: 'ambos' as Quien, recurrente: false,
}

type SortKey = 'fecha' | 'monto' | 'categoria' | 'descripcion' | 'quien'
type SortDir = 'asc' | 'desc'
const COLS_DEFAULT: SortKey[] = ['fecha', 'descripcion', 'categoria', 'quien', 'monto']
const COL_LABEL: Record<SortKey, string> = { fecha: 'Fecha', descripcion: 'Descripción', categoria: 'Categoría', quien: 'Quién', monto: 'Importe' }

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

// ─── SheetNewRow ──────────────────────────────────────────────────────────────
function SheetNewRow({ cols, tiposBase, categoriasCustom, onSave, refetchCats }: {
  cols: SortKey[]
  tiposBase: { key: string; label: string; icon: string; color: string }[]
  categoriasCustom: CategoriaCustom[]
  onSave: (data: typeof FORM_INIT) => Promise<void>
  refetchCats: () => void
}) {
  const [form, setForm] = useState(FORM_INIT)
  const [saving, setSaving] = useState(false)
  const [active, setActive] = useState(false)

  const handleSave = async () => {
    if (!form.monto || !form.fecha) return
    setSaving(true)
    await onSave(form)
    setForm(FORM_INIT)
    setSaving(false)
    setActive(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSave() }
    if (e.key === 'Escape') { setForm(FORM_INIT); setActive(false) }
  }

  const cellFor = (col: SortKey) => {
    const base = 'py-1.5 px-2 border-b border-red-100'
    switch (col) {
      case 'fecha':
        return (
          <td key={col} className={base}>
            <input type="date" value={form.fecha}
              onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))}
              onFocus={() => setActive(true)} onKeyDown={handleKeyDown}
              className="input-field py-1 text-xs w-full focus:ring-2 focus:ring-red-300" />
          </td>
        )
      case 'descripcion':
        return (
          <td key={col} className={base}>
            <input value={form.descripcion}
              onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
              onFocus={() => setActive(true)} onKeyDown={handleKeyDown}
              placeholder="Descripción..."
              className="input-field py-1 text-xs w-full focus:ring-2 focus:ring-red-300" />
          </td>
        )
      case 'categoria':
        return (
          <td key={col} className={base}>
            <CategoriaSelector modulo="egresos" value={form.categoria}
              onChange={v => setForm(p => ({ ...p, categoria: v }))}
              categorias={categoriasCustom} categoriasBase={tiposBase}
              onCategoriasChange={refetchCats} />
          </td>
        )
      case 'quien':
        return (
          <td key={col} className={base}>
            <select value={form.quien}
              onChange={e => setForm(p => ({ ...p, quien: e.target.value as Quien }))}
              onFocus={() => setActive(true)} onKeyDown={handleKeyDown}
              className="input-field py-1 text-xs">
              <option value="ambos">Ambos</option>
              <option value="Mati">Mati</option>
              <option value="Dani">Dani</option>
            </select>
          </td>
        )
      case 'monto':
        return (
          <td key={col} className={`${base} text-right`}>
            <MontoInput value={form.monto}
              onChange={raw => setForm(p => ({ ...p, monto: raw }))}
              onFocus={() => setActive(true)} onKeyDown={handleKeyDown}
              className="py-1 text-xs text-right focus:ring-2 focus:ring-red-300" />
          </td>
        )
      default: return null
    }
  }

  return (
    <tr className={`transition-colors ${active ? 'bg-red-50' : 'bg-red-50/30 hover:bg-red-50'}`}>
      {cols.map(col => cellFor(col))}
      <td className="py-1.5 px-2 border-b border-red-100 text-right">
        {active ? (
          <div className="flex gap-1 justify-end">
            <button onClick={handleSave} disabled={saving || !form.monto || !form.fecha}
              className="text-xs bg-red-600 text-white px-2.5 py-1 rounded-lg border-none cursor-pointer disabled:opacity-40 font-medium">
              {saving ? '...' : '+ Guardar'}
            </button>
            <button onClick={() => { setForm(FORM_INIT); setActive(false) }}
              className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-lg border-none cursor-pointer">
              ✕
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-red-400 font-medium select-none">↵ nueva fila</span>
        )}
      </td>
    </tr>
  )
}

// ─── InlineEditRow ────────────────────────────────────────────────────────────
function InlineEditRow({ egreso, tiposBase, categoriasCustom, onSave, onCancel, refetchCats }: {
  egreso: Egreso
  tiposBase: { key: string; label: string; icon: string; color: string }[]
  categoriasCustom: CategoriaCustom[]
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
      <td className="py-1.5 px-2 border-b border-blue-100"><input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} onKeyDown={handleKeyDown} className="input-field py-1 text-xs w-full" /></td>
      <td className="py-1.5 px-2 border-b border-blue-100"><input value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} onKeyDown={handleKeyDown} className="input-field py-1 text-xs w-full" placeholder="Descripción" /></td>
      <td className="py-1.5 px-2 border-b border-blue-100">
        <CategoriaSelector modulo="egresos" value={form.categoria} onChange={v => setForm(p => ({ ...p, categoria: v }))}
          categorias={categoriasCustom} categoriasBase={tiposBase} onCategoriasChange={refetchCats} />
      </td>
      <td className="py-1.5 px-2 border-b border-blue-100">
        <select value={form.quien} onChange={e => setForm(p => ({ ...p, quien: e.target.value as Quien }))} onKeyDown={handleKeyDown} className="input-field py-1 text-xs">
          <option value="ambos">Ambos</option><option value="Mati">Mati</option><option value="Dani">Dani</option>
        </select>
      </td>
      <td className="py-1.5 px-2 border-b border-blue-100 text-right"><MontoInput value={form.monto} onChange={raw => setForm(p => ({ ...p, monto: raw }))} onKeyDown={handleKeyDown} className="py-1 text-xs text-right" /></td>
      <td className="py-1.5 px-2 border-b border-blue-100 text-right">
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
  const { añoActivo, monedaPrincipal: m } = useAppStore()
  const { data: egresos, loading, refetch } = useEgresos()
  const { data: rawCategorias, refetch: refetchCats } = useCategoriasCustom('egresos')
  const categoriasCustom = (rawCategorias ?? []) as CategoriaCustom[]

  const [chartType, setChartType]     = useState<'apilado'|'agrupado'>('apilado')
  const [sidePanel, setSidePanel]     = useState<'composicion'|'top'>('composicion')
  const [compMes, setCompMes]         = useState(HOY.getMonth())
  const [hiddenKeys, setHiddenKeys]   = useState<string[]>([])
  const [filterCats, setFilterCats]   = useState<string[]>([])
  const [filterQuien, setFilterQuien] = useState<string[]>([])
  const [search, setSearch]           = useState('')
  const [showModal, setShowModal]     = useState(false)
  const [saving, setSaving]           = useState(false)
  const [form, setForm]               = useState(FORM_INIT)
  const [editingId, setEditingId]     = useState<string|null>(null)
  const [sortKey, setSortKey]         = useState<SortKey>('fecha')
  const [sortDir, setSortDir]         = useState<SortDir>('desc')
  const [cols, setCols]               = useState<SortKey[]>(COLS_DEFAULT)
  const [page, setPage]               = useState(1)
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
    allTipos.find(t => t.key === cat) ?? { key: cat, label: cat, icon: '📦', color: '#888780' }

  const chartData = useMemo(() => MESES_CORTOS.map((month, i) => {
    const mes = i + 1
    const point: Record<string, number|string> = { month }
    tiposBase.forEach(({ key }) => {
      point[key] = (egresos ?? []).filter(x => x.mes === mes && x.categoria === key).reduce((s, x) => s + x.monto, 0)
    })
    return point
  }), [egresos, tiposBase])

  const compData = useMemo(() => {
    const src = compMes === -1 ? (egresos ?? []) : (egresos ?? []).filter(x => x.mes === compMes + 1)
    return allTipos
      .map(t => ({ name: t.label, color: t.color, value: src.filter(e => e.categoria === t.key).reduce((s, e) => s + e.monto, 0) }))
      .filter(d => d.value > 0).sort((a, b) => b.value - a.value)
  }, [egresos, compMes, allTipos])

  const topAño = useMemo(() =>
    allTipos
      .map(t => ({ label: t.label, color: t.color, value: (egresos ?? []).filter(e => e.categoria === t.key).reduce((s, e) => s + e.monto, 0) }))
      .filter(d => d.value > 0).sort((a, b) => b.value - a.value).slice(0, 8)
  , [egresos, allTipos])

  const filtered = useMemo(() => {
    const rows = (egresos ?? [])
      .filter(e => filterCats.length === 0 || filterCats.includes(e.categoria))
      .filter(e => filterQuien.length === 0 || filterQuien.includes(e.quien))
      .filter(e => !search || e.descripcion.toLowerCase().includes(search.toLowerCase()))
    return [...rows].sort((a, b) => {
      const va = a[sortKey as keyof Egreso] as string|number
      const vb = b[sortKey as keyof Egreso] as string|number
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [egresos, filterCats, filterQuien, search, sortKey, sortDir])

  const visibleRows = filtered.slice(0, page * PAGE_SIZE)
  const hasMore     = filtered.length > visibleRows.length

  const total         = (egresos ?? []).reduce((s, e) => s + e.monto, 0)
  const totalTarjetas = (egresos ?? []).filter(e => e.categoria === 'tarjeta').reduce((s, e) => s + e.monto, 0)
  const totalUSD      = (egresos ?? []).filter(e => e.categoria === 'usd').reduce((s, e) => s + e.monto, 0)
  const mesesConDatos = new Set((egresos ?? []).map(e => e.mes)).size
  const promedio      = mesesConDatos > 0 ? Math.round(total / mesesConDatos) : 0

  const handleSave = async () => {
    if (!form.monto || !form.fecha) return
    setSaving(true)
    try {
      await createEgreso({ categoria: form.categoria, descripcion: form.descripcion, monto: parseFloat(form.monto), moneda: form.moneda, fecha: form.fecha, quien: form.quien, recurrente: form.recurrente })
      setShowModal(false); setForm(FORM_INIT); refetch()
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  const handleSheetSave = useCallback(async (data: typeof FORM_INIT) => {
    await createEgreso({ categoria: data.categoria, descripcion: data.descripcion, monto: parseFloat(data.monto), moneda: data.moneda, fecha: data.fecha, quien: data.quien, recurrente: data.recurrente })
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

  const quienOptions = [{ key: 'Mati', label: 'Mati' }, { key: 'Dani', label: 'Dani' }, { key: 'ambos', label: 'Ambos' }]

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader title="Egresos" subtitle={`Control detallado de gastos — ${añoActivo}`}
        action={<button className="btn-primary" onClick={() => setShowModal(true)}>+ Nuevo egreso</button>} />

      {/* ── StatCards full width ── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label={`Total ${añoActivo}`}  value={fmt(total, m)}         color="#C0392B" icon="📤" sub="Acumulado" />
        <StatCard label="Tarjetas crédito"        value={fmt(totalTarjetas, m)} color="#1A5E9E" icon="💳" sub={`${total > 0 ? Math.round(totalTarjetas / total * 100) : 0}% del total`} />
        <StatCard label="Inversiones USD"         value={fmt(totalUSD, m)}      color="#2D7D2D" icon="💵" sub={`${total > 0 ? Math.round(totalUSD / total * 100) : 0}% del total`} />
        <StatCard label="Promedio mensual"        value={fmt(promedio, m)}      color="#E8A020" icon="📅" sub="Sobre meses con datos" />
      </div>

      {/* ── Layout principal: Transacciones 2/3 | Widgets 1/3 ── */}
      <div className="grid grid-cols-3 gap-5 items-start">

        {/* ── Columna izquierda: Transacciones ── */}
        <div className="col-span-2">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="text-slate-900 font-semibold text-[15px]">Transacciones</div>
              <span className="text-slate-400 text-xs">{filtered.length} registros · {fmt(filtered.reduce((s, e) => s + e.monto, 0), m)}</span>
            </div>
            <div className="flex gap-2 flex-wrap mb-4 items-center">
              <div className="relative flex-1 min-w-[180px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">⌕</span>
                <input value={search} onChange={e => setSearchR(e.target.value)} placeholder="Buscar descripción..." className="input-field pl-8 py-1.5 text-xs" />
              </div>
              <MultiDropdown label="Categoría" options={allTipos.map(t => ({ key: t.key, label: t.label }))} selected={filterCats} onChange={setFilterCatsR} />
              <MultiDropdown label="Quién" options={quienOptions} selected={filterQuien} onChange={setFilterQuienR} />
              {(filterCats.length > 0 || filterQuien.length > 0 || search) && (
                <button onClick={() => { setFilterCatsR([]); setFilterQuienR([]); setSearchR('') }}
                  className="text-xs text-slate-400 hover:text-slate-600 border-none bg-transparent cursor-pointer underline">
                  Limpiar
                </button>
              )}
            </div>

            {filtered.length === 0 ? (
              <EmptyState icon="💸" title="Sin resultados" description="Probá cambiando los filtros o la búsqueda." />
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
                            className={`text-slate-400 text-[11px] font-bold uppercase tracking-widest py-3 px-3 border-b border-slate-200 cursor-pointer select-none hover:text-slate-600 ${col === 'monto' ? 'text-right' : 'text-left'}`}>
                            <span className="inline-flex items-center gap-1">
                              <span className="cursor-grab opacity-30 hover:opacity-60">⠿</span>
                              {COL_LABEL[col]}
                              {sortKey === col && <span className="text-blue-500">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                            </span>
                          </th>
                        ))}
                        <th className="py-3 px-3 border-b border-slate-200 w-16" />
                      </tr>
                    </thead>
                    <tbody>
                      <SheetNewRow cols={cols} tiposBase={tiposBase} categoriasCustom={categoriasCustom} onSave={handleSheetSave} refetchCats={refetchCats} />
                      {visibleRows.map((egreso, rowIdx) => {
                        const cfg       = getTipoInfo(egreso.categoria)
                        const isEditing = editingId === egreso.id
                        const bg        = rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-100'

                        if (isEditing) return (
                          <InlineEditRow key={egreso.id} egreso={egreso} tiposBase={tiposBase}
                            categoriasCustom={categoriasCustom} onSave={handleUpdate}
                            onCancel={() => setEditingId(null)} refetchCats={refetchCats} />
                        )

                        const cellFor = (col: SortKey) => {
                          switch (col) {
                            case 'fecha':       return <td key={col} className={`py-3 px-3 border-b border-slate-200 text-sm ${bg}`}><span className="text-slate-500 text-xs font-mono">{fmtDate(egreso.fecha)}</span></td>
                            case 'descripcion': return <td key={col} className={`py-3 px-3 border-b border-slate-200 text-sm ${bg}`}><div className="flex items-center gap-2"><span>{cfg.icon}</span><span className="text-slate-700 font-medium">{egreso.descripcion || cfg.label}</span></div></td>
                            case 'categoria':   return <td key={col} className={`py-3 px-3 border-b border-slate-200 text-sm ${bg}`}><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: cfg.color + '18', color: cfg.color }}>{cfg.label}</span></td>
                            case 'quien':       return <td key={col} className={`py-3 px-3 border-b border-slate-200 text-sm ${bg}`}><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${egreso.quien === 'Mati' ? 'bg-blue-50 text-blue-700' : egreso.quien === 'Dani' ? 'bg-pink-50 text-pink-700' : 'bg-slate-100 text-slate-500'}`}>{egreso.quien}</span></td>
                            case 'monto':       return <td key={col} className={`py-3 px-3 border-b border-slate-200 text-sm text-right ${bg}`}><span className="text-red-600 font-mono font-bold">-{fmtFull(egreso.monto, egreso.moneda as Moneda)}</span></td>
                            default: return null
                          }
                        }

                        return (
                          <tr key={egreso.id} className={`group ${bg} hover:bg-blue-50 transition-colors`}>
                            {cols.map(col => cellFor(col))}
                            <td className={`py-3 px-3 border-b border-slate-200 text-right ${bg}`}>
                              <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setEditingId(egreso.id)} className="text-slate-400 hover:text-blue-600 border-none bg-transparent cursor-pointer px-1 text-sm">✎</button>
                                <button onClick={() => handleDelete(egreso.id)} className="text-slate-300 hover:text-red-500 border-none bg-transparent cursor-pointer px-1 text-sm">✕</button>
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
          <Card>
            <CardTitle action={<ChartToggle options={[{ value: 'apilado', label: '▋ Apilado' }, { value: 'agrupado', label: '▋ Agrupado' }]} value={chartType} onChange={v => setChartType(v as 'apilado'|'agrupado')} />}>
              Evolución {añoActivo}
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
          <Card>
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-4">
              {(['composicion', 'top'] as const).map(v => (
                <button key={v} onClick={() => setSidePanel(v)}
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
                    <div className="flex flex-col gap-1 mt-1">
                      {compData.slice(0, 5).map((d, i) => (
                        <div key={d.name} className="flex justify-between items-center">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="text-slate-500 text-[10px]">{d.name}</span>
                          </div>
                          <span className="text-slate-900 text-[10px] font-mono font-bold">{fmt(d.value, m)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <div className="text-center text-slate-400 text-sm py-4">Sin datos</div>}
              </>
            )}

            {sidePanel === 'top' && (
              <>
                <div className="text-xs text-slate-400 mb-3 font-medium">Año {añoActivo} — por categoría</div>
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

      <Modal open={showModal} onClose={() => { setShowModal(false); setForm(FORM_INIT) }} title="Nuevo egreso">
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Categoría</FieldLabel>
            <CategoriaSelector modulo="egresos" value={form.categoria} onChange={v => setForm(p => ({ ...p, categoria: v }))}
              categorias={categoriasCustom} categoriasBase={tiposBase} onCategoriasChange={refetchCats} />
          </div>
          <div><FieldLabel>Descripción</FieldLabel>
            <input value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Ej: Pago tarjeta Galicia" className="input-field" />
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
            <div><FieldLabel>Fecha</FieldLabel><input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} className="input-field" /></div>
            <div><FieldLabel>Quién</FieldLabel>
              <select value={form.quien} onChange={e => setForm(p => ({ ...p, quien: e.target.value as Quien }))} className="input-field">
                <option value="ambos">Ambos</option><option value="Mati">Mati</option><option value="Dani">Dani</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.recurrente} onChange={e => setForm(p => ({ ...p, recurrente: e.target.checked }))} className="w-4 h-4 accent-blue-700" />
            <span className="text-slate-600 text-sm">Egreso recurrente</span>
          </label>
          <div className="flex gap-3 pt-2">
            <button onClick={() => { setShowModal(false); setForm(FORM_INIT) }} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={handleSave} disabled={saving || !form.monto || !form.fecha} className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
