'use client'
import { useState, useMemo, useRef } from 'react'
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
const PIE_COLORS = ['#1A5E9E','#2D7D2D','#E8A020','#D4537E','#5B3FA6','#1D9E75','#C0392B','#888780']
const HOY = new Date()

const FORM_INIT = {
  categoria: 'tarjeta',
  monto: '',
  descripcion: '',
  fecha: new Date().toISOString().split('T')[0],
  moneda: 'ARS' as Moneda,
  quien: 'ambos' as Quien,
  recurrente: false,
}

type SortKey = 'fecha' | 'monto' | 'categoria' | 'descripcion' | 'quien'
type SortDir = 'asc' | 'desc'
const COLS_DEFAULT: SortKey[] = ['fecha', 'descripcion', 'categoria', 'quien', 'monto']
const COL_LABEL: Record<SortKey, string> = { fecha: 'Fecha', descripcion: 'Descripción', categoria: 'Categoría', quien: 'Quién', monto: 'Importe' }

// ─── Inline edit row ──────────────────────────────────────────────────────────
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

  const handle = async () => {
    setSaving(true)
    await onSave(egreso.id, form)
    setSaving(false)
  }

  return (
    <tr className="bg-blue-50/60">
      <td className="py-1.5 px-2 border-b border-blue-100">
        <input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} className="input-field py-1 text-xs w-full" />
      </td>
      <td className="py-1.5 px-2 border-b border-blue-100">
        <input value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} className="input-field py-1 text-xs w-full" placeholder="Descripción" />
      </td>
      <td className="py-1.5 px-2 border-b border-blue-100">
        <CategoriaSelector modulo="egresos" value={form.categoria} onChange={v => setForm(p => ({ ...p, categoria: v }))}
          categorias={categoriasCustom} categoriasBase={tiposBase} onCategoriasChange={refetchCats} />
      </td>
      <td className="py-1.5 px-2 border-b border-blue-100">
        <select value={form.quien} onChange={e => setForm(p => ({ ...p, quien: e.target.value as Quien }))} className="input-field py-1 text-xs">
          <option value="ambos">Ambos</option><option value="Mati">Mati</option><option value="Dani">Dani</option>
        </select>
      </td>
      <td className="py-1.5 px-2 border-b border-blue-100 text-right">
        <MontoInput value={form.monto} onChange={raw => setForm(p => ({ ...p, monto: raw }))} className="py-1 text-xs text-right" />
      </td>
      <td className="py-1.5 px-2 border-b border-blue-100 text-right">
        <div className="flex gap-1 justify-end">
          <button onClick={handle} disabled={saving} className="text-xs bg-blue-700 text-white px-2 py-1 rounded-lg border-none cursor-pointer disabled:opacity-50">{saving ? '...' : '✓'}</button>
          <button onClick={onCancel} className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded-lg border-none cursor-pointer">✕</button>
        </div>
      </td>
    </tr>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function EgresosPage() {
  const { añoActivo, monedaPrincipal: m } = useAppStore()
  const { data: egresos, loading, refetch } = useEgresos()
  const { data: rawCategorias, refetch: refetchCats } = useCategoriasCustom('egresos')
  const categoriasCustom = (rawCategorias ?? []) as CategoriaCustom[]

  const [chartType, setChartType]       = useState<'apilado' | 'agrupado'>('apilado')
  const [compMes, setCompMes]           = useState(HOY.getMonth())
  const [rankingMes, setRankingMes]     = useState(HOY.getMonth())
  const [filterCat, setFilterCat]       = useState('todos')
  const [filterQuien, setFilterQuien]   = useState('todos')
  const [search, setSearch]             = useState('')
  const [showModal, setShowModal]       = useState(false)
  const [saving, setSaving]             = useState(false)
  const [form, setForm]                 = useState(FORM_INIT)
  const [editingId, setEditingId]       = useState<string | null>(null)
  const [sortKey, setSortKey]           = useState<SortKey>('fecha')
  const [sortDir, setSortDir]           = useState<SortDir>('desc')
  const [cols, setCols]                 = useState<SortKey[]>(COLS_DEFAULT)
  const dragCol  = useRef<number | null>(null)
  const dragOver = useRef<number | null>(null)

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
    const point: Record<string, number | string> = { month }
    tiposBase.forEach(({ key }) => {
      point[key] = (egresos ?? []).filter(x => x.mes === mes && x.categoria === key).reduce((s, x) => s + x.monto, 0)
    })
    return point
  }), [egresos, tiposBase])

  const compData = useMemo(() => {
    const src = compMes === -1 ? (egresos ?? []) : (egresos ?? []).filter(x => x.mes === compMes + 1)
    return allTipos
      .map(t => ({ name: t.label, color: t.color, value: src.filter(e => e.categoria === t.key).reduce((s, e) => s + e.monto, 0) }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [egresos, compMes, allTipos])

  const rankingData = useMemo(() => {
    const src     = (egresos ?? []).filter(e => e.mes === rankingMes + 1)
    const srcPrev = (egresos ?? []).filter(e => e.mes === rankingMes)
    return allTipos.map(t => ({
      name: t.label, color: t.color,
      value: src.filter(e => e.categoria === t.key).reduce((s, e) => s + e.monto, 0),
      prev:  srcPrev.filter(e => e.categoria === t.key).reduce((s, e) => s + e.monto, 0),
    })).filter(d => d.value > 0).sort((a, b) => b.value - a.value).slice(0, 5)
  }, [egresos, rankingMes, allTipos])

  const filtered = useMemo(() => {
    const rows = (egresos ?? [])
      .filter(e => filterCat === 'todos' || e.categoria === filterCat)
      .filter(e => filterQuien === 'todos' || e.quien === filterQuien)
      .filter(e => !search || e.descripcion.toLowerCase().includes(search.toLowerCase()))
    return [...rows].sort((a, b) => {
      const va = a[sortKey as keyof Egreso] as string | number
      const vb = b[sortKey as keyof Egreso] as string | number
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [egresos, filterCat, filterQuien, search, sortKey, sortDir])

  const total          = (egresos ?? []).reduce((s, e) => s + e.monto, 0)
  const totalTarjetas  = (egresos ?? []).filter(e => e.categoria === 'tarjeta').reduce((s, e) => s + e.monto, 0)
  const totalUSD       = (egresos ?? []).filter(e => e.categoria === 'usd').reduce((s, e) => s + e.monto, 0)

  const handleSave = async () => {
    if (!form.monto || !form.fecha) return
    setSaving(true)
    try {
      await createEgreso({ categoria: form.categoria, descripcion: form.descripcion, monto: parseFloat(form.monto), moneda: form.moneda, fecha: form.fecha, quien: form.quien, recurrente: form.recurrente })
      setShowModal(false); setForm(FORM_INIT); refetch()
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

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
    const next = [...cols]
    const [removed] = next.splice(dragCol.current, 1)
    next.splice(dragOver.current, 0, removed)
    setCols(next); dragCol.current = null; dragOver.current = null
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader title="Egresos" subtitle={`Control detallado de gastos — ${añoActivo}`}
        action={<button className="btn-primary" onClick={() => setShowModal(true)}>+ Nuevo egreso</button>} />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label={`Total ${añoActivo}`}    value={fmt(total, m)}          color="#C0392B" icon="📤" sub="Acumulado" />
        <StatCard label="Tarjetas crédito"         value={fmt(totalTarjetas, m)}  color="#1A5E9E" icon="💳" sub={`${total > 0 ? Math.round(totalTarjetas / total * 100) : 0}% del total`} />
        <StatCard label="Inversiones USD"          value={fmt(totalUSD, m)}       color="#2D7D2D" icon="💵" sub={`${total > 0 ? Math.round(totalUSD / total * 100) : 0}% del total`} />
      </div>

      <div className="grid grid-cols-3 gap-5 mb-5">
        {/* Gráfico evolución */}
        <Card className="col-span-2">
          <CardTitle action={<ChartToggle options={[{ value: 'apilado', label: '▋ Apilado' }, { value: 'agrupado', label: '▋ Agrupado' }]} value={chartType} onChange={v => setChartType(v as 'apilado' | 'agrupado')} />}>
            Evolución de egresos {añoActivo}
          </CardTitle>
          <div className="flex gap-2 flex-wrap mb-3">
            {tiposBase.map(({ key, label, color }) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm" style={{ background: color }} />
                <span className="text-slate-500 text-[10px]">{label}</span>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barCategoryGap="28%" barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v === 0 ? '' : fmt(v, m)} />
              <Tooltip
                contentStyle={TT}
                formatter={(value: number, name: string) => {
                  const info = getTipoInfo(name)
                  return [fmt(value, m), info.label]
                }}
              />
              {tiposBase.map(({ key, color }) => (
                <Bar key={key} dataKey={key} name={key} fill={color} radius={[3, 3, 0, 0]} maxBarSize={32} stackId={chartType === 'apilado' ? 'stack' : undefined} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <div className="flex flex-col gap-4">
          {/* Composición */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-900 font-semibold text-[13px]">Composición</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setCompMes(v => Math.max(-1, v - 1))} className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer text-sm">‹</button>
                <span className="text-xs font-medium text-slate-700 min-w-[40px] text-center">{compMes === -1 ? 'Acum.' : MESES_CORTOS[compMes]}</span>
                <button onClick={() => setCompMes(v => Math.min(11, v + 1))} className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer text-sm">›</button>
              </div>
            </div>
            {compData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie data={compData} cx="50%" cy="50%" innerRadius={38} outerRadius={60} paddingAngle={3} dataKey="value">
                      {compData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={TT} formatter={(v: number, _: string, entry: { payload?: { name?: string } }) => [fmt(v, m), entry?.payload?.name ?? '']} />
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
          </Card>

          {/* Top 5 */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-900 font-semibold text-[13px]">Top 5 categorías</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setRankingMes(v => Math.max(0, v - 1))} className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer text-sm">‹</button>
                <span className="text-xs font-medium text-slate-700 min-w-[28px] text-center">{MESES_CORTOS[rankingMes]}</span>
                <button onClick={() => setRankingMes(v => Math.min(11, v + 1))} className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer text-sm">›</button>
              </div>
            </div>
            {rankingData.length > 0 ? rankingData.map((d, i) => {
              const pct  = rankingData[0].value > 0 ? Math.round(d.value / rankingData[0].value * 100) : 0
              const diff = d.prev > 0 ? Math.round((d.value - d.prev) / d.prev * 100) : null
              return (
                <div key={d.name} className="mb-3">
                  <div className="flex justify-between mb-1">
                    <span className="text-xs font-medium" style={{ color: d.color }}>{i + 1}. {d.name}</span>
                    <div className="flex items-center gap-2">
                      {diff !== null && <span className={`text-[10px] font-bold ${diff > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{diff > 0 ? '▲' : '▼'}{Math.abs(diff)}%</span>}
                      <span className="text-xs font-mono font-bold text-slate-700">{fmt(d.value, m)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: d.color }} />
                  </div>
                </div>
              )
            }) : <div className="text-center text-slate-400 text-sm py-4">Sin datos este mes</div>}
          </Card>
        </div>
      </div>

      {/* Tabla */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="text-slate-900 font-semibold text-[15px]">Transacciones</div>
          <span className="text-slate-400 text-xs">{filtered.length} registros · {fmt(filtered.reduce((s, e) => s + e.monto, 0), m)}</span>
        </div>
        <div className="flex gap-2 flex-wrap mb-4 items-center">
          <div className="relative flex-1 min-w-[160px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">⌕</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar descripción..." className="input-field pl-8 py-1.5 text-xs" />
          </div>
          <div className="flex gap-1 flex-wrap">
            {[{ k: 'todos', l: 'Todas' }, ...allTipos.map(t => ({ k: t.key, l: t.label }))].map(({ k, l }) => (
              <button key={k} onClick={() => setFilterCat(k)} className={`chip text-xs py-1 px-2.5 ${filterCat === k ? 'chip-on' : ''}`}>{l}</button>
            ))}
          </div>
          <div className="flex gap-1">
            {[{ k: 'todos', l: 'Todos' }, { k: 'Mati', l: 'Mati' }, { k: 'Dani', l: 'Dani' }, { k: 'ambos', l: 'Ambos' }].map(({ k, l }) => (
              <button key={k} onClick={() => setFilterQuien(k)} className={`chip text-xs py-1 px-3 ${filterQuien === k ? 'chip-on' : ''}`}>{l}</button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon="💸" title={search || filterCat !== 'todos' ? 'Sin resultados' : 'Sin egresos registrados'} description="Agregá tu primer egreso para empezar." />
        ) : (
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
                  <th className="py-3 px-3 border-b border-slate-200 w-16"> </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((egreso, rowIdx) => {
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
                      case 'fecha':
                        return <td key={col} className={`py-3 px-3 border-b border-slate-200 text-sm ${bg}`}>
                          <span className="text-slate-500 text-xs font-mono">{fmtDate(egreso.fecha)}</span>
                        </td>
                      case 'descripcion':
                        return <td key={col} className={`py-3 px-3 border-b border-slate-200 text-sm ${bg}`}>
                          <div className="flex items-center gap-2">
                            <span>{cfg.icon}</span>
                            <span className="text-slate-700 font-medium">{egreso.descripcion || cfg.label}</span>
                          </div>
                        </td>
                      case 'categoria':
                        return <td key={col} className={`py-3 px-3 border-b border-slate-200 text-sm ${bg}`}>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: cfg.color + '18', color: cfg.color }}>{cfg.label}</span>
                        </td>
                      case 'quien':
                        return <td key={col} className={`py-3 px-3 border-b border-slate-200 text-sm ${bg}`}>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${egreso.quien === 'Mati' ? 'bg-blue-50 text-blue-700' : egreso.quien === 'Dani' ? 'bg-pink-50 text-pink-700' : 'bg-slate-100 text-slate-500'}`}>{egreso.quien}</span>
                        </td>
                      case 'monto':
                        return <td key={col} className={`py-3 px-3 border-b border-slate-200 text-sm text-right ${bg}`}>
                          <span className="text-red-600 font-mono font-bold">-{fmtFull(egreso.monto, egreso.moneda as Moneda)}</span>
                        </td>
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
        )}
      </Card>

      <Modal open={showModal} onClose={() => { setShowModal(false); setForm(FORM_INIT) }} title="Nuevo egreso">
        <div className="flex flex-col gap-4">
          <div>
            <FieldLabel>Categoría</FieldLabel>
            <CategoriaSelector modulo="egresos" value={form.categoria} onChange={v => setForm(p => ({ ...p, categoria: v }))}
              categorias={categoriasCustom} categoriasBase={tiposBase} onCategoriasChange={refetchCats} />
          </div>
          <div>
            <FieldLabel>Descripción</FieldLabel>
            <input value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Ej: Pago tarjeta Galicia" className="input-field" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Monto</FieldLabel><MontoInput value={form.monto} onChange={raw => setForm(p => ({ ...p, monto: raw }))} /></div>
            <div><FieldLabel>Moneda</FieldLabel>
              <select value={form.moneda} onChange={e => setForm(p => ({ ...p, moneda: e.target.value as Moneda }))} className="input-field">
                {['ARS', 'USD', 'EUR'].map(c => <option key={c} value={c}>{c}</option>)}
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
