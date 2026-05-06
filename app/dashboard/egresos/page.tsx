'use client'
import { useState, useMemo } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAppStore } from '@/store/appStore'
import { useEgresos } from '@/hooks'
import { createEgreso, deleteEgreso } from '@/lib/queries'
import { fmt, fmtFull, fmtDate } from '@/lib/utils/formatters'
import { MESES_CORTOS, TIPOS_EGRESO } from '@/lib/utils/constants'
import { StatCard, PageHeader, Card, CardTitle, ChartToggle, Modal, Badge, Table, Th, Td, LoadingSpinner, EmptyState, FieldLabel } from '@/components/ui'
import type { TipoEgreso, Moneda, Quien } from '@/types'

const TT = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, color:'#0f172a' }
const FORM_INIT = { categoria:'tarjeta' as TipoEgreso, monto:'', descripcion:'', fecha:new Date().toISOString().split('T')[0], moneda:'ARS' as Moneda, quien:'ambos' as Quien, recurrente:false }

export default function EgresosPage() {
  const { añoActivo, monedaPrincipal: m } = useAppStore()
  const { data: egresos, loading, refetch } = useEgresos()
  const [chartType, setChartType] = useState<'apilado'|'agrupado'>('apilado')
  const [compMes, setCompMes] = useState(-1)
  const [filterCat, setFilterCat] = useState('todos')
  const [filterQuien, setFilterQuien] = useState('todos')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(FORM_INIT)
  const [rankingMes, setRankingMes] = useState(new Date().getMonth())
  const cats = Object.entries(TIPOS_EGRESO)

  const chartData = useMemo(() => MESES_CORTOS.map((month, i) => {
    const mes = i + 1
    const point: Record<string,number|string> = { month }
    cats.forEach(([key]) => { point[key] = (egresos??[]).filter(x=>x.mes===mes&&x.categoria===key).reduce((s,x)=>s+x.monto,0) })
    return point
  }), [egresos])

  const compData = useMemo(() => {
    const src = compMes===-1 ? egresos??[] : (egresos??[]).filter(x=>x.mes===compMes+1)
    return cats.map(([key,cfg])=>({ name:cfg.label, color:cfg.color, value:src.filter(e=>e.categoria===key).reduce((s,e)=>s+e.monto,0) })).filter(d=>d.value>0).sort((a,b)=>b.value-a.value)
  }, [egresos, compMes])

  const rankingData = useMemo(() => {
    const src = (egresos??[]).filter(e=>e.mes===rankingMes+1)
    const srcPrev = (egresos??[]).filter(e=>e.mes===rankingMes)
    return cats.map(([key,cfg])=>({
      name:cfg.label, color:cfg.color,
      value:src.filter(e=>e.categoria===key).reduce((s,e)=>s+e.monto,0),
      prev:srcPrev.filter(e=>e.categoria===key).reduce((s,e)=>s+e.monto,0),
    })).filter(d=>d.value>0).sort((a,b)=>b.value-a.value).slice(0,5)
  }, [egresos, rankingMes])

  const filtered = useMemo(() => (egresos??[])
    .filter(e=>filterCat==='todos'||e.categoria===filterCat)
    .filter(e=>filterQuien==='todos'||e.quien===filterQuien)
    .filter(e=>!search||e.descripcion.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>b.fecha.localeCompare(a.fecha))
  , [egresos, filterCat, filterQuien, search])

  const total = (egresos??[]).reduce((s,e)=>s+e.monto,0)
  const totalTarjetas = (egresos??[]).filter(e=>e.categoria==='tarjeta').reduce((s,e)=>s+e.monto,0)
  const totalUSD = (egresos??[]).filter(e=>e.categoria==='usd').reduce((s,e)=>s+e.monto,0)

  const handleSave = async () => {
    if (!form.monto||!form.fecha) return
    setSaving(true)
    try {
      await createEgreso({ categoria:form.categoria, descripcion:form.descripcion, monto:parseFloat(form.monto), moneda:form.moneda, fecha:form.fecha, quien:form.quien, recurrente:form.recurrente })
      setShowModal(false); setForm(FORM_INIT); refetch()
    } catch(e){ console.error(e) } finally { setSaving(false) }
  }

  const handleDelete = async (id:string) => {
    if (!confirm('¿Eliminar este egreso?')) return
    await deleteEgreso(id); refetch()
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader title="Egresos" subtitle={`Control detallado de gastos — ${añoActivo}`}
        action={<button className="btn-primary" onClick={()=>setShowModal(true)}>+ Nuevo egreso</button>} />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label={`Total ${añoActivo}`} value={fmt(total,m)} color="#C0392B" icon="📤" sub="Acumulado" />
        <StatCard label="Tarjetas crédito" value={fmt(totalTarjetas,m)} color="#1A5E9E" icon="💳" sub={`${total>0?Math.round(totalTarjetas/total*100):0}% del total`} />
        <StatCard label="Inversiones USD" value={fmt(totalUSD,m)} color="#2D7D2D" icon="💵" sub={`${total>0?Math.round(totalUSD/total*100):0}% del total`} />
      </div>

      <div className="grid grid-cols-3 gap-5 mb-5">
        <Card className="col-span-2">
          <CardTitle action={<ChartToggle options={[{value:'apilado',label:'▋ Apilado'},{value:'agrupado',label:'▋ Agrupado'}]} value={chartType} onChange={v=>setChartType(v as any)} />}>
            Evolución de egresos {añoActivo}
          </CardTitle>
          <div className="flex gap-2 flex-wrap mb-3">
            {cats.map(([key,cfg])=>(<div key={key} className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm" style={{background:cfg.color}} /><span className="text-slate-500 text-[10px]">{cfg.label}</span></div>))}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barCategoryGap="28%" barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{fill:'#94a3b8',fontSize:11}} axisLine={false} tickLine={false} />
              <YAxis tick={{fill:'#94a3b8',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>v===0?'':fmt(v,m)} />
              <Tooltip contentStyle={TT} formatter={(v:number)=>[fmt(v,m)]} />
              {cats.map(([key,cfg])=>(<Bar key={key} dataKey={key} name={cfg.label} fill={cfg.color} radius={[3,3,0,0]} maxBarSize={32} stackId={chartType==='apilado'?'stack':undefined} />))}
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-900 font-semibold text-[13px]">Composición</span>
              <div className="flex items-center gap-1">
                <button onClick={()=>setCompMes(m=>Math.max(-1,m-1))} className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer text-sm">‹</button>
                <span className="text-xs font-medium text-slate-700 min-w-[40px] text-center">{compMes===-1?'Acum.':MESES_CORTOS[compMes]}</span>
                <button onClick={()=>setCompMes(m=>Math.min(11,m+1))} className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer text-sm">›</button>
              </div>
            </div>
            {compData.length>0 ? (
              <>
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart><Pie data={compData} cx="50%" cy="50%" innerRadius={38} outerRadius={60} paddingAngle={3} dataKey="value">
                    {compData.map((d,i)=><Cell key={i} fill={d.color} />)}
                  </Pie><Tooltip contentStyle={TT} formatter={(v:number)=>[fmt(v,m)]} /></PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1 mt-1">
                  {compData.slice(0,5).map(d=>(<div key={d.name} className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full" style={{background:d.color}} /><span className="text-slate-500 text-[10px]">{d.name}</span></div>
                    <span className="text-slate-900 text-[10px] font-mono font-bold">{fmt(d.value,m)}</span>
                  </div>))}
                </div>
              </>
            ) : <div className="text-center text-slate-400 text-sm py-4">Sin datos</div>}
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-900 font-semibold text-[13px]">Top 5 categorías</span>
              <div className="flex items-center gap-1">
                <button onClick={()=>setRankingMes(m=>Math.max(0,m-1))} className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer text-sm">‹</button>
                <span className="text-xs font-medium text-slate-700 min-w-[28px] text-center">{MESES_CORTOS[rankingMes]}</span>
                <button onClick={()=>setRankingMes(m=>Math.min(11,m+1))} className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer text-sm">›</button>
              </div>
            </div>
            {rankingData.length>0 ? rankingData.map((d,i)=>{
              const pct = rankingData[0].value>0 ? Math.round(d.value/rankingData[0].value*100) : 0
              const diff = d.prev>0 ? Math.round((d.value-d.prev)/d.prev*100) : null
              return (
                <div key={d.name} className="mb-3">
                  <div className="flex justify-between mb-1">
                    <span className="text-xs font-medium" style={{color:d.color}}>{i+1}. {d.name}</span>
                    <div className="flex items-center gap-2">
                      {diff!==null && <span className={`text-[10px] font-bold ${diff>0?'text-red-500':'text-emerald-600'}`}>{diff>0?'▲':'▼'}{Math.abs(diff)}%</span>}
                      <span className="text-xs font-mono font-bold text-slate-700">{fmt(d.value,m)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{width:`${pct}%`,background:d.color}} />
                  </div>
                </div>
              )
            }) : <div className="text-center text-slate-400 text-sm py-4">Sin datos este mes</div>}
          </Card>
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="text-slate-900 font-semibold text-[15px]">Transacciones</div>
          <span className="text-slate-400 text-xs">{filtered.length} registros · {fmt(filtered.reduce((s,e)=>s+e.monto,0),m)}</span>
        </div>
        <div className="flex gap-2 flex-wrap mb-4 items-center">
          <div className="relative flex-1 min-w-[160px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">⌕</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar descripción..." className="input-field pl-8 py-1.5 text-xs" />
          </div>
          <div className="flex gap-1 flex-wrap">
            {[{k:'todos',l:'Todas'},...cats.map(([k,v])=>({k,l:v.label}))].map(({k,l})=>(<button key={k} onClick={()=>setFilterCat(k)} className={`chip text-xs py-1 px-2.5 ${filterCat===k?'chip-on':''}`}>{l}</button>))}
          </div>
          <div className="flex gap-1">
            {[{k:'todos',l:'Todos'},{k:'Mati',l:'Mati'},{k:'Dani',l:'Dani'},{k:'ambos',l:'Ambos'}].map(({k,l})=>(<button key={k} onClick={()=>setFilterQuien(k)} className={`chip text-xs py-1 px-3 ${filterQuien===k?'chip-on':''}`}>{l}</button>))}
          </div>
        </div>
        {filtered.length===0 ? (
          <EmptyState icon="💸" title={search||filterCat!=='todos'?'Sin resultados':'Sin egresos registrados'} description="Agregá tu primer egreso para empezar." />
        ) : (
          <Table>
            <thead><tr><Th>Descripción</Th><Th>Categoría</Th><Th>Fecha</Th><Th>Quién</Th><Th right>Importe</Th><Th right> </Th></tr></thead>
            <tbody>
              {filtered.map(e=>{ const cfg=TIPOS_EGRESO[e.categoria as TipoEgreso]||TIPOS_EGRESO.otro; return (
                <tr key={e.id}>
                  <Td><div className="flex items-center gap-2"><span>{cfg.icon}</span><span className="text-slate-700 font-medium">{e.descripcion||cfg.label}</span></div></Td>
                  <Td><Badge color={cfg.color}>{cfg.label}</Badge></Td>
                  <Td className="text-slate-500 text-xs">{fmtDate(e.fecha)}</Td>
                  <Td><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.quien==='Mati'?'bg-blue-50 text-blue-700':e.quien==='Dani'?'bg-pink-50 text-pink-700':'bg-slate-100 text-slate-500'}`}>{e.quien}</span></Td>
                  <Td right className="text-red-600 font-mono font-bold">-{fmtFull(e.monto,e.moneda as Moneda)}</Td>
                  <Td right><button onClick={()=>handleDelete(e.id)} className="text-slate-300 hover:text-red-500 transition-colors text-sm border-none bg-transparent cursor-pointer">✕</button></Td>
                </tr>
              )})}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={showModal} onClose={()=>{setShowModal(false);setForm(FORM_INIT)}} title="Nuevo egreso">
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Categoría</FieldLabel>
            <select value={form.categoria} onChange={e=>setForm(p=>({...p,categoria:e.target.value as TipoEgreso}))} className="input-field">
              {cats.map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
          </div>
          <div><FieldLabel>Descripción</FieldLabel>
            <input value={form.descripcion} onChange={e=>setForm(p=>({...p,descripcion:e.target.value}))} placeholder="Ej: Pago tarjeta Galicia" className="input-field" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Monto</FieldLabel><input type="number" value={form.monto} onChange={e=>setForm(p=>({...p,monto:e.target.value}))} placeholder="0" className="input-field" /></div>
            <div><FieldLabel>Moneda</FieldLabel><select value={form.moneda} onChange={e=>setForm(p=>({...p,moneda:e.target.value as Moneda}))} className="input-field">{['ARS','USD','EUR'].map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Fecha</FieldLabel><input type="date" value={form.fecha} onChange={e=>setForm(p=>({...p,fecha:e.target.value}))} className="input-field" /></div>
            <div><FieldLabel>Quién</FieldLabel><select value={form.quien} onChange={e=>setForm(p=>({...p,quien:e.target.value as Quien}))} className="input-field"><option value="ambos">Ambos</option><option value="Mati">Mati</option><option value="Dani">Dani</option></select></div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.recurrente} onChange={e=>setForm(p=>({...p,recurrente:e.target.checked}))} className="w-4 h-4 accent-blue-700" />
            <span className="text-slate-600 text-sm">Egreso recurrente</span>
          </label>
          <div className="flex gap-3 pt-2">
            <button onClick={()=>{setShowModal(false);setForm(FORM_INIT)}} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={handleSave} disabled={saving||!form.monto||!form.fecha} className="btn-primary flex-1 disabled:opacity-50">{saving?'Guardando...':'Guardar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
