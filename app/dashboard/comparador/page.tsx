'use client'
import { useState, useMemo } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAppStore } from '@/store/appStore'
import { useIngresos, useEgresos, useDeudas, usePagosTarjeta, useTarjetas } from '@/hooks'
import { fmt } from '@/lib/utils/formatters'
import { MESES_CORTOS } from '@/lib/utils/constants'
import { PageHeader, Card, LoadingSpinner } from '@/components/ui'

const TT = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, color:'#0f172a' }

const GRUPOS = [
  { id:'ingresos', label:'Ingresos', icon:'↑', items:[
    {id:'i_sal',  label:'Salarios',      color:'#2D7D2D'},
    {id:'i_fre',  label:'Freelance',     color:'#52A852'},
    {id:'i_alq',  label:'Alquiler',      color:'#85C985'},
    {id:'i_otr',  label:'Otros ingresos',color:'#B8E0B8'},
  ]},
  { id:'egresos', label:'Egresos', icon:'↓', items:[
    {id:'e_tar',  label:'Tarjetas',      color:'#C0392B'},
    {id:'e_usd',  label:'Inv. USD',      color:'#E05A22'},
    {id:'e_ser',  label:'Servicios',     color:'#F28B30'},
    {id:'e_oli',  label:'Oli',           color:'#F5B042'},
    {id:'e_cas',  label:'Casa',          color:'#F7C96A'},
    {id:'e_soc',  label:'Social',        color:'#F9DC95'},
    {id:'e_exp',  label:'Expensas',      color:'#E8A598'},
    {id:'e_sal',  label:'Salud',         color:'#D9776C'},
    {id:'e_sup',  label:'Supermercado',  color:'#C94E42'},
  ]},
  { id:'deudas', label:'Deudas', icon:'⬡', items:[
    {id:'d_lil',  label:'Artefactos Lili',color:'#5B3FA6'},
    {id:'d_tcr',  label:'Patente T-Cross',color:'#8462CC'},
    {id:'d_ven',  label:'Ventiladores',   color:'#A988D8'},
    {id:'d_nes',  label:'ML Nestor',      color:'#CBAFE6'},
  ]},
  { id:'tarjetas', label:'Tarjetas', icon:'▣', items:[
    {id:'t_0',label:'TC 1',color:'#1A5E9E'},
    {id:'t_1',label:'TC 2',color:'#2E7EC2'},
    {id:'t_2',label:'TC 3',color:'#4D9AD4'},
    {id:'t_3',label:'TC 4',color:'#72B3E0'},
    {id:'t_4',label:'TC 5',color:'#97CCE8'},
    {id:'t_5',label:'TC 6',color:'#BCDFF2'},
  ]},
]

const ALL_ITEMS = GRUPOS.flatMap(g=>g.items.map(i=>({...i,grupoId:g.id,grupoLabel:g.label})))
const getGrupo = (id:string) => GRUPOS.find(g=>g.items.some(i=>i.id===id))

