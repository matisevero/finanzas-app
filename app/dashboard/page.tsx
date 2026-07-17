'use client'
import { useState, useCallback, useEffect } from 'react'
import { BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store/appStore'
import { useIngresos, useEgresos, useDeudas, useTarjetas, useEventosMes, useEventosAño, usePagosTarjeta } from '@/hooks'
import { calcularResumen, proyectarCashFlow } from '@/lib/utils/calculations'
import { fmt, fmtFull } from '@/lib/utils/formatters'
import { MESES, MESES_CORTOS, TIPOS_EGRESO, TIPOS_INGRESO } from '@/lib/utils/constants'
import { PageHeader, Card, CardTitle, ChartToggle, ProgressBar, LoadingSpinner } from '@/components/ui'

const TT = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, color:'#0f172a', boxShadow:'0 4px 12px rgba(0,0,0,0.08)' }
const PIE_COLORS_EGRESO  = ['#1A5E9E','#40B046','#E8A020','#D4537E','#5B3FA6','#1D9E75','#F54927','#888780']
const PIE_COLORS_INGRESO = ['#40B046','#52A852','#BA7517','#888780']

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
  const { añoActivo, vistaTipo, mesActivo, monedaPrincipal: m } = useAppStore()
  const esMensual = vistaTipo === 'mensual'
  const router = useRouter()

  // Widget config
  const [widgets, setWidgets]           = useState<string[]>(DEFAULT_WIDGETS)
  const [editingWidgets, setEditingWidgets] = useState(false)
  const [ahorroIdx, setAhorroIdx] = useState(0)
  const [deudaMonedaIdx, setDeudaMonedaIdx] = useState(0)
  const [expandedChart, setExpandedChart] = useState<'flujo'|'egresos'|'ingresos'|'deudas'|'tarjetas'|null>(null)

  useEffect(() => {
    if (!expandedChart) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedChart(null) }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [expandedChart])

  const { data: ingresos, loading: li } = useIngresos()
  const { data: egresos,  loading: le } = useEgresos()
  const { data: deudas,   loading: ld } = useDeudas()
  const { data: tarjetas, loading: lt } = useTarjetas()
  const monedasAhorro = useAppStore(s => s.monedasAhorro)
  const { data: pagosTC,  loading: lp } = usePagosTarjeta()

  const HOY = new Date()
  const { data: eventosMes, loading: lem } = useEventosMes(HOY.getFullYear(), HOY.getMonth() + 1)

  // Eventos del mes que se está viendo (para el desglose día a día en vista Mes)
  const { data: eventosMesVista, loading: lemv } = useEventosMes(añoActivo, mesActivo)

  // Eventos de todo el año activo (para "Vencimientos" en vista Año)
  const { data: eventosAño, loading: lea } = useEventosAño(añoActivo)

  if (li || le || ld || lt || lem || lemv || lea || lp) return <LoadingSpinner />

  const r = calcularResumen(ingresos??[], egresos??[], deudas??[])

  // "Ahorro / Inversiones" por moneda: cuenta ítems con etiqueta "ahorro"/"inversión",
  // o ya categorizados como Inversiones USD (tipo/categoria === 'usd'), dentro del año activo.
  const esAhorroOInversion = (etiqueta?: string|null, tipoOCategoria?: string) =>
    (!!etiqueta && /ahorro|inversi/i.test(etiqueta)) || tipoOCategoria === 'usd'

  const monedasConAhorro = Array.from(new Set([
    ...(ingresos??[]).filter(i => esAhorroOInversion(i.etiqueta, i.tipo)).map(i => i.moneda),
    ...(egresos??[]).filter(e => esAhorroOInversion(e.etiqueta, e.categoria)).map(e => e.moneda),
    ...monedasAhorro,
  ]))

  const ahorroPorMoneda = monedasConAhorro.map(mon => {
    const ing = (ingresos??[]).filter(i => i.moneda === mon && esAhorroOInversion(i.etiqueta, i.tipo)).reduce((s,i)=>s+i.monto,0)
    const egr = (egresos??[]).filter(e => e.moneda === mon && esAhorroOInversion(e.etiqueta, e.categoria)).reduce((s,e)=>s+e.monto,0)
    return { moneda: mon, monto: ing - egr }
  })

  // Deudas por moneda: agrupa el saldo pendiente real de cada deuda por su moneda.
  const monedasConDeuda = Array.from(new Set((deudas??[]).map(d => d.moneda)))
  const deudaPorMoneda = monedasConDeuda.map(mon => ({
    moneda: mon,
    monto: (deudas??[]).filter(d => d.moneda === mon).reduce((s,d)=>s+d.pendiente,0),
  }))

  // Cash flow — gasto diario sugerido (siempre sobre el mes calendario real, es una sugerencia hacia adelante)
  const diasEnMes = new Date(HOY.getFullYear(), HOY.getMonth() + 1, 0).getDate()
  const flowData  = proyectarCashFlow(0, eventosMes??[], diasEnMes)
  const saldoFin  = flowData[flowData.length - 1]?.saldo ?? 0
  const gastoDiario = Math.max(0, Math.round(saldoFin / diasEnMes))

  // Ingresos/egresos del mes seleccionado (para vista Mes)
  const ingresosMes = (ingresos??[]).filter(x => x.mes === mesActivo)
  const egresosMes  = (egresos??[]).filter(x => x.mes === mesActivo)
  const totalIngresosMes = ingresosMes.reduce((s,x) => s+x.monto, 0)
  const totalEgresosMes  = egresosMes.reduce((s,x) => s+x.monto, 0)

  // Tarjetas — total pagado en el año o en el mes, según la vista (sin pagos_tarjeta hook, usamos egresos categoria tarjeta)
  const totalTarjetas    = (egresos??[]).filter(e => e.categoria === 'tarjeta').reduce((s,e) => s+e.monto, 0)
  const totalTarjetasMes = egresosMes.filter(e => e.categoria === 'tarjeta').reduce((s,e) => s+e.monto, 0)

  // Desglose día a día del mes seleccionado
  const diasEnMesVista = new Date(añoActivo, mesActivo, 0).getDate()
  const flowDataVista  = proyectarCashFlow(0, eventosMesVista??[], diasEnMesVista)

  // Cuotas mensuales
  const cuotasMensuales = (deudas??[]).reduce((s,d) => s+d.cuota_mensual, 0)

  // Metas activas — no tenemos hook aquí, mostramos deudas como fallback
  const metasActivas = (deudas??[]).length

  const periodoLabel = esMensual ? `${MESES[mesActivo-1]} ${añoActivo}` : `${añoActivo}`

  // Vencimientos: en vista Mes, los del mes que se está viendo; en vista Año, todos los pendientes del año.
  const eventosVencimientos = esMensual ? (eventosMesVista ?? []) : (eventosAño ?? [])
  const vencimientosTitulo  = esMensual ? `Vencimientos de ${MESES[mesActivo-1].toLowerCase()}` : `Vencimientos pendientes ${añoActivo}`

  // Acumulado del año por tarjeta + % sobre los ingresos del año, para la card de Tarjetas de crédito
  const acumuladoPorTC = (tarjetas ?? []).reduce((acc, t) => {
    acc[t.id] = (pagosTC ?? []).filter(p => p.tarjeta_id === t.id && p.año === añoActivo).reduce((s, p) => s + p.monto, 0)
    return acc
  }, {} as Record<string, number>)

  const getWidgetValue = (id: string) => {
    switch(id) {
      case 'ingresos_anuales':  return { value: fmt(esMensual?totalIngresosMes:r.totalIngresos,m),  sub: `Acumulado ${periodoLabel}`,    trend:  8.2,  color: '#40B046', trendInvert: false }
      case 'egresos_anuales':   return { value: fmt(esMensual?totalEgresosMes:r.totalEgresos,m),   sub: `Acumulado ${periodoLabel}`,    trend: -3.1,  color: '#F54927', trendInvert: false }
      case 'ahorro_acumulado':  return { value: fmt(esMensual?(totalIngresosMes-totalEgresosMes):(r.totalIngresos-r.totalEgresos),m), sub: `Balance ${periodoLabel}`, trend: 12.4, color: '#1A5E9E', trendInvert: false }
      case 'deuda_total':       return { value: fmt(r.totalDeuda,m),     sub: 'Obligaciones activas',      trend: -2.8,  color: '#5B3FA6', trendInvert: true  }
      case 'tarjetas':          return { value: fmt(esMensual?totalTarjetasMes:totalTarjetas,m),    sub: `Pagado ${periodoLabel}`,       trend: undefined, color: '#1A5E9E', trendInvert: false }
      case 'gasto_diario':      return { value: fmt(gastoDiario,m),      sub: 'Para llegar bien al mes',   trend: undefined, color: '#E8A020', trendInvert: false }
      case 'cuotas_mensuales':  return { value: fmt(cuotasMensuales,m),  sub: 'Comprometido/mes',          trend: undefined, color: '#5B3FA6', trendInvert: false }
      case 'metas':             return { value: String(metasActivas),     sub: 'Obligaciones registradas',  trend: undefined, color: '#1D9E75', trendInvert: false }
      default: return { value: '—', sub: '', color: '#888780', trendInvert: false }
    }
  }

  const widgetLabel = (id: string, label: string) => {
    if (!esMensual) return label
    if (id === 'ingresos_anuales' || id === 'egresos_anuales') return label.replace('anuales', 'del mes')
    if (id === 'tarjetas') return label.replace('(año)', '(mes)')
    return label
  }

  const chartFlowDataAnual = MESES_CORTOS.map((month, i) => {
    const mes = i + 1
    return {
      month,
      Ingresos: (ingresos??[]).filter(x=>x.mes===mes).reduce((s,x)=>s+x.monto,0),
      Gastos:   (egresos??[]).filter(x=>x.mes===mes).reduce((s,x)=>s+x.monto,0),
    }
  })

  const chartFlowDataMensual = flowDataVista.map(d => ({
    month: String(d.dia),
    Ingresos: d.entradas,
    Gastos: d.salidas,
  }))

  const chartFlowData = esMensual ? chartFlowDataMensual : chartFlowDataAnual
  const flujoTitulo = esMensual ? `Flujo Financiero ${periodoLabel}` : `Flujo Financiero ${añoActivo}`
  const flujoLabelFormatter = esMensual
    ? (l: string) => `Día ${l}`
    : (l: string) => { const idx=MESES_CORTOS.indexOf(l); return idx>=0?MESES[idx]:l }

  const pieEgresoData = Object.entries(TIPOS_EGRESO).map(([key, cfg]) => ({
    name: cfg.label,
    value: (esMensual?egresosMes:(egresos??[])).filter(e=>e.categoria===key).reduce((s,e)=>s+e.monto,0),
    color: cfg.color,
  })).filter(d=>d.value>0).sort((a,b)=>b.value-a.value).slice(0,7)

  const pieIngresoData = Object.entries(TIPOS_INGRESO).map(([key, cfg]) => ({
    name: cfg.label,
    value: (esMensual?ingresosMes:(ingresos??[])).filter(i=>i.tipo===key).reduce((s,i)=>s+i.monto,0),
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
                <div className="text-slate-500 text-[11px] font-bold uppercase tracking-widest mb-1">{widgetLabel(widgetId, opt.label)}</div>
                <div className="text-slate-900 text-2xl font-bold font-mono leading-tight">{value}</div>
                {sub && <div className="text-slate-400 text-xs mt-1">{sub}</div>}
                {trend !== undefined && (
                  <div className="flex items-center gap-1 mt-2">
                    <span className={`text-xs font-bold ${good ? 'text-emerald-700' : 'text-red-600'}`}>
                      {up ? '▲' : '▼'} {Math.abs(trend)}%
                    </span>
                    <span className="text-slate-400 text-xs">{esMensual ? 'vs mes anterior' : 'vs año anterior'}</span>
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
          <CardTitle action={<div onClick={e=>e.stopPropagation()}><ChartToggle options={[{value:'bar',label:'▋ Barras'},{value:'area',label:'⟋ Área'}]} value={flowType} onChange={v=>setFlowType(v as 'bar'|'area')} /></div>}
          >
            {flujoTitulo}
          </CardTitle>
          <ResponsiveContainer width="100%" height={220}>
            {flowType==='bar'?(
              <BarChart data={chartFlowData} barCategoryGap="30%" barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{fill:'#94a3b8',fontSize:11}} axisLine={false} tickLine={false} interval={esMensual?4:0} />
                <YAxis tick={{fill:'#94a3b8',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>v===0?'':fmt(v/1000,m).replace(/[^0-9kKMm.,]/g,'')+'k'} />
                <Tooltip contentStyle={TT} formatter={(v:number,name:string)=>[fmt(v,m),name]} labelFormatter={flujoLabelFormatter} />
                <Legend wrapperStyle={{color:'#64748b',fontSize:12}} />
                <Bar dataKey="Ingresos" fill="#40B046" radius={0} maxBarSize={28} />
                <Bar dataKey="Gastos"   fill="#F54927" radius={0} maxBarSize={28} />
              </BarChart>
            ):(
              <AreaChart data={chartFlowData}>
                <defs>
                  <linearGradient id="gI" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#40B046" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#40B046" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#F54927" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#F54927" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{fill:'#94a3b8',fontSize:11}} axisLine={false} tickLine={false} interval={esMensual?4:0} />
                <YAxis tick={{fill:'#94a3b8',fontSize:11}} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TT} formatter={(v:number,name:string)=>[fmt(v,m),name]} labelFormatter={flujoLabelFormatter} />
                <Legend wrapperStyle={{color:'#64748b',fontSize:12}} />
                <Area type="monotone" dataKey="Ingresos" stroke="#40B046" fill="url(#gI)" strokeWidth={2.5} />
                <Area type="monotone" dataKey="Gastos"   stroke="#F54927" fill="url(#gE)" strokeWidth={2.5} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </Card>

        {/* Distribución Egresos — 1 columna */}
        <Card className="hover:border-blue-200 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group" onClick={()=>setExpandedChart('egresos')}>
          <CardTitle>Distribución Gastos{esMensual ? ` · ${MESES_CORTOS[mesActivo-1]}` : ''}</CardTitle>
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
          <CardTitle>Distribución Ingresos{esMensual ? ` · ${MESES_CORTOS[mesActivo-1]}` : ''}</CardTitle>
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
        <Card className="hover:border-slate-300 transition-all cursor-pointer" onClick={()=>router.push('/dashboard/deudas')}>
          <CardTitle action={<span className="text-slate-300 text-xs">→</span>}>{vencimientosTitulo}</CardTitle>
          {eventosVencimientos.filter(e=>e.tipo!=='ingreso'&&!e.pagado&&e.monto).length===0?(
            <div className="text-slate-400 text-sm text-center py-4">Sin vencimientos pendientes 🎉</div>
          ):eventosVencimientos.filter(e=>e.tipo!=='ingreso'&&!e.pagado&&e.monto).sort((a,b)=>(a.mes*100+a.dia)-(b.mes*100+b.dia)).slice(0,6).map(ev=>(
            <div key={ev.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex flex-col items-center justify-center flex-shrink-0 leading-none">
                  <span className="text-[9px] font-semibold text-slate-400">{MESES_CORTOS[ev.mes-1]?.toUpperCase()}</span>
                  <span className="text-xs font-bold text-slate-600">{ev.dia}</span>
                </div>
                <span className="text-slate-700 text-sm truncate max-w-[160px]">{ev.descripcion}</span>
              </div>
              <span className="font-mono text-sm font-bold text-red-500 flex-shrink-0">{fmt(ev.monto??0,m)}</span>
            </div>
          ))}
        </Card>

        <Card className="hover:border-slate-300 transition-all">
          <CardTitle action={<div className="flex gap-1"><button onClick={()=>setExpandedChart('tarjetas')} className="text-slate-300 hover:text-slate-500 border-none bg-transparent cursor-pointer text-base px-1" title="Expandir">⤢</button><button onClick={()=>router.push('/dashboard/tarjetas')} className="text-slate-300 hover:text-slate-500 border-none bg-transparent cursor-pointer text-xs px-1">→</button></div>}>Tarjetas de crédito</CardTitle>
          {(tarjetas??[]).length===0?(
            <div className="text-slate-400 text-sm text-center py-4">Sin tarjetas registradas</div>
          ):(tarjetas??[]).map(t=>{
            const acumulado = acumuladoPorTC[t.id] ?? 0
            const pct = r.totalIngresos > 0 ? Math.round(acumulado / r.totalIngresos * 100) : 0
            return (
            <div key={t.id} className="mb-4 last:mb-0">
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
                  <div className="font-mono text-sm font-bold text-slate-600">{fmt(acumulado,m)}</div>
                  <div className="text-slate-400 text-xs">acumulado {añoActivo}</div>
                </div>
              </div>
              <ProgressBar value={pct} color={t.color} height={6} />
              <div className="text-slate-400 text-[11px] mt-1">{pct}% de tus ingresos del año</div>
            </div>
          )})}
        </Card>
      </div>

      {/* ── Ahorro / Inversiones y Deudas por moneda ── */}
      <div className="grid grid-cols-2 gap-5">
        <Card>
          <CardTitle>Ahorro e inversiones</CardTitle>
          {ahorroPorMoneda.length === 0 ? (
            <div className="text-slate-400 text-sm text-center py-6">
              Etiquetá un ingreso o egreso con "Ahorro" o "Inversión" para que aparezca acá.
            </div>
          ) : (() => {
            const idx = Math.min(ahorroIdx, ahorroPorMoneda.length - 1)
            const actual = ahorroPorMoneda[idx]
            return (
              <>
                <div className="flex items-center justify-between">
                  <button onClick={() => setAhorroIdx(i => (i - 1 + ahorroPorMoneda.length) % ahorroPorMoneda.length)}
                    disabled={ahorroPorMoneda.length < 2}
                    className="text-slate-300 hover:text-slate-600 border-none bg-transparent cursor-pointer text-lg px-1 disabled:opacity-0">‹</button>
                  <div className="text-center flex-1">
                    <div className="text-slate-400 text-xs font-semibold mb-1">{actual.moneda}</div>
                    <div className={`text-2xl font-bold font-mono ${actual.monto >= 0 ? 'text-emerald-700' : 'text-red-500'}`}>{fmtFull(actual.monto, actual.moneda)}</div>
                  </div>
                  <button onClick={() => setAhorroIdx(i => (i + 1) % ahorroPorMoneda.length)}
                    disabled={ahorroPorMoneda.length < 2}
                    className="text-slate-300 hover:text-slate-600 border-none bg-transparent cursor-pointer text-lg px-1 disabled:opacity-0">›</button>
                </div>
                {ahorroPorMoneda.length > 1 && (
                  <div className="flex justify-center gap-1.5 mt-3">
                    {ahorroPorMoneda.map((_, i) => (
                      <button key={i} onClick={() => setAhorroIdx(i)}
                        className={`w-1.5 h-1.5 rounded-full border-none cursor-pointer p-0 ${i === idx ? 'bg-slate-800' : 'bg-slate-200'}`} />
                    ))}
                  </div>
                )}
              </>
            )
          })()}
        </Card>

        <Card>
          <CardTitle>Deudas por moneda</CardTitle>
          {deudaPorMoneda.length === 0 ? (
            <div className="text-slate-400 text-sm text-center py-6">Sin deudas registradas.</div>
          ) : (() => {
            const idx = Math.min(deudaMonedaIdx, deudaPorMoneda.length - 1)
            const actual = deudaPorMoneda[idx]
            return (
              <>
                <div className="flex items-center justify-between">
                  <button onClick={() => setDeudaMonedaIdx(i => (i - 1 + deudaPorMoneda.length) % deudaPorMoneda.length)}
                    disabled={deudaPorMoneda.length < 2}
                    className="text-slate-300 hover:text-slate-600 border-none bg-transparent cursor-pointer text-lg px-1 disabled:opacity-0">‹</button>
                  <div className="text-center flex-1">
                    <div className="text-slate-400 text-xs font-semibold mb-1">{actual.moneda}</div>
                    <div className="text-2xl font-bold font-mono text-red-500">{fmtFull(actual.monto, actual.moneda)}</div>
                  </div>
                  <button onClick={() => setDeudaMonedaIdx(i => (i + 1) % deudaPorMoneda.length)}
                    disabled={deudaPorMoneda.length < 2}
                    className="text-slate-300 hover:text-slate-600 border-none bg-transparent cursor-pointer text-lg px-1 disabled:opacity-0">›</button>
                </div>
                {deudaPorMoneda.length > 1 && (
                  <div className="flex justify-center gap-1.5 mt-3">
                    {deudaPorMoneda.map((_, i) => (
                      <button key={i} onClick={() => setDeudaMonedaIdx(i)}
                        className={`w-1.5 h-1.5 rounded-full border-none cursor-pointer p-0 ${i === idx ? 'bg-slate-800' : 'bg-slate-200'}`} />
                    ))}
                  </div>
                )}
              </>
            )
          })()}
        </Card>
      </div>

      {/* ── Modal expandido ── */}
      {expandedChart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{background:'rgba(15,23,42,0.55)'}} onClick={()=>setExpandedChart(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-auto p-8 relative" onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setExpandedChart(null)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 border-none cursor-pointer text-lg">✕</button>

            {expandedChart==='flujo' && <>
              <div className="text-slate-900 font-semibold text-lg mb-5">{flujoTitulo}</div>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={chartFlowData} barCategoryGap="30%" barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{fill:'#94a3b8',fontSize:12}} axisLine={false} tickLine={false} interval={esMensual?2:0} />
                  <YAxis tick={{fill:'#94a3b8',fontSize:12}} axisLine={false} tickLine={false} tickFormatter={v=>v===0?'':fmtFull(v,m)} />
                  <Tooltip contentStyle={TT} formatter={(v:number,name:string)=>[fmtFull(v,m),name]} labelFormatter={flujoLabelFormatter} />
                  <Legend wrapperStyle={{color:'#64748b',fontSize:13}} />
                  <Bar dataKey="Ingresos" fill="#40B046" radius={0} maxBarSize={36} />
                  <Bar dataKey="Gastos"   fill="#F54927" radius={0} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </>}

            {expandedChart==='egresos' && <>
              <div className="text-slate-900 font-semibold text-lg mb-5">Distribución Gastos {periodoLabel}</div>
              <div className="grid grid-cols-2 gap-8 items-center">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart><Pie data={pieEgresoData} cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={3} dataKey="value">
                    {pieEgresoData.map((_,i)=><Cell key={i} fill={PIE_COLORS_EGRESO[i%PIE_COLORS_EGRESO.length]} />)}
                  </Pie><Tooltip contentStyle={TT} formatter={(v:number,_:string,p:any)=>[fmtFull(v,m), p.name]} /></PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2.5">
                  {pieEgresoData.map((d,i)=>(
                    <div key={d.name} className="flex justify-between items-center">
                      <div className="flex items-center gap-2.5">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:PIE_COLORS_EGRESO[i%PIE_COLORS_EGRESO.length]}} />
                        <span className="text-slate-600 text-sm">{d.name}</span>
                      </div>
                      <span className="text-slate-900 text-sm font-mono font-bold">{fmtFull(d.value,m)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>}

            {expandedChart==='ingresos' && <>
              <div className="text-slate-900 font-semibold text-lg mb-5">Distribución Ingresos {periodoLabel}</div>
              <div className="grid grid-cols-2 gap-8 items-center">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart><Pie data={pieIngresoData} cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={3} dataKey="value">
                    {pieIngresoData.map((_,i)=><Cell key={i} fill={PIE_COLORS_INGRESO[i%PIE_COLORS_INGRESO.length]} />)}
                  </Pie><Tooltip contentStyle={TT} formatter={(v:number,_:string,p:any)=>[fmtFull(v,m), p.name]} /></PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2.5">
                  {pieIngresoData.map((d,i)=>(
                    <div key={d.name} className="flex justify-between items-center">
                      <div className="flex items-center gap-2.5">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:PIE_COLORS_INGRESO[i%PIE_COLORS_INGRESO.length]}} />
                        <span className="text-slate-600 text-sm">{d.name}</span>
                      </div>
                      <span className="text-slate-900 text-sm font-mono font-bold">{fmtFull(d.value,m)}</span>
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
                        <span className="font-mono font-bold text-lg" style={{color:d.color}}>{fmtFull(d.pendiente,m)}</span>
                      </div>
                      <ProgressBar value={pct} color={d.color} height={8} />
                      <div className="flex justify-between mt-1 text-xs text-slate-400">
                        <span>{pct}% pagado</span>
                        <span>Cuota: {fmtFull(d.cuota_mensual,m)}/mes</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>}

            {expandedChart==='tarjetas' && <>
              <div className="text-slate-900 font-semibold text-lg mb-5">Tarjetas de crédito — acumulado {añoActivo}</div>
              <div className="flex flex-col gap-5">
                {(tarjetas??[]).map(t=>{
                  const acumulado = acumuladoPorTC[t.id] ?? 0
                  const pct = r.totalIngresos > 0 ? Math.round(acumulado / r.totalIngresos * 100) : 0
                  return (
                  <div key={t.id} className="p-4 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0" style={{background:t.color}}>
                        {t.icono}
                      </div>
                      <div className="flex-1">
                        <div className="text-slate-800 font-semibold">{t.nombre}</div>
                        <div className="text-slate-400 text-sm">{t.banco} · {t.quien}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-lg font-bold text-slate-700">{fmtFull(acumulado,m)}</div>
                        <div className="text-slate-400 text-xs">acumulado {añoActivo}</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <ProgressBar value={pct} color={t.color} height={8} />
                      <div className="text-slate-400 text-xs mt-1">{pct}% de tus ingresos del año</div>
                    </div>
                  </div>
                )})}
              </div>
            </>}
          </div>
        </div>
      )}

    </div>
  )
}
