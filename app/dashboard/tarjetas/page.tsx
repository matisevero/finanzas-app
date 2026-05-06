'use client'
import { useState, useMemo } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAppStore } from '@/store/appStore'
import { useTarjetas, usePagosTarjeta, useTarjetaTransacciones } from '@/hooks'
import { fmt, fmtDate } from '@/lib/utils/formatters'
import { MESES_CORTOS } from '@/lib/utils/constants'
import { PageHeader, Card, CardTitle, Modal, Badge, Table, Th, Td, LoadingSpinner, EmptyState, FieldLabel, ProgressBar } from '@/components/ui'
import type { Moneda, Quien } from '@/types'

const TT = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, color:'#0f172a' }
const FORM_INIT = { nombre:'', banco:'', limite:'', moneda:'ARS' as Moneda, color:'#1A5E9E', icono:'V', quien:'ambos' as Quien, dia_cierre:'1', dia_vencimiento:'10' }
const CHART_COLORS = ['#1A5E9E','#C0392B','#2D7D2D','#5B3FA6','#E8A020','#D4537E','#1D9E75']
const CAT_COLORS: Record<string,{bg:string,c:string}> = {
  'Alimentación':{bg:'#EAF3DE',c:'#3B6D11'},'Tecnología':{bg:'#E6F1FB',c:'#185FA5'},
  'Ropa':{bg:'#FBEAF0',c:'#72243E'},'Hogar':{bg:'#EEEDFE',c:'#3C3489'},
  'Viajes':{bg:'#E1F5EE',c:'#0F6E56'},'Entretenimiento':{bg:'#FAEEDA',c:'#854F0B'},
  'Salud':{bg:'#FCEBEB',c:'#A32D2D'},'Otros':{bg:'#F1EFE8',c:'#5F5E5A'},
}

