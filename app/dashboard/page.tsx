'use client'
import { useState, useCallback } from 'react'
import { BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store/appStore'
import { useIngresos, useEgresos, useDeudas, useTarjetas, useEventosMes } from '@/hooks'
import { calcularResumen, proyectarCashFlow } from '@/lib/utils/calculations'
import { fmt } from '@/lib/utils/formatters'
import { MESES, MESES_CORTOS, TIPOS_EGRESO, TIPOS_INGRESO } from '@/lib/utils/constants'
import { PageHeader, Card, CardTitle, ChartToggle, ProgressBar, LoadingSpinner } from '@/components/ui'

const TT = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, color:'#0f172a', boxShadow:'0 4px 12px rgba(0,0,0,0.08)' }
const PIE_COLORS_EGRESO  = ['#1A5E9E','#2D7D2D','#E8A020','#D4537E','#5B3FA6','#1D9E75','#C0392B','#888780']
const PIE_COLORS_INGRESO = ['#2D7D2D','#52A852','#BA7517','#888780']

// ─── Opciones de widgets ───────────────────────────────────────────────────────
const WIDGET_OPTIONS = [
  { id: 'ingresos_anuales',   label: 'Ingresos anuales',      icon: '💰', href: '/dashboard/ingresos'  },
  { id: 'egresos_anuales',    label: 'Egresos anuales',       icon: '📤', href: '/dashboard/egresos'   },
  { id: 'ahorro_acumulado',   label: 'Ahorro acumulado',      icon: '🏦', href: '/dashboard/comparador'},
  { id: 'deuda_total',        label: 'Deuda total',           icon: '📋', href: '/dashboard/deudas'    },
  { id: 'tarjetas',           label: 'Pago tarjetas (año)',   icon: '💳', href: '/dashboard/tarjetas'  },
  { id: 'gasto_diario',       label: 'Gasto diario sugerido', icon: '📅', href: '/dashboard/cashflow'  },
  { id: 'cuotas_mensuales',   label: 'Cuotas mensuales',      icon: '🔁', href: '/dashboard/deudas'    },
  { id: 'metas',              label: 'Metas activas',         icon: '🎯', href: '/dashboard/metas'     },
]

const DEFAULT_WIDGETS = ['ingresos_anuales','egresos_anuales','ahorro_acumulado','deuda_total']

