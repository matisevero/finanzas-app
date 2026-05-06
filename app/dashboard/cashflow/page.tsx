'use client'
import { useState, useMemo } from 'react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useAppStore } from '@/store/appStore'
import { useEventosMes, useSaldoInicial } from '@/hooks'
import { upsertSaldoInicial } from '@/lib/queries'
import { fmt } from '@/lib/utils/formatters'
import { MESES } from '@/lib/utils/constants'
import { PageHeader, Card, CardTitle, LoadingSpinner } from '@/components/ui'
import { proyectarCashFlow } from '@/lib/utils/calculations'

const TT = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, color:'#0f172a' }
const HOY = new Date()

export default function CashFlowPage() {
  const { monedaPrincipal: m } = useAppStore()
  const [mes,  setMes]  = useState(HOY.getMonth())
  const [año,  setAño]  = useState(HOY.getFullYear())
  const [editSaldo, setEditSaldo] = useState(false)
  const [saldoInput, setSaldoInput] = useState('')

  const { data: eventos, loading: le } = useEventosMes(año, mes+1)
  const { data: saldoDB, loading: ls, refetch: refSaldo } = useSaldoInicial(año, mes+1)

  const saldoInicial = saldoDB?.monto ?? 0
  const diasEnMes    = new Date(año, mes+1, 0).getDate()

  const flowData = useMemo(() =>
    proyectarCashFlow(saldoInicial, eventos??[], diasEnMes)
  , [saldoInicial, eventos, diasEnMes])

  const saveSaldo = async () => {
    const val = parseFloat(saldoInput)
    if (isNaN(val)) return
    await upsertSaldoInicial(año, mes+1, val)
    refSaldo(); setEditSaldo(false)
  }

  const navMes = (dir:number) => {
    let m2=mes+dir, a2=año
    if (m2<0){m2=11;a2--} else if(m2>11){m2=0;a2++}
    setMes(m2); setAño(a2)
  }

  const saldoFin   = flowData[flowData.length-1]?.saldo ?? 0
  const minDia     = flowData.reduce((a,b)=>a.saldo<b.saldo?a:b, flowData[0] ?? {saldo:0,dia:0})
  const dispDia    = Math.max(0, Math.round(saldoFin / diasEnMes))
  const diasConEvs = flowData.filter(d=>d.eventos.length>0)

  if (le||ls) return <LoadingSpinner />

  return (
    <div>
      <PageHeader
        title="Cash Flow Diario"
        subtitle="Tu disponibilidad día a día — cuándo conviene gastar"
        action={
          <div className="flex items-center gap-2">
            <button onClick={()=>navMes(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 bg-white cursor-pointer">‹</button>
            <span className="font-semibold text-slate-900 min-w-[140px] text-center">{MESES[mes]} {año}</span>
            <button onClick={()=>navMes(1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 bg-white cursor-pointer">›</button>
          </div>
        }
      />

      {/* Saldo inicial */}
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 flex items-center gap-4 mb-6 shadow-card">
        <span className="text-slate-500 text-sm">Saldo inicial del mes:</span>
        {editSaldo ? (
          <>
            <input autoFocus value={saldoInput} onChange={e=>setSaldoInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&saveSaldo()}
              className="input-field w-48 font-mono text-lg py-1" placeholder="0" />
            <button onClick={saveSaldo} className="btn-primary py-1.5 px-4 text-sm">OK</button>
            <button onClick={()=>setEditSaldo(false)} className="btn-ghost py-1.5 px-4 text-sm">Cancelar</button>
          </>
        ) : (
          <>
            <span onClick={()=>{setSaldoInput(String(saldoInicial));setEditSaldo(true)}}
              className="text-xl font-bold font-mono text-blue-700 cursor-pointer border-b-2 border-dashed border-blue-300 hover:border-blue-600 transition-colors">
              {fmt(saldoInicial,m)}
            </span>
            <span className="text-slate-300 text-xs">← click para editar</span>
          </>
        )}
        <div className="ml-auto text-slate-400 text-sm">
          Gasto diario sugerido: <span className="font-bold font-mono text-slate-700">{fmt(dispDia,m)}</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          {l:'Saldo inicial',          v:fmt(saldoInicial,m), s:'Al 1° del mes',              c:'#64748b'},
          {l:'Saldo estimado fin mes', v:fmt(saldoFin,m),     s:'Proyección',                 c:saldoFin>=0?'#1A5E9E':'#C0392B'},
          {l:'Punto más bajo',         v:fmt(minDia?.saldo??0,m), s:`Día ${minDia?.dia??'-'} — tené cuidado`, c:(minDia?.saldo??0)>=0?'#E8A020':'#C0392B'},
          {l:'Gasto diario sugerido',  v:fmt(dispDia,m),      s:'Para llegar bien al mes',    c:'#2D7D2D'},
        ].map(k=>(
          <div key={k.l} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card">
            <div className="label mb-1">{k.l}</div>
            <div className="text-2xl font-bold font-mono" style={{color:k.c}}>{k.v}</div>
            <div className="text-slate-400 text-xs mt-1">{k.s}</div>
          </div>
        ))}
      </div>

      {/* Gráfico saldo acumulado */}
      <Card className="mb-5">
        <CardTitle>Saldo disponible acumulado</CardTitle>
        <p className="text-slate-400 text-xs mb-4">Línea azul = zona cómoda · Rojo = déficit · Los puntos marcan días con movimientos</p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={flowData} margin={{top:5,right:10,bottom:0,left:10}}>
            <defs>
              <linearGradient id="gPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#1A5E9E" stopOpacity={0.12}/>
                <stop offset="95%" stopColor="#1A5E9E" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="gNeg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#C0392B" stopOpacity={0.1}/>
                <stop offset="95%" stopColor="#C0392B" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="dia" tick={{fill:'#94a3b8',fontSize:10}} axisLine={false} tickLine={false}
              tickFormatter={v=>v%5===0||v===1?String(v):''} />
            <YAxis tick={{fill:'#94a3b8',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>fmt(v,m)} />
            <Tooltip contentStyle={TT}
              formatter={(v:number)=>[fmt(v,m),'Saldo']}
              labelFormatter={l=>`Día ${l}`} />
            <ReferenceLine y={0} stroke="#C0392B" strokeDasharray="4 3" strokeWidth={1.5} />
            <Area type="monotone" dataKey="saldo" stroke="#1A5E9E" fill="url(#gPos)"
              strokeWidth={2.5} dot={(p:any)=>p.payload.eventos?.length>0?<circle key={p.key} cx={p.cx} cy={p.cy} r={4} fill={p.payload.saldo<0?'#C0392B':'#1A5E9E'} stroke="#fff" strokeWidth={2}/>:<g key={p.key}/>} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Gráfico entradas/salidas */}
      <Card className="mb-5">
        <CardTitle>Entradas y salidas por día</CardTitle>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={flowData} barCategoryGap="20%" barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="dia" tick={{fill:'#94a3b8',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>v%5===0||v===1?String(v):''} />
            <YAxis tick={{fill:'#94a3b8',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>fmt(v,m)} />
            <Tooltip contentStyle={TT} formatter={(v:number,n:string)=>[fmt(v,m),n==='entradas'?'Entradas':'Salidas']} labelFormatter={l=>`Día ${l}`} />
            <Bar dataKey="entradas" name="entradas" fill="#86efac" radius={[3,3,0,0]} maxBarSize={16} />
            <Bar dataKey="salidas"  name="salidas"  fill="#fca5a5" radius={[3,3,0,0]} maxBarSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Días con movimientos */}
      {diasConEvs.length>0 && (
        <div>
          <div className="text-slate-900 font-semibold text-[15px] mb-4">Días con movimientos</div>
          <div className="grid grid-cols-3 gap-4">
            {diasConEvs.map(d=>{
              const isHoy = d.dia===HOY.getDate()&&mes===HOY.getMonth()&&año===HOY.getFullYear()
              const isNeg = d.saldo<0
              const saldoC = isNeg?'#C0392B':d.saldo<saldoInicial*0.3?'#E8A020':'#1A5E9E'
              const badge = isHoy?{l:'hoy',bg:'#1A5E9E',c:'#fff'}:
                            isNeg?{l:'déficit',bg:'#FEF2F2',c:'#C0392B'}:
                            d.entradas>d.salidas?{l:'cobro',bg:'#EAF3DE',c:'#2D7D2D'}:
                            {l:'pago',bg:'#FEF2F2',c:'#C0392B'}
              return (
                <div key={d.dia} className={`bg-white border rounded-2xl p-5 shadow-card ${isHoy?'border-blue-200 bg-blue-50/30':isNeg?'border-red-100':'border-slate-200'}`}>
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold font-mono text-slate-900">Día {d.dia}</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:badge.bg,color:badge.c}}>{badge.l}</span>
                    </div>
                    <span className="text-lg font-bold font-mono" style={{color:saldoC}}>{fmt(d.saldo,m)}</span>
                  </div>
                  <div className="flex flex-col gap-1.5 mb-3">
                    {d.eventos.map(ev=>(
                      <div key={ev.id} className="flex justify-between items-center">
                        <span className="text-slate-500 text-xs truncate max-w-[160px]">
                          {ev.tipo==='ingreso'?'↑':'↓'} {ev.descripcion}
                        </span>
                        <span className={`text-xs font-mono font-bold flex-shrink-0 ${ev.tipo==='ingreso'?'text-emerald-600':'text-red-600'}`}>
                          {ev.tipo==='ingreso'?'+':'-'}{ev.monto?fmt(ev.monto,m):'—'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between pt-2.5 border-t border-slate-100">
                    <span className="text-slate-400 text-xs">Neto del día</span>
                    <span className={`text-xs font-mono font-bold ${d.neto>=0?'text-emerald-600':'text-red-600'}`}>
                      {d.neto>=0?'+':''}{fmt(d.neto,m)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {diasConEvs.length===0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-card">
          <div className="text-4xl mb-3">📅</div>
          <div className="text-slate-700 font-semibold">Sin eventos este mes</div>
          <div className="text-slate-400 text-sm mt-1">Agregá eventos en el módulo de Deudas → Calendario</div>
        </div>
      )}
    </div>
  )
}