export default function ComparadorPage() {
  const { añoActivo, monedaPrincipal: m } = useAppStore()
  const { data: ingresos, loading: li } = useIngresos()
  const { data: egresos,  loading: le } = useEgresos()
  const { data: deudas,   loading: ld } = useDeudas()
  const { data: pagos,    loading: lp } = usePagosTarjeta()
  const { data: tarjetas, loading: lt } = useTarjetas()

  const [active, setActive]   = useState<Set<string>>(new Set(['i_sal','e_tar']))
  const [chartType, setChartType] = useState<'bar'|'line'>('bar')
  const [activeMeses, setActiveMeses] = useState<Set<number>>(new Set([0,1,2,3,4,5,6,7,8,9,10,11]))

  const mesesDisp = MESES_CORTOS.map((l,i)=>({label:l,idx:i})).filter(mes=>activeMeses.has(mes.idx))

  const toggleItem  = (id:string) => setActive(p=>{ const n=new Set(p); n.has(id)?n.delete(id):n.add(id); return n })
  const toggleMes   = (i:number)  => setActiveMeses(p=>{ if(p.size===1&&p.has(i)) return p; const n=new Set(p); n.has(i)?n.delete(i):n.add(i); return n })
  const clearAll    = () => setActive(new Set())

  // Calcular datos por métrica y mes
  const metricData = useMemo(()=>{
    const map: Record<string,number[]> = {}
    const mes = (i:number) => i+1

    // Ingresos
    map['i_sal'] = MESES_CORTOS.map((_,i)=>(ingresos??[]).filter(x=>x.mes===mes(i)&&x.tipo==='salario').reduce((s,x)=>s+x.monto,0))
    map['i_fre'] = MESES_CORTOS.map((_,i)=>(ingresos??[]).filter(x=>x.mes===mes(i)&&x.tipo==='freelance').reduce((s,x)=>s+x.monto,0))
    map['i_alq'] = MESES_CORTOS.map((_,i)=>(ingresos??[]).filter(x=>x.mes===mes(i)&&x.tipo==='alquiler').reduce((s,x)=>s+x.monto,0))
    map['i_otr'] = MESES_CORTOS.map((_,i)=>(ingresos??[]).filter(x=>x.mes===mes(i)&&x.tipo==='otro').reduce((s,x)=>s+x.monto,0))

    // Egresos
    const eCats: Record<string,string> = {e_tar:'tarjeta',e_usd:'usd',e_ser:'servicios',e_oli:'oli',e_cas:'casa',e_soc:'social',e_exp:'expensas',e_sal:'salud',e_sup:'super'}
    Object.entries(eCats).forEach(([key,cat])=>{
      map[key] = MESES_CORTOS.map((_,i)=>(egresos??[]).filter(x=>x.mes===mes(i)&&x.categoria===cat).reduce((s,x)=>s+x.monto,0))
    })

    // Deudas (cuotas mensuales fijas)
    const deudasMap: Record<string,number> = {}
    ;(deudas??[]).forEach((d,i)=>{ deudasMap[`d_${i}`]=d.cuota_mensual })
    ;['d_lil','d_tcr','d_ven','d_nes'].forEach((key,i)=>{
      const d = (deudas??[])[i]
      map[key] = MESES_CORTOS.map(()=>d?.cuota_mensual??0)
    })

    // Tarjetas (pagos mensuales)
    ;(tarjetas??[]).forEach((t,i)=>{
      map[`t_${i}`] = MESES_CORTOS.map((_,mi)=>(pagos??[]).find(p=>p.tarjeta_id===t.id&&p.mes===mes(mi))?.monto??0)
    })

    return map
  }, [ingresos, egresos, deudas, pagos, tarjetas])

  const activeItems = Array.from(active].map(id=>ALL_ITEMS.find(i=>i.id===id)).filter(Boolean) as typeof ALL_ITEMS

  const chartData = useMemo(()=>mesesDisp.map(mes=>({
    month: mes.label,
    ...Object.fromEntries(activeItems.map(i=>[i.id, metricData[i.id]?.[mes.idx]??0]))
  })), [activeItems, metricData, mesesDisp])

  if (li||le||ld||lp||lt) return <LoadingSpinner />

  return (
    <div>
      <PageHeader title="Comparador" subtitle={`Compará métricas financieras mes a mes — ${añoActivo}`} />

      {/* Selector */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {GRUPOS.map(g=>(
          <div key={g.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-card">
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
              <span className="text-base">{g.icon}</span>
              <span className="text-sm font-bold text-slate-700">{g.label}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {g.items.map(item=>{
                const on = active.has(item.id)
                return (
                  <div key={item.id} onClick={()=>toggleItem(item.id)}
                    className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-all ${on?'':'hover:bg-slate-50'}`}
                    style={on?{background:item.color+'12',border:`1px solid ${item.color}33`}:{border:'1px solid transparent'}}>
                    <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all`}
                      style={on?{background:item.color,borderColor:item.color}:{borderColor:'#cbd5e1'}}>
                      {on&&<span className="text-white text-[9px] font-bold">✓</span>}
                    </div>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:on?item.color:'#cbd5e1'}} />
                    <span className={`text-xs ${on?'text-slate-900 font-medium':'text-slate-500'}`}>{item.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Tags activos + controles */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <span className="text-slate-400 text-xs">Comparando:</span>
        {activeItems.map(i=>(
          <button key={i.id} onClick={()=>toggleItem(i.id)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium cursor-pointer border-none"
            style={{background:i.color+'15',color:i.color}}>
            {i.label} <span className="opacity-60">✕</span>
          </button>
        ))}
        {active.size>0 && <button onClick={clearAll} className="text-xs text-slate-400 hover:text-slate-600 underline border-none bg-transparent cursor-pointer">Limpiar todo</button>}
        <div className="ml-auto flex items-center gap-3">
          {/* Filtro meses */}
          <div className="flex gap-1">
            {MESES_CORTOS.map((l,i)=>(
              <button key={i} onClick={()=>toggleMes(i)}
                className={`text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-all ${activeMeses.has(i)?'bg-slate-800 text-white border-slate-800':'bg-transparent text-slate-500 border-slate-200 hover:border-slate-400'}`}>
                {l}
              </button>
            ))}
          </div>
          {/* Toggle tipo */}
          <div className="flex gap-1 bg-slate-100 border border-slate-200 rounded-lg p-1">
            {([['bar','▋ Barras'],['line','⟋ Líneas']] as const).map(([v,l])=>(
              <button key={v} onClick={()=>setChartType(v)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all border-none cursor-pointer ${chartType===v?'bg-white text-slate-900 shadow-sm':'bg-transparent text-slate-500'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Gráfico */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-card mb-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-slate-900 font-semibold text-[15px]">Comparativa mensual {añoActivo}</div>
          <span className="text-slate-400 text-xs">{activeItems.length} métricas · {mesesDisp.length} meses</span>
        </div>

        {activeItems.length===0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <span className="text-4xl mb-3">📊</span>
            <span className="text-sm">Seleccioná al menos una métrica para ver el comparador</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            {chartType==='bar' ? (
              <BarChart data={chartData} barCategoryGap="25%" barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{fill:'#94a3b8',fontSize:12}} axisLine={false} tickLine={false} />
                <YAxis tick={{fill:'#94a3b8',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>v===0?'':fmt(v,m)} />
                <Tooltip contentStyle={TT} formatter={(v:number,n:string)=>[fmt(v,m), ALL_ITEMS.find(i=>i.id===n)?.label||n]} />
                {activeItems.map(i=>(
                  <Bar key={i.id} dataKey={i.id} name={i.id} fill={i.color+'dd'} radius={[3,3,0,0]} maxBarSize={40}
                    stackId={getGrupo(i.id)?.id} />
                ))}
              </BarChart>
            ) : (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{fill:'#94a3b8',fontSize:12}} axisLine={false} tickLine={false} />
                <YAxis tick={{fill:'#94a3b8',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>v===0?'':fmt(v,m)} />
                <Tooltip contentStyle={TT} formatter={(v:number,n:string)=>[fmt(v,m), ALL_ITEMS.find(i=>i.id===n)?.label||n]} />
                {activeItems.map(i=>(
                  <Line key={i.id} dataKey={i.id} name={i.id} stroke={i.color} strokeWidth={2.5} dot={{r:3,fill:i.color}} type="monotone" />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {/* Tabla resumen */}
      {activeItems.length>0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-card">
          <div className="text-slate-900 font-semibold text-[15px] mb-4">Resumen de métricas seleccionadas</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-slate-400 text-[11px] font-bold uppercase tracking-widest pb-3 border-b border-slate-100">Métrica</th>
                  {mesesDisp.map(mes=><th key={mes.idx} className="text-right text-slate-400 text-[11px] font-bold uppercase tracking-widest pb-3 border-b border-slate-100 px-2">{mes.label}</th>)}
                  <th className="text-right text-slate-400 text-[11px] font-bold uppercase tracking-widest pb-3 border-b border-slate-100 px-2">Promedio</th>
                  <th className="text-right text-slate-400 text-[11px] font-bold uppercase tracking-widest pb-3 border-b border-slate-100 px-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {GRUPOS.map(g=>{
                  const gItems = activeItems.filter(i=>i.grupoId===g.id)
                  if (gItems.length===0) return null
                  return [
                    <tr key={`h_${g.id}`}>
                      <td colSpan={mesesDisp.length+3} className="py-1.5 px-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 bg-slate-50">
                        {g.icon} {g.label}
                      </td>
                    </tr>,
                    ...gItems.map(item=>{
                      const vals = mesesDisp.map(mes=>metricData[item.id]?.[mes.idx]??0)
                      const total = vals.reduce((a,b)=>a+b,0)
                      const avg   = Math.round(total/vals.length)
                      return (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-2 border-b border-slate-50">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{background:item.color}} />
                              <span className="text-sm text-slate-700">{item.label}</span>
                            </div>
                          </td>
                          {vals.map((v,i)=>(
                            <td key={i} className="py-2.5 px-2 text-right border-b border-slate-50 font-mono text-sm font-bold" style={{color:item.color}}>
                              {v>0?fmt(v,m):'—'}
                            </td>
                          ))}
                          <td className="py-2.5 px-2 text-right border-b border-slate-50 font-mono text-xs text-slate-400">{fmt(avg,m)}</td>
                          <td className="py-2.5 px-2 text-right border-b border-slate-50 font-mono text-sm font-bold" style={{color:item.color}}>{fmt(total,m)}</td>
                        </tr>
                      )
                    }),
                    gItems.length>1 && (
                      <tr key={`sub_${g.id}`} className="bg-slate-50/50">
                        <td className="py-2 px-2 border-b border-slate-100 text-xs font-bold text-slate-500">Total {g.label}</td>
                        {mesesDisp.map((mes,i)=>{
                          const sum = gItems.reduce((s,item)=>s+(metricData[item.id]?.[mes.idx]??0),0)
                          return <td key={i} className="py-2 px-2 text-right border-b border-slate-100 font-mono text-xs font-bold text-slate-600">{sum>0?fmt(sum,m):'—'}</td>
                        })}
                        <td className="py-2 px-2 border-b border-slate-100" />
                        <td className="py-2 px-2 text-right border-b border-slate-100 font-mono text-xs font-bold text-slate-600">
                          {fmt(gItems.reduce((s,item)=>s+mesesDisp.reduce((ss,mes)=>ss+(metricData[item.id]?.[mes.idx]??0),0),0),m)}
                        </td>
                      </tr>
                    )
                  ]
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
