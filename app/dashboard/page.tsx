'use client'
import { useState } from 'react'
import { BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useAppStore } from '@/store/appStore'
import { useIngresos, useEgresos, useDeudas, useTarjetas } from '@/hooks'
import { calcularResumen } from '@/lib/utils/calculations'
import { fmt } from '@/lib/utils/formatters'
import { MESES_CORTOS, TIPOS_EGRESO } from '@/lib/utils/constants'
import { StatCard, PageHeader, Card, CardTitle, ChartToggle, ProgressBar, LoadingSpinner } from '@/components/ui'

const TT = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, color:'#0f172a', boxShadow:'0 4px 12px rgba(0,0,0,0.08)' }
const PIE_COLORS = ['#1A5E9E','#2D7D2D','#E8A020','#D4537E','#5B3FA6','#1D9E75','#C0392B','#888780']

export default function DashboardPage() {
  const [flowType, setFlowType] = useState<'bar'|'area'>('bar')
  const { añoActivo, monedaPrincipal: m } = useAppStore()

  const { data: ingresos, loading: li } = useIngresos()
  const { data: egresos,  loading: le } = useEgresos()
  const { data: deudas,   loading: ld } = useDeudas()
  const { data: tarjetas, loading: lt } = useTarjetas()

  if (li || le || ld || lt) return <LoadingSpinner />

  const r = calcularResumen(ingresos??[], egresos??[], deudas??[])

  const flowData = MESES_CORTOS.map((month, i) => {
    const mes = i + 1
    return {
      month,
      Ingresos: (ingresos??[]).filter(x=>x.mes===mes).reduce((s,x)=>s+x.monto,0),
      Gastos:   (egresos??[]).filter(x=>x.mes===mes).reduce((s,x)=>s+x.monto,0),
    }
  })

  const pieData = Object.entries(TIPOS_EGRESO).map(([key, cfg]) => ({
    name: cfg.label,
    value: (egresos??[]).filter(e=>e.categoria===key).reduce((s,e)=>s+e.monto,0),
    color: cfg.color,
  })).filter(d=>d.value>0).sort((a,b)=>b.value-a.value).slice(0,7)

  return (
    <div>
      <PageHeader title="Panel Financiero" subtitle={`Resumen anual — ${añoActivo}`} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Ingresos anuales"  value={fmt(r.totalIngresos,m)} sub={`Acumulado ${añoActivo}`} trend={8.2}  color="#2D7D2D" icon="💰" />
        <StatCard label="Egresos anuales"   value={fmt(r.totalEgresos,m)}  sub={`Acumulado ${añoActivo}`} trend={-3.1} color="#C0392B" icon="📤" />
        <StatCard label="Ahorro acumulado"  value={fmt(r.totalIngresos-r.totalEgresos,m)} sub={`Balance ${añoActivo}`} trend={12.4} color="#1A5E9E" icon="🏦" />
        <StatCard label="Deuda total"       value={fmt(r.totalDeuda,m)}    sub="Obligaciones activas"  trend={-2.8} trendInvert color="#5B3FA6" icon="📋" />
      </div>

      <div className="grid grid-cols-3 gap-5 mb-5">
        <Card className="col-span-2">
          <CardTitle action={
            <ChartToggle
              options={[{value:'bar',label:'▋ Barras'},{value:'area',label:'⟋ Área'}]}
              value={flowType} onChange={v=>setFlowType(v as 'bar'|'area')} />
          }>
            Flujo Financiero {añoActivo}
          </CardTitle>
          <ResponsiveContainer width="100%" height={220}>
            {flowType==='bar'?(
              <BarChart data={flowData} barCategoryGap="30%" barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{fill:'#94a3b8',fontSize:11}} axisLine={false} tickLine={false} />
                <YAxis tick={{fill:'#94a3b8',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>v===0?'':fmt(v/1000,m).replace(/[^0-9kKMm.,]/g,'')+'k'} />
                <Tooltip contentStyle={TT} formatter={(v:number)=>[fmt(v,m)]} />
                <Legend wrapperStyle={{color:'#64748b',fontSize:12}} />
                <Bar dataKey="Ingresos" fill="#86efac" radius={[4,4,0,0]} maxBarSize={28} />
                <Bar dataKey="Gastos"   fill="#fca5a5" radius={[4,4,0,0]} maxBarSize={28} />
              </BarChart>
            ):(
              <AreaChart data={flowData}>
                <defs>
                  <linearGradient id="gI" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#2D7D2D" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#2D7D2D" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#C0392B" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#C0392B" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{fill:'#94a3b8',fontSize:11}} axisLine={false} tickLine={false} />
                <YAxis tick={{fill:'#94a3b8',fontSize:11}} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TT} formatter={(v:number)=>[fmt(v,m)]} />
                <Legend wrapperStyle={{color:'#64748b',fontSize:12}} />
                <Area type="monotone" dataKey="Ingresos" stroke="#2D7D2D" fill="url(#gI)" strokeWidth={2.5} />
                <Area type="monotone" dataKey="Gastos"   stroke="#C0392B" fill="url(#gE)" strokeWidth={2.5} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </Card>

        <Card>
          <CardTitle>Distribución de Gastos</CardTitle>
          {pieData.length>0?(
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={3} dataKey="value">
                    {pieData.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={TT} formatter={(v:number)=>[fmt(v,m)]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1.5 mt-2">
                {pieData.map((d,i)=>(
                  <div key={d.name} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{background:PIE_COLORS[i%PIE_COLORS.length]}} />
                      <span className="text-slate-500 text-xs">{d.name}</span>
                    </div>
                    <span className="text-slate-900 text-xs font-mono font-bold">{fmt(d.value,m)}</span>
                  </div>
                ))}
              </div>
            </>
          ):(
            <div className="text-center text-slate-400 text-sm py-8">Sin datos de egresos</div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Card>
          <CardTitle>Deudas activas</CardTitle>
          {(deudas??[]).length===0?(
            <div className="text-slate-400 text-sm text-center py-4">Sin deudas registradas</div>
          ):(deudas??[]).map(d=>{
            const pct = Math.round(((d.total_original-d.pendiente)/d.total_original)*100)
            return (
              <div key={d.id} className="mb-4">
                <div className="flex justify-between mb-1.5">
                  <span className="text-slate-700 text-sm font-medium">{d.nombre}</span>
                  <span className="font-mono text-sm font-bold" style={{color:d.color}}>{fmt(d.pendiente,m)}</span>
                </div>
                <ProgressBar value={pct} color={d.color} />
                <div className="text-slate-400 text-xs mt-1">{pct}% pagado · cuota {fmt(d.cuota_mensual,m)}/mes</div>
              </div>
            )
          })}
        </Card>

        <Card>
          <CardTitle>Tarjetas de crédito</CardTitle>
          {(tarjetas??[]).length===0?(
            <div className="text-slate-400 text-sm text-center py-4">Sin tarjetas registradas</div>
          ):(tarjetas??[]).map(t=>(
            <div key={t.id} className="mb-4">
              <div className="flex justify-between items-center mb-1.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{background:t.color}}>
                    {t.icono}
                  </div>
                  <div>
                    <div className="text-slate-700 text-sm font-medium">{t.nombre}</div>
                    <div className="text-slate-400 text-xs">{t.banco} · {t.quien}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-bold text-slate-600">{fmt(t.limite,m)}</div>
                  <div className="text-slate-400 text-xs">límite</div>
                </div>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
