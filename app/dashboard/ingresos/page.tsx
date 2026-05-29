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
import CategoriaSelector from '@/components/ui/CategoriaSelector'
import type { Moneda, Quien, Ingreso, CategoriaCustom } from '@/types'

const TT = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, color: '#0f172a' }
const PIE_COLORS = ['#2D7D2D','#52A852','#BA7517','#1A5E9E','#5B3FA6','#E8A020','#1D9E75','#888780']
const HOY = new Date()
const PAGE_SIZE = 30

const FORM_INIT = {
  tipo: 'salario', monto: '', descripcion: '',
  fecha: new Date().toISOString().split('T')[0],
  moneda: 'ARS' as Moneda, quien: 'ambos' as Quien, recurrente: false,
}

type SortKey = 'fecha' | 'monto' | 'tipo' | 'descripcion' | 'quien'
type SortDir = 'asc' | 'desc'
const COLS_DEFAULT: SortKey[] = ['fecha', 'descripcion', 'tipo', 'quien', 'monto']
const COL_LABEL: Record<SortKey, string> = { fecha: 'Fecha', descripcion: 'Descripción', tipo: 'Tipo', quien: 'Quién', monto: 'Importe' }

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

// ─── SheetNewRow — fila fija para ingreso rápido estilo Google Sheets ─────────
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
    const base = 'py-1.5 px-2 border-b border-emerald-200'
    switch (col) {
      case 'fecha':
        return (
          <td key={col} className={base}>
            <input type="date" value={form.fecha}
              onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))}
              onFocus={() => setActive(true)}
              onKeyDown={handleKeyDown}
              className="input-field py-1 text-xs w-full focus:ring-2 focus:ring-emerald-400" />
          </td>
        )
      case 'descripcion':
        return (
          <td key={col} className={base}>
            <input value={form.descripcion}
              onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
              onFocus={() => setActive(true)}
              onKeyDown={handleKeyDown}
              placeholder="Descripción..."
              className="input-field py-1 text-xs w-full focus:ring-2 focus:ring-emerald-400" />
          </td>
        )
      case 'tipo':
        return (
          <td key={col} className={base}>
            <CategoriaSelector modulo="ingresos" value={form.tipo}
              onChange={v => setForm(p => ({ ...p, tipo: v }))}
              categorias={categoriasCustom} categoriasBase={tiposBase}
              onCategoriasChange={refetchCats} />
          </td>
        )
      case 'quien':
        return (
          <td key={col} className={base}>
            <select value={form.quien}
              onChange={e => setForm(p => ({ ...p, quien: e.target.value as Quien }))}
              onFocus={() => setActive(true)}
              onKeyDown={handleKeyDown}
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
              onFocus={() => setActive(true)}
              onKeyDown={handleKeyDown}
              className="py-1 text-xs text-right focus:ring-2 focus:ring-emerald-400" />
          </td>
        )
      default: return null
    }
  }

  return (
    <tr className={`transition-colors ${active ? 'bg-emerald-50' : 'bg-emerald-50/40 hover:bg-emerald-50'}`}>
      {cols.map(col => cellFor(col))}
      <td className="py-1.5 px-2 border-b border-emerald-200 text-right">
        {active ? (
          <div className="flex gap-1 justify-end">
            <button onClick={handleSave} disabled={saving || !form.monto || !form.fecha}
              className="text-xs bg-emerald-600 text-white px-2.5 py-1 rounded-lg border-none cursor-pointer disabled:opacity-40 font-medium">
              {saving ? '...' : '+ Guardar'}
            </button>
            <button onClick={() => { setForm(FORM_INIT); setActive(false) }}
              className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-lg border-none cursor-pointer">
              ✕
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-emerald-500 font-medium select-none">↵ nueva fila</span>
        )}
      </td>
    </tr>
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
      <td className="py-1.5 px-2 border-b border-blue-100"><input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} onKeyDown={handleKeyDown} className="input-field py-1 text-xs w-full" /></td>
      <td className="py-1.5 px-2 border-b border-blue-100"><input value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} onKeyDown={handleKeyDown} className="input-field py-1 text-xs w-full" placeholder="Descripción" /></td>
      <td className="py-1.5 px-2 border-b border-blue-100">
        <CategoriaSelector modulo="ingresos" value={form.tipo} onChange={v => setForm(p => ({ ...p, tipo: v }))}
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
export default function IngresosPage() {
  const { añoActivo, monedaPrincipal: m } = useAppStore()
  const { data: ingresos, loading, refetch } = useIngresos()
  const { data: rawCategorias, refetch: refetchCats } = useCategoriasCustom('ingresos')
  const categoriasCustom = (rawCategorias ?? []) as CategoriaCustom[]

  const [chartType, setChartType]     = useState<'apilado'|'agrupado'>('apilado')
  const [sidePanel, setSidePanel]     = useState<'composicion'|'top'>('composicion')
  const [compMes, setCompMes]         = useState(HOY.getMonth())
  const [hiddenKeys, setHiddenKeys]   = useState<string[]>([])
  const [filterTipos, setFilterTipos] = useState<string[]>([])
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
    allTipos.find(t => t.key === tipo) ?? { key: tipo, label: tipo, icon: '📦', color: '#888780' }

  const chartData = useMemo(() => MESES_CORTOS.map((month, i) => {
    const mes = i + 1
    const point: Record<string, number|string> = { month }
    tiposBase.forEach(({ key }) => {
      point[key] = (ingresos ?? []).filter(x => x.mes === mes && x.tipo === key).reduce((s, x) => s + x.monto, 0)
    })
    return point
  }), [ingresos, tiposBase])

  const compData = useMemo(() => {
    const src = compMes === -1 ? (ingresos ?? []) : (ingresos ?? []).filter(x => x.mes === compMes + 1)
    return allTipos
      .map(t => ({ name: t.label, color: t.color, value: src.filter(i => i.tipo === t.key).reduce((s, i) => s + i.monto, 0) }))
      .filter(d => d.value > 0)
  }, [ingresos, compMes, allTipos])

  const topAño = useMemo(() =>
    allTipos
      .map(t => ({ label: t.label, color: t.color, value: (ingresos ?? []).filter(i => i.tipo === t.key).reduce((s, i) => s + i.monto, 0) }))
      .filter(d => d.value > 0).sort((a, b) => b.value - a.value).slice(0, 8)
  , [ingresos, allTipos])

  const filtered = useMemo(() => {
    const rows = (ingresos ?? [])
      .filter(i => filterTipos.length === 0 || filterTipos.includes(i.tipo))
      .filter(i => filterQuien.length === 0 || filterQuien.includes(i.quien))
      .filter(i => !search || i.descripcion.toLowerCase().includes(search.toLowerCase()))
    return [...rows].sort((a, b) => {
      const va = a[sortKey as keyof Ingreso] as string|number
      const vb = b[sortKey as keyof Ingreso] as string|number
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [ingresos, filterTipos, filterQuien, search, sortKey, sortDir])

  const visibleRows = filtered.slice(0, page * PAGE_SIZE)
  const hasMore     = filtered.length > visibleRows.length

  const total         = (ingresos ?? []).reduce((s, i) => s + i.monto, 0)
  const salarios      = (ingresos ?? []).filter(i => i.tipo === 'salario').reduce((s, i) => s + i.monto, 0)
  const mesesConDatos = new Set((ingresos ?? []).map(i => i.mes)).size
  const promedio      = mesesConDatos > 0 ? Math.round(total / mesesConDatos) : 0

  const handleSave = async () => {
    if (!form.monto || !form.fecha) return
    setSaving(true)
    try {
      await createIngreso({ tipo: form.tipo, descripcion: form.descripcion, monto: parseFloat(form.monto), moneda: form.moneda, fecha: form.fecha, quien: form.quien, recurrente: form.recurrente })
      setShowModal(false); setForm(FORM_INIT); refetch()
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  // Fila Sheet — guardar nuevo ingreso rápido
  const handleSheetSave = useCallback(async (data: typeof FORM_INIT) => {
    await createIngreso({ tipo: data.tipo, descripcion: data.descripcion, monto: parseFloat(data.monto), moneda: data.moneda, fecha: data.fecha, quien: data.quien, recurrente: data.recurrente })
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
      <PageHeader title="Ingresos" subtitle={`Todos tus flujos de entrada — ${añoActivo}`}
        action={<button className="btn-primary" onClick={() => setShowModal(true)}>+ Nuevo ingreso</button>} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label={`Total ${añoActivo}`} value={fmt(total, m)}            color="#2D7D2D" icon="💰" sub="Acumulado" />
        <StatCard label="Salarios"              value={fmt(salarios, m)}         color="#2D7D2D" icon="👔" sub={`${total > 0 ? Math.round(salarios / total * 100) : 0}% del total`} />
        <StatCard label="Ingresos extra"        value={fmt(total - salarios, m)} color="#52A852" icon="📈" sub="Freelance + alquiler + otros" />
        <StatCard label="Promedio mensual"      value={fmt(promedio, m)}         color="#1A5E9E" icon="📅" sub="Sobre meses con datos" />
      </div>

      <div className="grid grid-cols-3 gap-5 mb-5">
        <Card className="col-span-2">
          <CardTitle action={<ChartToggle options={[{ value: 'apilado', label: '▋ Apilado' }, { value: 'agrupado', label: '▋ Agrupado' }]} value={chartType} onChange={v => setChartType(v as 'apilado'|'agrupado')} />}>
            Evolución de ingresos {añoActivo}
          </CardTitle>
          <div className="flex gap-3 flex-wrap mb-3">
            {tiposBase.map(({ key, label, color }) => (
              <button key={key} type="button" onClick={() => setHiddenKeys(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key])}
                className="flex items-center gap-1.5 border-none bg-transparent cursor-pointer p-0 transition-opacity"
                style={{ opacity: hiddenKeys.includes(key) ? 0.3 : 1 }}>
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                <span className="text-slate-500 text-xs">{label}</span>
              </button>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barCategoryGap="28%" barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v === 0 ? '' : fmt(v, m)} />
              <Tooltip content={renderTooltip} />
              {tiposBase.filter(({ key }) => !hiddenKeys.includes(key)).map(({ key, color }) => (
                <Bar key={key} dataKey={key} name={key} fill={color} radius={[3, 3, 0, 0]} maxBarSize={32} stackId={chartType === 'apilado' ? 'stack' : undefined} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Card>

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
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie data={compData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
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
                  {/* ── Fila Sheet: ingreso rápido estilo Google Sheets ── */}
                  <SheetNewRow
                    cols={cols}
                    tiposBase={tiposBase}
                    categoriasCustom={categoriasCustom}
                    onSave={handleSheetSave}
                    refetchCats={refetchCats}
                  />

                  {visibleRows.map((ingreso, rowIdx) => {
                    const cfg       = getTipoInfo(ingreso.tipo)
                    const isEditing = editingId === ingreso.id
                    const bg        = rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-100'

                    if (isEditing) return (
                      <InlineEditRow key={ingreso.id} ingreso={ingreso} tiposBase={tiposBase}
                        categoriasCustom={categoriasCustom} onSave={handleUpdate}
                        onCancel={() => setEditingId(null)} refetchCats={refetchCats} />
                    )

                    const cellFor = (col: SortKey) => {
                      switch (col) {
                        case 'fecha':       return <td key={col} className={`py-3 px-3 border-b border-slate-200 text-sm ${bg}`}><span className="text-slate-500 text-xs font-mono">{fmtDate(ingreso.fecha)}</span></td>
                        case 'descripcion': return <td key={col} className={`py-3 px-3 border-b border-slate-200 text-sm ${bg}`}><div className="flex items-center gap-2"><span>{cfg.icon}</span><span className="text-slate-700 font-medium">{ingreso.descripcion || cfg.label}</span></div></td>
                        case 'tipo':        return <td key={col} className={`py-3 px-3 border-b border-slate-200 text-sm ${bg}`}><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: cfg.color + '18', color: cfg.color }}>{cfg.label}</span></td>
                        case 'quien':       return <td key={col} className={`py-3 px-3 border-b border-slate-200 text-sm ${bg}`}><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ingreso.quien === 'Mati' ? 'bg-blue-50 text-blue-700' : ingreso.quien === 'Dani' ? 'bg-pink-50 text-pink-700' : 'bg-slate-100 text-slate-500'}`}>{ingreso.quien}</span></td>
                        case 'monto':       return <td key={col} className={`py-3 px-3 border-b border-slate-200 text-sm text-right ${bg}`}><span className="text-emerald-700 font-mono font-bold">+{fmtFull(ingreso.monto, ingreso.moneda as Moneda)}</span></td>
                        default: return null
                      }
                    }

                    return (
                      <tr key={ingreso.id} className={`group ${bg} hover:bg-blue-50 transition-colors`}>
                        {cols.map(col => cellFor(col))}
                        <td className={`py-3 px-3 border-b border-slate-200 text-right ${bg}`}>
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

      <Modal open={showModal} onClose={() => { setShowModal(false); setForm(FORM_INIT) }} title="Nuevo ingreso">
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
            <div><FieldLabel>Fecha</FieldLabel><input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} className="input-field" /></div>
            <div><FieldLabel>Quién</FieldLabel>
              <select value={form.quien} onChange={e => setForm(p => ({ ...p, quien: e.target.value as Quien }))} className="input-field">
                <option value="ambos">Ambos</option><option value="Mati">Mati</option><option value="Dani">Dani</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.recurrente} onChange={e => setForm(p => ({ ...p, recurrente: e.target.checked }))} className="w-4 h-4 accent-blue-700" />
            <span className="text-slate-600 text-sm">Ingreso recurrente</span>
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
