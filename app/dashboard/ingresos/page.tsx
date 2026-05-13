'use client'
import { useState, useMemo, useRef } from 'react'
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
const PIE_COLORS = ['#2D7D2D', '#52A852', '#BA7517', '#1A5E9E', '#5B3FA6', '#E8A020', '#1D9E75', '#888780']
const HOY = new Date()

const FORM_INIT = {
  tipo: 'salario',
  monto: '',
  descripcion: '',
  fecha: new Date().toISOString().split('T')[0],
  moneda: 'ARS' as Moneda,
  quien: 'ambos' as Quien,
  recurrente: false,
}

type SortKey = 'fecha' | 'monto' | 'tipo' | 'descripcion' | 'quien'
type SortDir = 'asc' | 'desc'
const COLS_DEFAULT: SortKey[] = ['fecha', 'descripcion', 'tipo', 'quien', 'monto']
const COL_LABEL: Record<SortKey, string> = { fecha: 'Fecha', descripcion: 'Descripción', tipo: 'Tipo', quien: 'Quién', monto: 'Importe' }

// ─── Inline edit row ──────────────────────────────────────────────────────────
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

  const handle = async () => {
    setSaving(true)
    await onSave(ingreso.id, form)
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
        <CategoriaSelector modulo="ingresos" value={form.tipo} onChange={v => setForm(p => ({ ...p, tipo: v }))}
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
export default function IngresosPage() {
  const { añoActivo, monedaPrincipal: m } = useAppStore()
  const { data: ingresos, loading, refetch } = useIngresos()
  const { data: rawCategorias, refetch: refetchCats } = useCategoriasCustom('ingresos')
  const categoriasCustom = (rawCategorias ?? []) as CategoriaCustom[]

  const [chartType, setChartType]     = useState<'apilado' | 'agrupado'>('apilado')
  const [compMes, setCompMes]         = useState(HOY.getMonth())
  const [filterTipo, setFilterTipo]   = useState('todos')
  const [filterQuien, setFilterQuien] = useState('todos')
  const [search, setSearch]           = useState('')
  const [showModal, setShowModal]     = useState(false)
  const [saving, setSaving]           = useState(false)
  const [form, setForm]               = useState(FORM_INIT)
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [sortKey, setSortKey]         = useState<SortKey>('fecha')
  const [sortDir, setSortDir]         = useState<SortDir>('desc')
  const [cols, setCols]               = useState<SortKey[]>(COLS_DEFAULT)
  const dragCol  = useRef<number | null>(null)
  const dragOver = useRef<number | null>(null)

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
    const point: Record<string, number | string> = { month }
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

  const filtered = useMemo(() => {
    const rows = (ingresos ?? [])
      .filter(i => filterTipo === 'todos' || i.tipo === filterTipo)
      .filter(i => filterQuien === 'todos' || i.quien === filterQuien)
      .filter(i => !search || i.descripcion.toLowerCase().includes(search.toLowerCase()))
    return [...rows].sort((a, b) => {
      const va = a[sortKey as keyof Ingreso] as string | number
      const vb = b[sortKey as keyof Ingreso] as string | number
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [ingresos, filterTipo, filterQuien, search, sortKey, sortDir])

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
    const next = [...cols]
    const [removed] = next.splice(dragCol.current, 1)
    next.splice(dragOver.current, 0, removed)
    setCols(next); dragCol.current = null; dragOver.current = null
  }

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
          <CardTitle action={<ChartToggle options={[{ value: 'apilado', label: '▋ Apilado' }, { value: 'agrupado', label: '▋ Agrupado' }]} value={chartType} onChange={v => setChartType(v as 'apilado' | 'agrupado')} />}>
            Evolución de ingresos {añoActivo}
          </CardTitle>
          <div className="flex gap-3 flex-wrap mb-3">
            {tiposBase.map(({ key, label, color }) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                <span className="text-slate-500 text-xs">{label}</span>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barCategoryGap="28%" barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v === 0 ? '' : fmt(v, m)} />
              {/* Tooltip con nombre de categoría */}
              <Tooltip
                contentStyle={TT}
                formatter={(value: number, name: string) => {
                  const info = getTipoInfo(name)
                  return [fmt(value, m), info.label]
                }}
              />
              {tiposBase.map(({ key, label, color }) => (
                <Bar key={key} dataKey={key} name={key} fill={color} radius={[3, 3, 0, 0]} maxBarSize={32} stackId={chartType === 'apilado' ? 'stack' : undefined} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-900 font-semibold text-[15px]">Composición</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setCompMes(v => Math.max(-1, v - 1))} className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer text-sm">‹</button>
              <span className="text-xs font-medium text-slate-700 min-w-[44px] text-center">{compMes === -1 ? 'Acum.' : MESES_CORTOS[compMes]}</span>
              <button onClick={() => setCompMes(v => Math.min(11, v + 1))} className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer text-sm">›</button>
            </div>
          </div>
          {compData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={compData} cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={3} dataKey="value">
                    {compData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={TT} formatter={(v: number, _: string, entry: { payload?: { name?: string } }) => [fmt(v, m), entry?.payload?.name ?? '']} />
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
          ) : (
            <div className="text-center text-slate-400 text-sm py-8">Sin datos</div>
          )}
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="text-slate-900 font-semibold text-[15px]">Transacciones</div>
          <span className="text-slate-400 text-xs">{filtered.length} registros · {fmt(filtered.reduce((s, i) => s + i.monto, 0), m)}</span>
        </div>
        <div className="flex gap-2 flex-wrap mb-4 items-center">
          <div className="relative flex-1 min-w-[160px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">⌕</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar descripción..." className="input-field pl-8 py-1.5 text-xs" />
          </div>
          <div className="flex gap-1 flex-wrap">
            {[{ k: 'todos', l: 'Todos' }, ...allTipos.map(t => ({ k: t.key, l: t.label }))].map(({ k, l }) => (
              <button key={k} onClick={() => setFilterTipo(k)} className={`chip text-xs py-1 px-3 ${filterTipo === k ? 'chip-on' : ''}`}>{l}</button>
            ))}
          </div>
          <div className="flex gap-1">
            {[{ k: 'todos', l: 'Todos' }, { k: 'Mati', l: 'Mati' }, { k: 'Dani', l: 'Dani' }, { k: 'ambos', l: 'Ambos' }].map(({ k, l }) => (
              <button key={k} onClick={() => setFilterQuien(k)} className={`chip text-xs py-1 px-3 ${filterQuien === k ? 'chip-on' : ''}`}>{l}</button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon="💸" title={search || filterTipo !== 'todos' ? 'Sin resultados' : 'Sin ingresos registrados'} description="Agregá tu primer ingreso para empezar." />
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
                {filtered.map((ingreso, rowIdx) => {
                  const cfg       = getTipoInfo(ingreso.tipo)
                  const isEditing = editingId === ingreso.id
                  // Mayor contraste: blanco vs gris más visible
                  const bg = rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-100'

                  if (isEditing) return (
                    <InlineEditRow key={ingreso.id} ingreso={ingreso} tiposBase={tiposBase}
                      categoriasCustom={categoriasCustom} onSave={handleUpdate}
                      onCancel={() => setEditingId(null)} refetchCats={refetchCats} />
                  )

                  const cellFor = (col: SortKey) => {
                    switch (col) {
                      case 'fecha':
                        return <td key={col} className={`py-3 px-3 border-b border-slate-200 text-sm ${bg}`}>
                          <span className="text-slate-500 text-xs font-mono">{fmtDate(ingreso.fecha)}</span>
                        </td>
                      case 'descripcion':
                        return <td key={col} className={`py-3 px-3 border-b border-slate-200 text-sm ${bg}`}>
                          <div className="flex items-center gap-2">
                            <span>{cfg.icon}</span>
                            <span className="text-slate-700 font-medium">{ingreso.descripcion || cfg.label}</span>
                          </div>
                        </td>
                      case 'tipo':
                        return <td key={col} className={`py-3 px-3 border-b border-slate-200 text-sm ${bg}`}>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: cfg.color + '18', color: cfg.color }}>{cfg.label}</span>
                        </td>
                      case 'quien':
                        return <td key={col} className={`py-3 px-3 border-b border-slate-200 text-sm ${bg}`}>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ingreso.quien === 'Mati' ? 'bg-blue-50 text-blue-700' : ingreso.quien === 'Dani' ? 'bg-pink-50 text-pink-700' : 'bg-slate-100 text-slate-500'}`}>{ingreso.quien}</span>
                        </td>
                      case 'monto':
                        return <td key={col} className={`py-3 px-3 border-b border-slate-200 text-sm text-right ${bg}`}>
                          <span className="text-emerald-700 font-mono font-bold">+{fmtFull(ingreso.monto, ingreso.moneda as Moneda)}</span>
                        </td>
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
        )}
      </Card>

      <Modal open={showModal} onClose={() => { setShowModal(false); setForm(FORM_INIT) }} title="Nuevo ingreso">
        <div className="flex flex-col gap-4">
          <div>
            <FieldLabel>Tipo</FieldLabel>
            <CategoriaSelector modulo="ingresos" value={form.tipo} onChange={v => setForm(p => ({ ...p, tipo: v }))}
              categorias={categoriasCustom} categoriasBase={tiposBase} onCategoriasChange={refetchCats} />
          </div>
          <div>
            <FieldLabel>Descripción</FieldLabel>
            <input value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Ej: Salario enero" className="input-field" />
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