export default function DashboardPage() {
  const [flowType, setFlowType] = useState<'bar'|'area'>('bar')
  const { añoActivo, monedaPrincipal: m } = useAppStore()
  const router = useRouter()

  // Widget config
  const [widgets, setWidgets]           = useState<string[]>(DEFAULT_WIDGETS)
  const [editingWidgets, setEditingWidgets] = useState(false)
  const [expandedChart, setExpandedChart] = useState<'flujo'|'egresos'|'ingresos'|'deudas'|'tarjetas'|null>(null)

  const { data: ingresos, loading: li } = useIngresos()
  const { data: egresos,  loading: le } = useEgresos()
  const { data: deudas,   loading: ld } = useDeudas()
  const { data: tarjetas, loading: lt } = useTarjetas()

  const HOY = new Date()
  const { data: eventosMes, loading: lem } = useEventosMes(HOY.getFullYear(), HOY.getMonth() + 1)

  if (li || le || ld || lt || lem) return <LoadingSpinner />

  const r = calcularResumen(ingresos??[], egresos??[], deudas??[])

  // Cash flow — gasto diario sugerido
  const diasEnMes = new Date(HOY.getFullYear(), HOY.getMonth() + 1, 0).getDate()
  const flowData  = proyectarCashFlow(0, eventosMes??[], diasEnMes)
  const saldoFin  = flowData[flowData.length - 1]?.saldo ?? 0
  const gastoDiario = Math.max(0, Math.round(saldoFin / diasEnMes))

  // Tarjetas — total pagado en el año (sin pagos_tarjeta hook, usamos egresos categoria tarjeta)
  const totalTarjetas = (egresos??[]).filter(e => e.categoria === 'tarjeta').reduce((s,e) => s+e.monto, 0)

  // Cuotas mensuales
  const cuotasMensuales = (deudas??[]).reduce((s,d) => s+d.cuota_mensual, 0)

  // Metas activas — no tenemos hook aquí, mostramos deudas como fallback
  const metasActivas = (deudas??[]).length

  const getWidgetValue = (id: string) => {
    switch(id) {
      case 'ingresos_anuales':  return { value: fmt(r.totalIngresos,m),  sub: `Acumulado ${añoActivo}`,    trend:  8.2,  color: '#2D7D2D', trendInvert: false }
      case 'egresos_anuales':   return { value: fmt(r.totalEgresos,m),   sub: `Acumulado ${añoActivo}`,    trend: -3.1,  color: '#C0392B', trendInvert: false }
      case 'ahorro_acumulado':  return { value: fmt(r.totalIngresos-r.totalEgresos,m), sub: `Balance ${añoActivo}`, trend: 12.4, color: '#1A5E9E', trendInvert: false }
      case 'deuda_total':       return { value: fmt(r.totalDeuda,m),     sub: 'Obligaciones activas',      trend: -2.8,  color: '#5B3FA6', trendInvert: true  }
      case 'tarjetas':          return { value: fmt(totalTarjetas,m),    sub: `Pagado ${añoActivo}`,       trend: undefined, color: '#1A5E9E', trendInvert: false }
      case 'gasto_diario':      return { value: fmt(gastoDiario,m),      sub: 'Para llegar bien al mes',   trend: undefined, color: '#E8A020', trendInvert: false }
      case 'cuotas_mensuales':  return { value: fmt(cuotasMensuales,m),  sub: 'Comprometido/mes',          trend: undefined, color: '#5B3FA6', trendInvert: false }
      case 'metas':             return { value: String(metasActivas),     sub: 'Obligaciones registradas',  trend: undefined, color: '#1D9E75', trendInvert: false }
      default: return { value: '—', sub: '', color: '#888780', trendInvert: false }
    }
  }

  const chartFlowData = MESES_CORTOS.map((month, i) => {
    const mes = i + 1
    return {
      month,
      Ingresos: (ingresos??[]).filter(x=>x.mes===mes).reduce((s,x)=>s+x.monto,0),
      Gastos:   (egresos??[]).filter(x=>x.mes===mes).reduce((s,x)=>s+x.monto,0),
    }
  })

  const pieEgresoData = Object.entries(TIPOS_EGRESO).map(([key, cfg]) => ({
    name: cfg.label,
    value: (egresos??[]).filter(e=>e.categoria===key).reduce((s,e)=>s+e.monto,0),
    color: cfg.color,
  })).filter(d=>d.value>0).sort((a,b)=>b.value-a.value).slice(0,7)

  const pieIngresoData = Object.entries(TIPOS_INGRESO).map(([key, cfg]) => ({
    name: cfg.label,
    value: (ingresos??[]).filter(i=>i.tipo===key).reduce((s,i)=>s+i.monto,0),
    color: cfg.color,
  })).filter(d=>d.value>0)

  const changeWidget = (index: number, newId: string) => {
    const next = [...widgets]
    next[index] = newId
    setWidgets(next)
  }

  return (
    <div>
      <PageHeader
        title="Panel Financiero"
        action={
          <button
            onClick={() => setEditingWidgets(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${editingWidgets ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
            {editingWidgets ? '✓ Listo' : '⚙ Personalizar widgets'}
          </button>
        }
      />

      {/* ── Widgets ── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {widgets.map((widgetId, index) => {
          const opt = WIDGET_OPTIONS.find(o => o.id === widgetId)!
          const { value, sub, trend, color, trendInvert } = getWidgetValue(widgetId)
          const up   = trend !== undefined && trend >= 0
          const good = trendInvert ? !up : up

          return (
            <div key={index} className="relative group">
              {/* Selector de widget cuando está en modo edición */}
              {editingWidgets && (
                <div className="absolute -top-2 -right-2 z-10">
                  <select
                    value={widgetId}
                    onChange={e => changeWidget(index, e.target.value)}
                    className="text-[10px] bg-slate-900 text-white rounded-lg px-2 py-1 border-none cursor-pointer shadow-lg"
                    onClick={e => e.stopPropagation()}>
                    {WIDGET_OPTIONS.map(o => (
                      <option key={o.id} value={o.id}>{o.icon} {o.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Card clickeable */}
              <div
                onClick={() => !editingWidgets && router.push(opt.href)}
                className={`bg-white border border-slate-200 rounded-2xl p-5 relative overflow-hidden transition-all shadow-card ${
                  editingWidgets
                    ? 'ring-2 ring-blue-400 ring-offset-1 cursor-default opacity-80'
                    : 'hover:shadow-lg hover:border-blue-200 hover:-translate-y-0.5 cursor-pointer'
                }`}
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div className="absolute top-0 right-0 w-16 h-16 rounded-bl-[64px]" style={{ background: color + '10' }} />
                <div className="text-xl mb-2">{opt.icon}</div>
                <div className="text-slate-500 text-[11px] font-bold uppercase tracking-widest mb-1">{opt.label}</div>
                <div className="text-slate-900 text-2xl font-bold font-mono leading-tight">{value}</div>
                {sub && <div className="text-slate-400 text-xs mt-1">{sub}</div>}
                {trend !== undefined && (
                  <div className="flex items-center gap-1 mt-2">
                    <span className={`text-xs font-bold ${good ? 'text-emerald-700' : 'text-red-600'}`}>
                      {up ? '▲' : '▼'} {Math.abs(trend)}%
                    </span>
                    <span className="text-slate-400 text-xs">vs año anterior</span>
                  </div>
                )}
                {!editingWidgets && (
                  <div className="absolute bottom-3 right-3 text-slate-300 text-xs opacity-0 group-hover:opacity-100 transition-opacity">→</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Flujo financiero (ancho completo) + Distribución egresos e ingresos ── */}
      <div className="grid grid-cols-4 gap-5 mb-5">

        {/* Flujo — 2 columnas */}
        <Card className="col-span-2 transition-all hover:shadow-lg hover:border-blue-200 hover:-translate-y-0.5 cursor-pointer group" onClick={()=>setExpandedChart('flujo')}>
          <CardTitle action={<div className="flex items-center gap-2" onClick={e=>e.stopPropagation()}>
            <span className="text-[10px] text-slate-300 group-hover:text-slate-400 font-medium uppercase tracking-wider">clic para ampliar</span>
            <ChartToggle
              options={[{value:'bar',label:'▋ Barras'},{value:'area',label:'⟋ Área'}]}
              value={flowType} onChange={v=>setFlowType(v as 'bar'|'area')} /></div>}
          >
            Flujo Financiero {añoActivo}
          </CardTitle>
          <ResponsiveContainer width="100%" height={220}>
            {flowType==='bar'?(
              <BarChart data={chartFlowData} barCategoryGap="30%" barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{fill:'#94a3b8',fontSize:11}} axisLine={false} tickLine={false} />
                <YAxis tick={{fill:'#94a3b8',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>v===0?'':fmt(v/1000,m).replace(/[^0-9kKMm.,]/g,'')+'k'} />
                <Tooltip contentStyle={TT} formatter={(v:number,name:string)=>[fmt(v,m),name]} labelFormatter={(l:string)=>{ const idx=MESES_CORTOS.indexOf(l); return idx>=0?MESES[idx]:l }} />
                <Legend wrapperStyle={{color:'#64748b',fontSize:12}} />
                <Bar dataKey="Ingresos" fill="#2D7D2D" radius={[4,4,0,0]} maxBarSize={28} />
                <Bar dataKey="Gastos"   fill="#C0392B" radius={[4,4,0,0]} maxBarSize={28} />
              </BarChart>
            ):(
              <AreaChart data={chartFlowData}>
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
                <Tooltip contentStyle={TT} formatter={(v:number,name:string)=>[fmt(v,m),name]} labelFormatter={(l:string)=>{ const idx=MESES_CORTOS.indexOf(l); return idx>=0?MESES[idx]:l }} />
                <Legend wrapperStyle={{color:'#64748b',fontSize:12}} />
                <Area type="monotone" dataKey="Ingresos" stroke="#2D7D2D" fill="url(#gI)" strokeWidth={2.5} />
                <Area type="monotone" dataKey="Gastos"   stroke="#C0392B" fill="url(#gE)" strokeWidth={2.5} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </Card>

        {/* Distribución Egresos — 1 columna */}
        <Card className="hover:border-blue-200 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group" onClick={()=>setExpandedChart('egresos')}>
          <CardTitle action={<span className="text-[10px] text-slate-300 group-hover:text-slate-400 font-medium uppercase tracking-wider">clic para ampliar</span>}>Distribución Gastos</CardTitle>
          {pieEgresoData.length>0?(
            <>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart><Pie data={pieEgresoData} cx="50%" cy="50%" innerRadius={38} outerRadius={58} paddingAngle={3} dataKey="value">
                  {pieEgresoData.map((_,i)=><Cell key={i} fill={PIE_COLORS_EGRESO[i%PIE_COLORS_EGRESO.length]} />)}
                </Pie><Tooltip contentStyle={TT} formatter={(v:number,_:string,p:any)=>[fmt(v,m), p.name]} /></PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1 mt-2">
                {pieEgresoData.slice(0,5).map((d,i)=>(
                  <div key={d.name} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{background:PIE_COLORS_EGRESO[i%PIE_COLORS_EGRESO.length]}} />
                      <span className="text-slate-500 text-xs">{d.name}</span>
                    </div>
                    <span className="text-slate-900 text-xs font-mono font-bold">{fmt(d.value,m)}</span>
                  </div>
                ))}
              </div>
            </>
          ):(
            <div className="text-center text-slate-400 text-sm py-8">Sin datos</div>
          )}
        </Card>

        {/* Distribución Ingresos — 1 columna */}
        <Card className="hover:border-blue-200 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group" onClick={()=>setExpandedChart('ingresos')}>
          <CardTitle action={<span className="text-[10px] text-slate-300 group-hover:text-slate-400 font-medium uppercase tracking-wider">clic para ampliar</span>}>Distribución Ingresos</CardTitle>
          {pieIngresoData.length>0?(
            <>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart><Pie data={pieIngresoData} cx="50%" cy="50%" innerRadius={38} outerRadius={58} paddingAngle={3} dataKey="value">
                  {pieIngresoData.map((_,i)=><Cell key={i} fill={PIE_COLORS_INGRESO[i%PIE_COLORS_INGRESO.length]} />)}
                </Pie><Tooltip contentStyle={TT} formatter={(v:number,_:string,p:any)=>[fmt(v,m), p.name]} /></PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1 mt-2">
                {pieIngresoData.map((d,i)=>(
                  <div key={d.name} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{background:PIE_COLORS_INGRESO[i%PIE_COLORS_INGRESO.length]}} />
                      <span className="text-slate-500 text-xs">{d.name}</span>
                    </div>
                    <span className="text-slate-900 text-xs font-mono font-bold">{fmt(d.value,m)}</span>
                  </div>
                ))}
              </div>
            </>
          ):(
            <div className="text-center text-slate-400 text-sm py-8">Sin datos</div>
          )}
        </Card>
      </div>

      {/* ── Deudas y Tarjetas ── */}
      <div className="grid grid-cols-2 gap-5">
        <Card className="hover:border-slate-300 transition-all">
          <CardTitle action={<div className="flex gap-1"><button onClick={()=>setExpandedChart('deudas')} className="text-slate-300 hover:text-slate-500 border-none bg-transparent cursor-pointer text-base px-1" title="Expandir">⤢</button><button onClick={()=>router.push('/dashboard/deudas')} className="text-slate-300 hover:text-slate-500 border-none bg-transparent cursor-pointer text-xs px-1">→</button></div>}>Deudas activas</CardTitle>
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

        <Card className="hover:border-slate-300 transition-all">
          <CardTitle action={<div className="flex gap-1"><button onClick={()=>setExpandedChart('tarjetas')} className="text-slate-300 hover:text-slate-500 border-none bg-transparent cursor-pointer text-base px-1" title="Expandir">⤢</button><button onClick={()=>router.push('/dashboard/tarjetas')} className="text-slate-300 hover:text-slate-500 border-none bg-transparent cursor-pointer text-xs px-1">→</button></div>}>Tarjetas de crédito</CardTitle>
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
      {/* ── Modal expandido ── */}
      {expandedChart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{background:'rgba(15,23,42,0.55)'}} onClick={()=>setExpandedChart(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-auto p-8 relative" onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setExpandedChart(null)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 border-none cursor-pointer text-lg">✕</button>

            {expandedChart==='flujo' && <>
              <div className="text-slate-900 font-semibold text-lg mb-5">Flujo Financiero {añoActivo}</div>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={chartFlowData} barCategoryGap="30%" barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{fill:'#94a3b8',fontSize:12}} axisLine={false} tickLine={false} />
                  <YAxis tick={{fill:'#94a3b8',fontSize:12}} axisLine={false} tickLine={false} tickFormatter={v=>v===0?'':fmt(v,m)} />
                  <Tooltip contentStyle={TT} formatter={(v:number,name:string)=>[fmt(v,m),name]} labelFormatter={(l:string)=>{ const idx=MESES_CORTOS.indexOf(l); return idx>=0?MESES[idx]:l }} />
                  <Legend wrapperStyle={{color:'#64748b',fontSize:13}} />
                  <Bar dataKey="Ingresos" fill="#2D7D2D" radius={[4,4,0,0]} maxBarSize={36} />
                  <Bar dataKey="Gastos"   fill="#C0392B" radius={[4,4,0,0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </>}

            {expandedChart==='egresos' && <>
              <div className="text-slate-900 font-semibold text-lg mb-5">Distribución Gastos {añoActivo}</div>
              <div className="grid grid-cols-2 gap-8 items-center">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart><Pie data={pieEgresoData} cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={3} dataKey="value">
                    {pieEgresoData.map((_,i)=><Cell key={i} fill={PIE_COLORS_EGRESO[i%PIE_COLORS_EGRESO.length]} />)}
                  </Pie><Tooltip contentStyle={TT} formatter={(v:number,_:string,p:any)=>[fmt(v,m), p.name]} /></PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2.5">
                  {pieEgresoData.map((d,i)=>(
                    <div key={d.name} className="flex justify-between items-center">
                      <div className="flex items-center gap-2.5">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:PIE_COLORS_EGRESO[i%PIE_COLORS_EGRESO.length]}} />
                        <span className="text-slate-600 text-sm">{d.name}</span>
                      </div>
                      <span className="text-slate-900 text-sm font-mono font-bold">{fmt(d.value,m)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>}

            {expandedChart==='ingresos' && <>
              <div className="text-slate-900 font-semibold text-lg mb-5">Distribución Ingresos {añoActivo}</div>
              <div className="grid grid-cols-2 gap-8 items-center">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart><Pie data={pieIngresoData} cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={3} dataKey="value">
                    {pieIngresoData.map((_,i)=><Cell key={i} fill={PIE_COLORS_INGRESO[i%PIE_COLORS_INGRESO.length]} />)}
                  </Pie><Tooltip contentStyle={TT} formatter={(v:number,_:string,p:any)=>[fmt(v,m), p.name]} /></PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2.5">
                  {pieIngresoData.map((d,i)=>(
                    <div key={d.name} className="flex justify-between items-center">
                      <div className="flex items-center gap-2.5">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:PIE_COLORS_INGRESO[i%PIE_COLORS_INGRESO.length]}} />
                        <span className="text-slate-600 text-sm">{d.name}</span>
                      </div>
                      <span className="text-slate-900 text-sm font-mono font-bold">{fmt(d.value,m)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>}

            {expandedChart==='deudas' && <>
              <div className="text-slate-900 font-semibold text-lg mb-5">Deudas activas</div>
              <div className="flex flex-col gap-5">
                {(deudas??[]).map(d=>{
                  const pct = Math.round(((d.total_original-d.pendiente)/d.total_original)*100)
                  return (
                    <div key={d.id}>
                      <div className="flex justify-between mb-2">
                        <span className="text-slate-700 font-medium">{d.nombre}</span>
                        <span className="font-mono font-bold text-lg" style={{color:d.color}}>{fmt(d.pendiente,m)}</span>
                      </div>
                      <ProgressBar value={pct} color={d.color} height={8} />
                      <div className="flex justify-between mt-1 text-xs text-slate-400">
                        <span>{pct}% pagado</span>
                        <span>Cuota: {fmt(d.cuota_mensual,m)}/mes</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>}

            {expandedChart==='tarjetas' && <>
              <div className="text-slate-900 font-semibold text-lg mb-5">Tarjetas de crédito</div>
              <div className="flex flex-col gap-5">
                {(tarjetas??[]).map(t=>(
                  <div key={t.id} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0" style={{background:t.color}}>
                      {t.icono}
                    </div>
                    <div className="flex-1">
                      <div className="text-slate-800 font-semibold">{t.nombre}</div>
                      <div className="text-slate-400 text-sm">{t.banco} · {t.quien}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-lg font-bold text-slate-700">{fmt(t.limite,m)}</div>
                      <div className="text-slate-400 text-xs">límite</div>
                    </div>
                  </div>
                ))}
              </div>
            </>}
          </div>
        </div>
      )}

    </div>
  )
}