export default function TarjetasPage() {
  const { monedaPrincipal: m } = useAppStore()
  const { data: tarjetas, loading: lt, refetch: refTarjetas } = useTarjetas()
  const { data: pagos,    loading: lp } = usePagosTarjeta()
  const { data: txns,     loading: lx } = useTarjetaTransacciones()
  const [selTC, setSelTC] = useState<string|null>(null)
  const [filterCat, setFilterCat] = useState('Todos')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(FORM_INIT)

  const activaId = selTC ?? 'todas'
  const MESES_DISP = MESES_CORTOS.slice(0,6)

  // Pagos por tarjeta por mes
  const pagosPorTC = useMemo(() => {
    const map: Record<string, Record<number,number>> = {}
    ;(pagos??[]).forEach(p => {
      if (!map[p.tarjeta_id]) map[p.tarjeta_id]={}
      map[p.tarjeta_id][p.mes] = p.monto
    })
    return map
  }, [pagos])

  // Chart data
  const chartData = useMemo(() => MESES_DISP.map((month,i) => {
    const mes = i+1
    const point: Record<string,number|string> = { month }
    if (activaId==='todas') {
      ;(tarjetas??[]).forEach(t => { point[t.id] = pagosPorTC[t.id]?.[mes]??0 })
    } else {
      point['pago'] = pagosPorTC[activaId]?.[mes]??0
    }
    return point
  }), [tarjetas, pagosPorTC, activaId])

  // Txns filtradas
  const filteredTxns = useMemo(() => (txns??[])
    .filter(t => activaId==='todas' || t.tarjeta_id===activaId)
    .filter(t => filterCat==='Todos' || t.categoria===filterCat)
    .filter(t => !search || t.descripcion.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>b.fecha.localeCompare(a.fecha))
  , [txns, activaId, filterCat, search])

  // Total por tarjeta
  const totalPorTC = useMemo(() => {
    const map: Record<string,number> = {}
    ;(pagos??[]).forEach(p => { map[p.tarjeta_id] = (map[p.tarjeta_id]||0)+p.monto })
    return map
  }, [pagos])

  const totalGlobal = Object.values(totalPorTC).reduce((s,v)=>s+v,0)

  // Composición donut (solo en "todas")
  const compData = useMemo(() => (tarjetas??[]).map((t,i)=>({
    name: t.nombre+' '+t.banco.split(' · ').slice(-1)[0],
    value: totalPorTC[t.id]||0,
    color: CHART_COLORS[i%CHART_COLORS.length],
  })).filter(d=>d.value>0), [tarjetas, totalPorTC])

  const cats = ['Todos','Alimentación','Tecnología','Ropa','Hogar','Viajes','Entretenimiento','Salud','Otros']

  if (lt||lp||lx) return <LoadingSpinner />

  const tcActiva = activaId==='todas' ? null : (tarjetas??[]).find(t=>t.id===activaId)

  // KPIs de la tarjeta activa o globales
  const kpiPagos = activaId==='todas'
    ? MESES_DISP.map((_,i)=>(tarjetas??[]).reduce((s,t)=>s+(pagosPorTC[t.id]?.[i+1]??0),0))
    : MESES_DISP.map((_,i)=>pagosPorTC[activaId]?.[i+1]??0)
  const kpiTotal  = kpiPagos.reduce((a,b)=>a+b,0)
  const kpiUlt    = kpiPagos[kpiPagos.length-1]
  const kpiPen    = kpiPagos[kpiPagos.length-2]
  const kpiTrend  = kpiPen>0 ? Math.round(((kpiUlt-kpiPen)/kpiPen)*100) : null
  const kpiMayor  = Math.max(...kpiPagos)
  const kpiMayorMes = MESES_DISP[kpiPagos.indexOf(kpiMayor)]

  return (
    <div>
      <PageHeader title="Tarjetas de crédito" subtitle="Seguimiento de pagos y transacciones"
        action={<button className="btn-primary" onClick={()=>setShowModal(true)}>+ Nueva tarjeta</button>} />

      {/* Selector horizontal */}
      <div className="flex gap-3 overflow-x-auto pb-2 mb-6">
        {/* Todas */}
        <div onClick={()=>setSelTC(null)}
          className={`flex-shrink-0 bg-white border-2 rounded-2xl p-4 cursor-pointer transition-all min-w-[140px] ${activaId==='todas'?'border-slate-400':'border-slate-100 hover:border-slate-200'}`}>
          <div className="text-2xl mb-2">★</div>
          <div className="text-sm font-semibold text-slate-900">Todas</div>
          <div className="text-xs text-slate-400 mt-1">total 2026</div>
          <div className="text-lg font-bold font-mono text-slate-700 mt-1">{fmt(totalGlobal,m)}</div>
        </div>

        {(tarjetas??[]).map((t,i)=>{
          const ultPago = pagosPorTC[t.id]?.[new Date().getMonth()+1] ?? pagosPorTC[t.id]?.[new Date().getMonth()] ?? 0
          const total   = totalPorTC[t.id]||0
          const isActive = activaId===t.id
          return (
            <div key={t.id} onClick={()=>setSelTC(t.id)}
              className={`flex-shrink-0 bg-white border-2 rounded-2xl p-4 cursor-pointer transition-all min-w-[155px]`}
              style={{borderColor: isActive ? t.color : '#f1f5f9'}}>
              <div className="flex justify-between items-start mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{background:t.color}}>{t.icono}</div>
                {t.quien!=='ambos' && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.quien==='Mati'?'bg-blue-50 text-blue-700':'bg-pink-50 text-pink-700'}`}>{t.quien}</span>
                )}
              </div>
              <div className="text-sm font-semibold text-slate-900">{t.nombre}</div>
              <div className="text-xs text-slate-400">{t.banco}</div>
              <div className="text-lg font-bold font-mono mt-1" style={{color:t.color}}>{fmt(ultPago||total,m)}</div>
              <div className="text-[10px] text-slate-400">{ultPago?'últ. pago':'total 2026'}</div>
              {ultPago>0 && <div className="mt-2"><ProgressBar value={Math.min(100,Math.round(ultPago/2000000*100))} color={t.color} height={3} /></div>}
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-3 gap-5 mb-5">
        {/* Evolución */}
        <Card className="col-span-2">
          <CardTitle>
            Evolución de pagos
            <span className="text-slate-400 text-xs font-normal ml-2">{activaId==='todas'?'Todas las tarjetas':tcActiva?.nombre}</span>
          </CardTitle>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barCategoryGap="30%" barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{fill:'#94a3b8',fontSize:11}} axisLine={false} tickLine={false} />
              <YAxis tick={{fill:'#94a3b8',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>v===0?'':fmt(v,m)} />
              <Tooltip contentStyle={TT} formatter={(v:number)=>[fmt(v,m)]} />
              {activaId==='todas'
                ? (tarjetas??[]).map((t,i)=><Bar key={t.id} dataKey={t.id} name={t.nombre} fill={CHART_COLORS[i%CHART_COLORS.length]} radius={[3,3,0,0]} maxBarSize={28} stackId="s" />)
                : <Bar dataKey="pago" fill={tcActiva?.color||'#1A5E9E'} radius={[3,3,0,0]} maxBarSize={40} />
              }
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* KPIs + composición */}
        <div className="flex flex-col gap-3">
          {[
            {l:'Total pagado 2026', v:fmt(kpiTotal,m), s:activaId==='todas'?'Todas las tarjetas':tcActiva?.banco||''},
            {l:`Último pago (${MESES_CORTOS[new Date().getMonth()]})`, v:fmt(kpiUlt,m), s:kpiTrend!==null?(kpiTrend>=0?'▲':'▼')+' '+Math.abs(kpiTrend)+'% vs anterior':'', c:kpiTrend!==null&&kpiTrend>=0?'#C0392B':'#2D7D2D'},
            {l:'Mes más caro', v:fmt(kpiMayor,m), s:kpiMayorMes},
          ].map(k=>(
            <div key={k.l} className="bg-white border border-slate-200 rounded-xl p-4 shadow-card">
              <div className="label mb-1">{k.l}</div>
              <div className="text-xl font-bold font-mono text-slate-900">{k.v}</div>
              {k.s && <div className="text-xs mt-1" style={{color:k.c||'#94a3b8'}}>{k.s}</div>}
            </div>
          ))}

          {activaId==='todas' && compData.length>0 && (
            <Card padding="sm">
              <div className="text-slate-900 font-semibold text-xs mb-2">Por tarjeta</div>
              <ResponsiveContainer width="100%" height={100}>
                <PieChart><Pie data={compData} cx="50%" cy="50%" innerRadius={30} outerRadius={46} paddingAngle={3} dataKey="value">
                  {compData.map((d,i)=><Cell key={i} fill={d.color} />)}
                </Pie><Tooltip contentStyle={TT} formatter={(v:number)=>[fmt(v,m)]} /></PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1 mt-1">
                {compData.map(d=>(
                  <div key={d.name} className="flex justify-between">
                    <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full" style={{background:d.color}} /><span className="text-[10px] text-slate-500 truncate max-w-[100px]">{d.name}</span></div>
                    <span className="text-[10px] font-mono font-bold text-slate-700">{fmt(d.value,m)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Lista transacciones */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="text-slate-900 font-semibold text-[15px]">Transacciones</div>
          <span className="text-slate-400 text-xs">{filteredTxns.length} registros</span>
        </div>
        <div className="flex gap-2 flex-wrap mb-4 items-center">
          <div className="relative flex-1 min-w-[160px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">⌕</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar..." className="input-field pl-8 py-1.5 text-xs" />
          </div>
          <div className="flex gap-1 flex-wrap">
            {cats.map(c=><button key={c} onClick={()=>setFilterCat(c)} className={`chip text-xs py-1 px-2.5 ${filterCat===c?'chip-on':''}`}>{c}</button>)}
          </div>
        </div>

        {filteredTxns.length===0 ? (
          <EmptyState icon="💳" title="Sin transacciones" description="Las transacciones de tarjeta aparecerán acá." />
        ) : (
          <Table>
            <thead><tr>
              <Th>Fecha</Th><Th>Descripción</Th><Th>Categoría</Th><Th>Cuotas</Th><Th right>Importe</Th>
            </tr></thead>
            <tbody>
              {filteredTxns.map(t=>{
                const cc = CAT_COLORS[t.categoria]||{bg:'#F1EFE8',c:'#5F5E5A'}
                const isUSD = t.moneda==='USD'
                const tc = (tarjetas??[]).find(x=>x.id===t.tarjeta_id)
                return (
                  <tr key={t.id}>
                    <Td className="text-slate-400 text-xs font-mono">{fmtDate(t.fecha)}</Td>
                    <Td>
                      <div className="text-slate-700 font-medium">{t.descripcion}</div>
                      {tc && <div className="text-slate-400 text-xs">{tc.nombre} · {tc.banco}</div>}
                    </Td>
                    <Td><span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{background:cc.bg,color:cc.c}}>{t.categoria}</span></Td>
                    <Td className="text-slate-400 text-xs font-mono text-center">{t.cuota_actual&&t.cuota_total?`${t.cuota_actual}/${t.cuota_total}`:'—'}</Td>
                    <Td right>
                      <div className={`font-mono font-bold text-sm ${isUSD?'text-blue-700':'text-red-600'}`}>
                        {isUSD?'US$':'$'}{t.monto.toLocaleString('es-AR')}
                      </div>
                      {isUSD&&t.cotizacion_ars&&<div className="text-slate-400 text-xs">≈ {fmt(t.monto*t.cotizacion_ars)}</div>}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Modal nueva tarjeta */}
      <Modal open={showModal} onClose={()=>{setShowModal(false);setForm(FORM_INIT)}} title="Nueva tarjeta">
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Nombre</FieldLabel><input value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Ej: VISA Galicia" className="input-field" /></div>
          <div><FieldLabel>Banco / titular</FieldLabel><input value={form.banco} onChange={e=>setForm(p=>({...p,banco:e.target.value}))} placeholder="Ej: Galicia · Mati" className="input-field" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Límite</FieldLabel><input type="number" value={form.limite} onChange={e=>setForm(p=>({...p,limite:e.target.value}))} placeholder="0" className="input-field" /></div>
            <div><FieldLabel>Moneda</FieldLabel><select value={form.moneda} onChange={e=>setForm(p=>({...p,moneda:e.target.value as Moneda}))} className="input-field">{['ARS','USD'].map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Titular</FieldLabel><select value={form.quien} onChange={e=>setForm(p=>({...p,quien:e.target.value as Quien}))} className="input-field"><option value="ambos">Ambos</option><option value="Mati">Mati</option><option value="Dani">Dani</option></select></div>
            <div><FieldLabel>Ícono</FieldLabel><input value={form.icono} onChange={e=>setForm(p=>({...p,icono:e.target.value}))} placeholder="V" maxLength={3} className="input-field" /></div>
          </div>
          <div><FieldLabel>Color</FieldLabel>
            <div className="flex gap-2 mt-1">
              {['#1A5E9E','#C0392B','#7F77DD','#EF9F27','#D4537E','#1D9E75','#639922'].map(c=>(
                <button key={c} onClick={()=>setForm(p=>({...p,color:c}))} className={`w-7 h-7 rounded-full border-2 cursor-pointer ${form.color===c?'border-slate-900 scale-110':'border-transparent'}`} style={{background:c}} />
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={()=>{setShowModal(false);setForm(FORM_INIT)}} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={async()=>{
              if(!form.nombre) return; setSaving(true)
              try {
                const {createClient}=await import('@/lib/supabase/client')
                const sb=createClient()
                const {data:{user}}=await sb.auth.getUser()
                if(!user) return
                await sb.from('tarjetas').insert({...form,user_id:user.id,limite:parseFloat(form.limite)||0,dia_cierre:parseInt(form.dia_cierre),dia_vencimiento:parseInt(form.dia_vencimiento),activa:true})
                setShowModal(false); setForm(FORM_INIT); refTarjetas()
              } catch(e){console.error(e)} finally{setSaving(false)}
            }} disabled={saving||!form.nombre} className="btn-primary flex-1 disabled:opacity-50">{saving?'Guardando...':'Guardar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
