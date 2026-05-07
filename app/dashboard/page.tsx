'use client'
import { useState, useMemo } from 'react'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAppStore } from '@/store/appStore'
import { useIngresos, useEgresos, useDeudas, usePagosTarjeta, useTarjetas } from '@/hooks'
import { fmt } from '@/lib/utils/formatters'
import { MESES_CORTOS, TIPOS_EGRESO, TIPOS_INGRESO } from '@/lib/utils/constants'
import { LoadingSpinner } from '@/components/ui'

const TT = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, color:'#0f172a' }

export default function DashboardPage() {
  const { añoActivo, monedaPrincipal: m } = useAppStore()
  const { data: ingresos, loading: li } = useIngresos()
  const { data: egresos,  loading: le } = useEgresos()
  const { data: deudas,   loading: ld } = useDeudas()
  const { data: pagos,    loading: lp } = usePagosTarjeta()
  const { data: tarjetas, loading: lt } = useTarjetas()

  const [flowType, setFlowType] = useState<'bar'|'line'>('bar')
  const [distMode, setDistMode] = useState<'egresos'|'ingresos'>('egresos')
  const [distMes,  setDistMes]  = useState(-1)

  if (li||le||ld||lp||lt) return <LoadingSpinner />

  const totalIngresos = (ingresos??[]).reduce((s,i)=>s+i.monto,0)
  const totalEgresos  = (egresos??[]).reduce((s,e)=>s+e.monto,0)
  const totalUSD      = (egresos??[]).filter(e=>e.categoria==='usd').reduce((s,e)=>s+e.monto,0)

  const flowData = MESES_CORTOS.map((month,i)=>({
    month,
    Ingresos: (ingresos??[]).filter(x=>x.mes===i+1).reduce((s,x)=>s+x.monto,0),
    Gastos:   (egresos??[]).filter(x=>x.mes===i+1).reduce((s,x)=>s+x.monto,0),
  }))

  const distData = (() => {
    if (distMode==='egresos') {
      const src = distMes===-1 ? (egresos??[]) : (egresos??[]).filter(x=>x.mes===distMes+1)
      return Object.entries(TIPOS_EGRESO).map(([key,cfg])=>({
        name:cfg.label, color:cfg.color,
        value: src.filter(e=>e.categoria===key).reduce((s,e)=>s+e.monto,0)
      })).filter(d=>d.value>0).sort((a,b)=>b.value-a.value).slice(0,7)
    } else {
      const src = distMes===-1 ? (ingresos??[]) : (ingresos??[]).filter(x=>x.mes===distMes+1)
      return Object.entries(TIPOS_INGRESO).map(([key,cfg])=>({
        name:cfg.label, color:cfg.color,
        value: src.filter(i=>i.tipo===key).reduce((s,i)=>s+i.monto,0)
      })).filter(d=>d.value>0)
    }
  })()

  const distTotal = distData.reduce((s,d)=>s+d.value,0)

  const ultimoPago = useMemo(()=>{
    const map: Record<string,number> = {}
    const mesMax: Record<string,number> = {}
    ;(pagos??[]).forEach(p=>{
      if (!mesMax[p.tarjeta_id]||p.mes>mesMax[p.tarjeta_id]) {
        mesMax[p.tarjeta_id]=p.mes; map[p.tarjeta_id]=p.monto
      }
    })
    return map
  }, [pagos])

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16,paddingBottom:24}}>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
        {[
          {l:'Ingresos '+añoActivo, v:fmt(totalIngresos,m), s:'Acumulado', t:'+12%', up:true},
          {l:'Egresos '+añoActivo,  v:fmt(totalEgresos,m),  s:'Acumulado', t:'+8%',  up:false},
          {l:'Inversiones USD', v:fmt(totalUSD,m), s:'ARS equiv. comprados', t:Math.round((totalEgresos>0?totalUSD/totalEgresos:0)*100)+'% del egreso', up:true},
        ].map(k=>(
          <div key={k.l} style={{background:'var(--color-background-secondary)',borderRadius:'var(--border-radius-md)',padding:'14px 16px'}}>
            <div style={{fontSize:11,color:'var(--color-text-secondary)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>{k.l}</div>
            <div style={{fontSize:22,fontWeight:500,fontFamily:'var(--font-mono)',color:'var(--color-text-primary)'}}>{k.v}</div>
            <div style={{fontSize:11,color:'var(--color-text-secondary)',marginTop:4}}>{k.s}</div>
            <div style={{fontSize:11,fontWeight:500,marginTop:4,color:k.up?'#3B6D11':'#A32D2D'}}>{k.t}</div>
          </div>
        ))}
        <div style={{background:'transparent',border:'0.5px dashed var(--color-border-tertiary)',borderRadius:'var(--border-radius-md)',padding:'14px 16px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6,minHeight:90,cursor:'pointer'}}>
          <div style={{fontSize:20,color:'var(--color-text-secondary)'}}>+</div>
          <div style={{fontSize:11,color:'var(--color-text-secondary)',textAlign:'center'}}>Widget personalizable</div>
        </div>
      </div>

      {/* Flujo + Distribución */}
      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:12}}>
        <div style={{background:'var(--color-background-primary)',border:'0.5px solid var(--color-border-tertiary)',borderRadius:'var(--border-radius-lg)',padding:'18px 20px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
            <div style={{fontSize:13,fontWeight:500,color:'var(--color-text-primary)'}}>Flujo financiero {añoActivo}</div>
            <div style={{display:'flex',gap:3,background:'var(--color-background-secondary)',borderRadius:6,padding:3}}>
              {(['bar','line'] as const).map(t=>(
                <button key={t} onClick={()=>setFlowType(t)} style={{border:'none',background:flowType===t?'var(--color-background-primary)':'transparent',fontSize:11,padding:'3px 10px',borderRadius:4,cursor:'pointer',color:flowType===t?'var(--color-text-primary)':'var(--color-text-secondary)',fontWeight:flowType===t?500:400,outline:'none'}}>
                  {t==='bar'?'barras':'línea'}
                </button>
              ))}
            </div>
          </div>
          <div style={{fontSize:11,color:'var(--color-text-secondary)',marginBottom:10}}>Ingresos vs gastos mes a mes</div>
          <div style={{display:'flex',gap:14,marginBottom:10}}>
            {[{c:'#639922',l:'Ingresos'},{c:'#E24B4A',l:'Gastos'}].map(x=>(
              <div key={x.l} style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'var(--color-text-secondary)'}}>
                <div style={{width:10,height:10,borderRadius:2,background:x.c}}/>
                {x.l}
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={170}>
            {flowType==='bar'?(
              <BarChart data={flowData} barCategoryGap="30%" barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false}/>
                <XAxis dataKey="month" tick={{fill:'#94a3b8',fontSize:11}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:'#94a3b8',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>v===0?'':fmt(v,m)}/>
                <Tooltip contentStyle={TT} formatter={(v:number)=>[fmt(v,m)]}/>
                <Bar dataKey="Ingresos" fill="#97C459" radius={[3,3,0,0]} maxBarSize={28}/>
                <Bar dataKey="Gastos"   fill="#F09595" radius={[3,3,0,0]} maxBarSize={28}/>
              </BarChart>
            ):(
              <LineChart data={flowData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)"/>
                <XAxis dataKey="month" tick={{fill:'#94a3b8',fontSize:11}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:'#94a3b8',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>fmt(v,m)}/>
                <Tooltip contentStyle={TT} formatter={(v:number)=>[fmt(v,m)]}/>
                <Line type="monotone" dataKey="Ingresos" stroke="#639922" strokeWidth={2.5} dot={false}/>
                <Line type="monotone" dataKey="Gastos"   stroke="#E24B4A" strokeWidth={2.5} dot={false} strokeDasharray="4 3"/>
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>

        <div style={{background:'var(--color-background-primary)',border:'0.5px solid var(--color-border-tertiary)',borderRadius:'var(--border-radius-lg)',padding:'18px 20px'}}>
          <div style={{fontSize:13,fontWeight:500,color:'var(--color-text-primary)',marginBottom:10}}>Distribución</div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,gap:12}}>
            <div style={{display:'flex',gap:3,background:'var(--color-background-secondary)',borderRadius:6,padding:3,flexShrink:0}}>
              {(['egresos','ingresos'] as const).map(t=>(
                <button key={t} onClick={()=>setDistMode(t)} style={{border:'none',background:distMode===t?'var(--color-background-primary)':'transparent',fontSize:11,padding:'3px 9px',borderRadius:4,cursor:'pointer',color:distMode===t?'var(--color-text-primary)':'var(--color-text-secondary)',fontWeight:distMode===t?500:400,outline:'none'}}>
                  {t}
                </button>
              ))}
            </div>
            <div style={{flex:1,display:'flex',alignItems:'center',gap:8}}>
              <input type="range" min="0" max={MESES_CORTOS.length} step="1"
                value={distMes===-1?MESES_CORTOS.length:distMes}
                onChange={e=>{ const v=parseInt(e.target.value); setDistMes(v>=MESES_CORTOS.length?-1:v) }}
                style={{flex:1}}/>
              <span style={{fontSize:12,fontWeight:500,color:'var(--color-text-primary)',minWidth:32,textAlign:'center'}}>
                {distMes===-1?'Acum.':MESES_CORTOS[distMes]}
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <PieChart>
              <Pie data={distData} cx="50%" cy="50%" innerRadius={38} outerRadius={60} paddingAngle={3} dataKey="value">
                {distData.map((_,i)=><Cell key={i} fill={distData[i].color}/>)}
              </Pie>
              <Tooltip contentStyle={TT} formatter={(v:number)=>[fmt(v,m)]}/>
            </PieChart>
          </ResponsiveContainer>
          <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:10}}>
            {distData.map(d=>(
              <div key={d.name} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--color-text-secondary)'}}>
                  <div style={{width:8,height:8,borderRadius:'50%',background:d.color,flexShrink:0}}/>
                  {d.name}
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <span style={{fontSize:10,color:'var(--color-text-secondary)'}}>{distTotal>0?Math.round(d.value/distTotal*100):0}%</span>
                  <span style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--color-text-primary)',fontWeight:500}}>{fmt(d.value,m)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tarjetas + Deudas */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <div style={{background:'var(--color-background-primary)',border:'0.5px solid var(--color-border-tertiary)',borderRadius:'var(--border-radius-lg)',padding:'18px 20px'}}>
          <div style={{fontSize:13,fontWeight:500,color:'var(--color-text-primary)',marginBottom:4}}>Tarjetas de crédito</div>
          <div style={{fontSize:11,color:'var(--color-text-secondary)',marginBottom:14}}>Último pago registrado por tarjeta</div>
          {(tarjetas??[]).length===0?(
            <div style={{fontSize:12,color:'var(--color-text-secondary)',textAlign:'center',padding:'16px 0'}}>Sin tarjetas registradas</div>
          ):(tarjetas??[]).slice(0,5).map(t=>{
            const pago = ultimoPago[t.id]??0
            const pct  = Math.min(100,Math.round(pago/2000000*100))
            return (
              <div key={t.id}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                  <div style={{width:30,height:30,borderRadius:6,background:t.color+'22',color:t.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,flexShrink:0}}>{t.icono}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:500,color:'var(--color-text-primary)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.nombre}</div>
                    <div style={{fontSize:10,color:'var(--color-text-secondary)'}}>{t.banco}</div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{fontSize:12,fontFamily:'var(--font-mono)',fontWeight:500,color:'#A32D2D'}}>{fmt(pago,m)}</div>
                    <div style={{fontSize:10,color:'var(--color-text-secondary)'}}>últ. pago</div>
                  </div>
                </div>
                <div style={{height:4,background:'var(--color-border-tertiary)',borderRadius:99,overflow:'hidden',marginBottom:12}}>
                  <div style={{height:'100%',borderRadius:99,background:t.color,width:pct+'%'}}/>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{background:'var(--color-background-primary)',border:'0.5px solid var(--color-border-tertiary)',borderRadius:'var(--border-radius-lg)',padding:'18px 20px'}}>
          <div style={{fontSize:13,fontWeight:500,color:'var(--color-text-primary)',marginBottom:4}}>Deudas comprometidas</div>
          <div style={{fontSize:11,color:'var(--color-text-secondary)',marginBottom:14}}>Cuotas y pagos futuros registrados</div>
          {(deudas??[]).length===0?(
            <div style={{fontSize:12,color:'var(--color-text-secondary)',textAlign:'center',padding:'16px 0'}}>Sin deudas registradas</div>
          ):(deudas??[]).slice(0,5).map(d=>{
            const pagado = d.total_original-d.pendiente
            const pct    = Math.round((pagado/d.total_original)*100)
            return (
              <div key={d.id} style={{marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                  <span style={{fontSize:12,color:'var(--color-text-primary)'}}>{d.nombre}</span>
                  <span style={{fontSize:12,fontFamily:'var(--font-mono)',color:'var(--color-text-secondary)'}}>{fmt(d.cuota_mensual,m)}/mes</span>
                </div>
                <div style={{height:5,background:'var(--color-border-tertiary)',borderRadius:99,overflow:'hidden'}}>
                  <div style={{height:'100%',borderRadius:99,background:d.color,width:pct+'%'}}/>
                </div>
                <div style={{fontSize:10,color:'var(--color-text-secondary)',marginTop:3}}>{d.cuota_actual}/{d.cuota_total} cuotas pagas</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
