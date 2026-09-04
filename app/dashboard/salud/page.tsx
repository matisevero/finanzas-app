'use client'
import { useMemo, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { useIngresos, useEgresos, useIngresosByAño, useEgresosByAño, useDeudas, useMetas, useAhorros, useTarjetas, useSaludCategorias, useSaludOverridesMes, useTarjetaPeriodoTotalesTodos } from '@/hooks'
import { fmt } from '@/lib/utils/formatters'
import { calcularSaludConfigurable, calcularInsights, type SaludCategoriaResuelta, type SaludInputsConfigurable, type SaludInsight } from '@/lib/utils/calculations'
import { PageHeader, Card, LoadingSpinner, ProgressBar } from '@/components/ui'
import SaludConfigModal from '@/components/dashboard/SaludConfigModal'

export default function SaludPage() {
  const { añoActivo, vistaTipo, mesActivo, monedaPrincipal: m } = useAppStore()
  const esMensual = vistaTipo === 'mensual'
  const { data: ingresos, loading: li } = useIngresos()
  const { data: egresos,  loading: le } = useEgresos()
  const { data: deudas,   loading: ld } = useDeudas()
  const { data: metas,    loading: lm } = useMetas()
  const { data: ahorros,  loading: la } = useAhorros()
  const { data: tarjetas, loading: lt } = useTarjetas()
  const { data: periodoTotales, loading: lpt } = useTarjetaPeriodoTotalesTodos()
  const { data: categorias, loading: lc } = useSaludCategorias()
  const { data: overrides, loading: lov } = useSaludOverridesMes(añoActivo, mesActivo)
  // Para el mes anterior a Enero, hace falta Diciembre del año anterior — `ingresos`/`egresos`
  // ya vienen escopeados a añoActivo por los hooks de arriba, así que para ese único caso
  // borde se pide aparte (costo chico, siempre se pide, así no se rompen las reglas de hooks).
  const { data: ingresosAñoAnt } = useIngresosByAño(añoActivo - 1)
  const { data: egresosAñoAnt }  = useEgresosByAño(añoActivo - 1)
  const [showConfig, setShowConfig] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const mesesConDatos = useMemo(()=>
    [...new Set((ingresos??[]).map(i=>i.mes))]
  , [ingresos])

  const ingresoMensual = useMemo(()=>{
    if (esMensual) return (ingresos??[]).filter(i=>i.mes===mesActivo).reduce((s,i)=>s+i.monto,0)
    const total = (ingresos??[]).reduce((s,i)=>s+i.monto,0)
    return mesesConDatos.length>0 ? Math.round(total/mesesConDatos.length) : 0
  }, [ingresos, esMensual, mesActivo, mesesConDatos])

  const egresoMensual = useMemo(()=>{
    if (esMensual) return (egresos??[]).filter(e=>e.mes===mesActivo).reduce((s,e)=>s+e.monto,0)
    const total = (egresos??[]).reduce((s,e)=>s+e.monto,0)
    return mesesConDatos.length>0 ? Math.round(total/mesesConDatos.length) : 0
  }, [egresos, esMensual, mesActivo, mesesConDatos])

  const cuotaTotal = useMemo(()=>
    (deudas??[]).filter(d=>d.activa).reduce((s,d)=>s+d.cuota_mensual,0)
  , [deudas])

  // "Uso de tarjetas" real: total_declarado de tarjeta_periodo_totales (reemplaza a
  // pagos_tarjeta, que quedó muerta desde que se sacó el sistema de conciliación
  // contra PDF — nada en la app le escribe más) + el límite REAL de cada Tarjeta
  // activa (antes era un heurístico inventado, usado × 2.5).
  const tarjetaUsado = useMemo(()=>{
    if (esMensual) return (periodoTotales??[]).filter(p=>p.año===añoActivo && p.mes===mesActivo).reduce((s,p)=>s+p.total_declarado,0)
    const delAño = (periodoTotales??[]).filter(p=>p.año===añoActivo)
    const mesesConDato = new Set(delAño.map(p=>p.mes)).size
    return mesesConDato>0 ? Math.round(delAño.reduce((s,p)=>s+p.total_declarado,0)/mesesConDato) : 0
  }, [periodoTotales, esMensual, añoActivo, mesActivo])

  const tarjetaLimite = useMemo(()=>
    (tarjetas??[]).filter(t=>t.activa).reduce((s,t)=>s+t.limite,0)
  , [tarjetas])

  // Resuelve peso/umbral por categoría: general salvo que haya override para este
  // mes puntual (ver modal "Configurar").
  const categoriasResueltas: SaludCategoriaResuelta[] = useMemo(() => {
    const ovMap = new Map((overrides??[]).map(o=>[o.categoria_id,o]))
    return (categorias??[]).filter(c=>c.activa).map(c => {
      const ov = ovMap.get(c.id)
      return { ...c, peso: ov?.peso ?? c.peso, umbral: ov?.umbral ?? c.umbral }
    })
  }, [categorias, overrides])

  const egresosDelPeriodo = useMemo(()=>
    esMensual ? (egresos??[]).filter(e=>e.mes===mesActivo) : (egresos??[])
  , [egresos, esMensual, mesActivo])

  const salud = useMemo(()=>
    ingresoMensual>0 && categoriasResueltas.length>0
      ? calcularSaludConfigurable(categoriasResueltas, {
          ingresoMensual, egresoMensual, cuotaTotal, tarjetaUsado, tarjetaLimite,
          egresosDelPeriodo, ahorros: ahorros??[], metas: metas??[],
        })
      : null
  , [ingresoMensual, egresoMensual, cuotaTotal, tarjetaUsado, tarjetaLimite, categoriasResueltas, egresosDelPeriodo, ahorros, metas])

  // ── Insights mes contra mes anterior (solo tiene sentido en vista Mes) ──────
  const mesAnteriorNum = mesActivo === 1 ? 12 : mesActivo - 1
  const añoAnteriorNum = mesActivo === 1 ? añoActivo - 1 : añoActivo
  const ingresosFuenteAnterior = añoAnteriorNum === añoActivo ? ingresos : ingresosAñoAnt
  const egresosFuenteAnterior  = añoAnteriorNum === añoActivo ? egresos  : egresosAñoAnt

  const ingresoMensualAnterior = useMemo(()=>
    (ingresosFuenteAnterior??[]).filter(i=>i.mes===mesAnteriorNum).reduce((s,i)=>s+i.monto,0)
  , [ingresosFuenteAnterior, mesAnteriorNum])
  const egresoMensualAnterior = useMemo(()=>
    (egresosFuenteAnterior??[]).filter(e=>e.mes===mesAnteriorNum).reduce((s,e)=>s+e.monto,0)
  , [egresosFuenteAnterior, mesAnteriorNum])
  const egresosDelPeriodoAnterior = useMemo(()=>
    (egresosFuenteAnterior??[]).filter(e=>e.mes===mesAnteriorNum)
  , [egresosFuenteAnterior, mesAnteriorNum])
  const tarjetaUsadoAnterior = useMemo(()=>
    (periodoTotales??[]).filter(p=>p.año===añoAnteriorNum && p.mes===mesAnteriorNum).reduce((s,p)=>s+p.total_declarado,0)
  , [periodoTotales, añoAnteriorNum, mesAnteriorNum])

  // cuotaTotal y tarjetaLimite son un snapshot de HOY (Deudas/Tarjetas activas) — no hay
  // forma de reconstruir con qué deudas/límites contabas exactamente el mes pasado sin
  // guardar historial de eso, así que se reutiliza el mismo valor para ambos meses. Es
  // una aproximación razonable (esos números no suelen cambiar mes a mes de golpe).
  const insights: SaludInsight[] = useMemo(()=>{
    if (!esMensual || categoriasResueltas.length===0 || ingresoMensual===0) return []
    const inpActual: SaludInputsConfigurable = { ingresoMensual, egresoMensual, cuotaTotal, tarjetaUsado, tarjetaLimite, egresosDelPeriodo, ahorros: ahorros??[], metas: metas??[] }
    const inpAnterior: SaludInputsConfigurable = { ingresoMensual: ingresoMensualAnterior, egresoMensual: egresoMensualAnterior, cuotaTotal, tarjetaUsado: tarjetaUsadoAnterior, tarjetaLimite, egresosDelPeriodo: egresosDelPeriodoAnterior, ahorros: ahorros??[], metas: metas??[] }
    return calcularInsights(categoriasResueltas, inpActual, inpAnterior)
  }, [esMensual, categoriasResueltas, ingresoMensual, egresoMensual, cuotaTotal, tarjetaUsado, tarjetaLimite, egresosDelPeriodo, ahorros, metas, ingresoMensualAnterior, egresoMensualAnterior, tarjetaUsadoAnterior, egresosDelPeriodoAnterior])

  // Dibujar gauge semicircular
  useEffect(()=>{
    if (!canvasRef.current || !salud) return
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')!
    const cx=180, cy=170, r=130, lw=22
    const startA = Math.PI, endA = 2*Math.PI
    const fillA  = startA + (Math.PI * (salud.total/100))
    const isDark = matchMedia('(prefers-color-scheme:dark)').matches
    const trackC = isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'

    ctx.clearRect(0,0,360,180)
    ctx.beginPath(); ctx.arc(cx,cy,r,startA,endA)
    ctx.strokeStyle=trackC; ctx.lineWidth=lw; ctx.lineCap='round'; ctx.stroke()

    const grad = ctx.createLinearGradient(cx-r,cy,cx+r,cy)
    grad.addColorStop(0,'#F54927'); grad.addColorStop(0.5,'#E8A020'); grad.addColorStop(1,'#40B046')
    ctx.beginPath(); ctx.arc(cx,cy,r,startA,fillA)
    ctx.strokeStyle=grad; ctx.lineWidth=lw; ctx.lineCap='round'; ctx.stroke()
  }, [salud])

  const MESES_N = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const periodoLabel = esMensual ? `${MESES_N[mesActivo-1]} ${añoActivo}` : `Promedio mensual ${añoActivo}`

  if ((li&&!ingresos)||(le&&!egresos)||(ld&&!deudas)||(lm&&!metas)||(la&&!ahorros)||(lt&&!tarjetas)||(lpt&&!periodoTotales)||(lc&&!categorias)||(lov&&!overrides)) return <LoadingSpinner />

  if (!salud || ingresoMensual===0) return (
    <div>
      <PageHeader title="Salud Financiera" subtitle="Diagnóstico integral de tu situación económica"
        action={
          <button onClick={()=>setShowConfig(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 text-xs font-medium cursor-pointer">
            ⚙ Configurar
          </button>
        } />
      <SaludConfigModal open={showConfig} onClose={()=>setShowConfig(false)} año={añoActivo} mes={mesActivo} onSaved={()=>{}} />
      <Card>
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📊</div>
          <div className="text-slate-700 font-semibold text-lg mb-2">Sin datos suficientes</div>
          <div className="text-slate-400 text-sm">Cargá ingresos y egresos para ver tu diagnóstico financiero.</div>
        </div>
      </Card>
    </div>
  )

  return (
    <div>
      <PageHeader title="Salud Financiera" subtitle={`Diagnóstico integral — ${periodoLabel}`}
        action={
          <button onClick={()=>setShowConfig(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 text-xs font-medium cursor-pointer">
            ⚙ Configurar
          </button>
        } />
      <SaludConfigModal open={showConfig} onClose={()=>setShowConfig(false)} año={añoActivo} mes={mesActivo} onSaved={()=>{}} />

      {/* Insights en texto plano — mes contra mes anterior */}
      {esMensual && insights.length > 0 && (
        <Card className="mb-6">
          <div className="text-slate-900 font-semibold text-[15px] mb-0.5">Lo que juntamos este mes</div>
          <div className="text-slate-400 text-xs mb-4">Ordenado por dónde más podés ahorrar</div>
          <div className="flex flex-col gap-2">
            {insights.map(ins => {
              const bg = ins.tipo === 'oportunidad' ? '#FEF2F2' : ins.tipo === 'positivo' ? '#F7FCF7' : '#F8FAFC'
              const border = ins.tipo === 'oportunidad' ? '#FECACA' : ins.tipo === 'positivo' ? '#E9F6EA' : '#E2E8F0'
              return (
                <div key={ins.id} className="rounded-xl px-4 py-3 flex items-start gap-3" style={{ background: bg, border: `1px solid ${border}` }}>
                  <span className="text-lg flex-shrink-0">{ins.icono}</span>
                  <span className="text-sm text-slate-700 leading-relaxed">{ins.texto}</span>
                </div>
              )
            })}
          </div>
        </Card>
      )}
      {!esMensual && (
        <div className="text-slate-400 text-xs mb-6">Los insights mes contra mes solo se ven en vista Mes — estás mirando el promedio del año.</div>
      )}

      {/* Hero */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
        {/* Score gauge */}
        <Card className="flex flex-col items-center justify-center py-6">
          <canvas ref={canvasRef} width={360} height={180} className="w-full max-w-[240px]" />
          <div className="text-5xl font-bold font-mono mt-2" style={{color:salud.color}}>{salud.total}</div>
          <div className="text-lg font-semibold mt-1" style={{color:salud.color}}>{salud.label}</div>
          <div className="text-slate-400 text-xs mt-2 text-center px-4">
            {salud.total>=75?'Tu situación financiera está en buen estado.':salud.total>=50?'Hay aspectos a mejorar. Revisá las categorías en rojo.':'Hay alertas importantes que necesitás atender.'}
          </div>
          <div className="flex gap-4 mt-4">
            {[{l:'0–49',c:'#F54927'},{l:'50–74',c:'#E8A020'},{l:'75–100',c:'#40B046'}].map(x=>(
              <div key={x.l} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{background:x.c}} />
                <span className="text-slate-400 text-xs">{x.l}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Desglose */}
        <Card className="md:col-span-2">
          <div className="text-slate-900 font-semibold text-[15px] mb-5">Desglose por categoría</div>
          <div className="flex flex-col gap-4">
            {salud.categorias.map(cat=>{
              const bc = cat.score>=75?'#40B046':cat.score>=50?'#E8A020':'#F54927'
              return (
                <div key={cat.nombre} className="flex items-center gap-2 md:gap-4 flex-wrap">
                  <span className="text-xl w-7 flex-shrink-0">{cat.icono}</span>
                  <div className="w-24 sm:w-36 flex-shrink-0">
                    <div className="text-sm font-medium text-slate-700">{cat.nombre}</div>
                    <div className="text-slate-400 text-xs">Peso: {cat.peso}%</div>
                  </div>
                  <div className="flex-1">
                    <ProgressBar value={cat.score} color={bc} height={6} />
                  </div>
                  <div className="text-sm font-bold font-mono w-8 text-right flex-shrink-0" style={{color:bc}}>{cat.score}</div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${cat.ok?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-600'}`}>
                    {cat.ok?'✓ OK':'✗ Revisar'}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Cards detalle */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {salud.categorias.map(cat=>{
          const bc   = cat.score>=75?'#40B046':cat.score>=50?'#E8A020':'#F54927'
          const tipBg = cat.ok?'#E9F6EA':'#FEF2F2'
          const tipC  = cat.ok?'#3B6D11':'#D03E21'
          return (
            <Card key={cat.nombre} className={cat.ok?'':'border-red-100'}>
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{cat.icono}</span>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{cat.nombre}</div>
                    <div className="text-slate-400 text-xs">{cat.descripcion}</div>
                  </div>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cat.ok?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-600'}`}>
                  {cat.ok?'✓ OK':'✗ Revisar'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <div className="label mb-0.5">Actual</div>
                  <div className="text-sm font-mono font-bold" style={{color:cat.color}}>{cat.valorActual}</div>
                </div>
                <div>
                  <div className="label mb-0.5">Ideal</div>
                  <div className="text-sm font-mono text-slate-400">{cat.valorIdeal}</div>
                </div>
              </div>
              <ProgressBar value={cat.score} color={bc} height={5} />
              <div className="flex justify-between mt-1 mb-3">
                <span className="text-xs text-slate-400">Score</span>
                <span className="text-xs font-bold font-mono" style={{color:bc}}>{cat.score}/100</span>
              </div>
              <div className="text-xs rounded-xl px-3 py-2.5 leading-relaxed" style={{background:tipBg,color:tipC}}>
                {cat.tip}
              </div>
            </Card>
          )
        })}
      </div>

      {/* Métricas clave */}
      <div>
        <div className="text-slate-900 font-semibold text-[15px] mb-4">Métricas clave — {periodoLabel}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {l:'Ingreso mensual',     v:fmt(ingresoMensual,m),     s:periodoLabel,           c:'#40B046'},
            {l:'Egreso mensual',      v:fmt(egresoMensual,m),      s:'Incl. inversiones',            c:'#F54927'},
            {l:'Cuotas fijas',        v:fmt(cuotaTotal,m),         s:'Comprometido/mes',             c:'#5B3FA6'},
            {l:'Ahorro libre',        v:fmt(Math.max(0,ingresoMensual-egresoMensual-cuotaTotal),m), s:'Ingreso - todo', c:ingresoMensual>egresoMensual+cuotaTotal?'#1D9E75':'#F54927'},
            {l:'Ratio deuda/ingreso', v:((cuotaTotal/ingresoMensual)*100).toFixed(1)+'%', s:cuotaTotal/ingresoMensual<0.36?'✓ Saludable (<36%)':'✗ Alto (>36%)', c:cuotaTotal/ingresoMensual<0.36?'#40B046':'#F54927'},
            {l:'Ratio gasto/ingreso', v:((egresoMensual/ingresoMensual)*100).toFixed(1)+'%', s:egresoMensual/ingresoMensual<0.70?'✓ Controlado':'✗ Elevado', c:egresoMensual/ingresoMensual<0.70?'#40B046':'#F54927'},
            {l:'Deuda pendiente',     v:fmt((deudas??[]).filter(d=>d.activa).reduce((s,d)=>s+d.pendiente,0),m), s:'Total a pagar (todas las cuotas)', c:'#5B3FA6'},
            {l:'Pagos TC este mes',   v:fmt(tarjetaUsado,m),       s:'Resumen tarjetas',             c:'#1A5E9E'},
          ].map(k=>(
            <div key={k.l} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-card">
              <div className="label mb-1">{k.l}</div>
              <div className="text-xl font-bold font-mono" style={{color:k.c}}>{k.v}</div>
              <div className="text-xs mt-1" style={{color:k.c+'99'}}>{k.s}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
