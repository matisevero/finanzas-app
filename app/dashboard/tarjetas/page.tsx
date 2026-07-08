'use client'
import { useState, useMemo, useEffect } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAppStore } from '@/store/appStore'
import { useTarjetas, usePagosTarjeta, useTarjetaTransacciones } from '@/hooks'
import { updateTarjetaTransaccion, deleteTarjetaTransaccion } from '@/lib/queries'
import { fmt, fmtFull, fmtDate } from '@/lib/utils/formatters'
import { MESES_CORTOS } from '@/lib/utils/constants'
import { PageHeader, Card, CardTitle, Modal, Table, Th, Td, LoadingSpinner, EmptyState, FieldLabel, ProgressBar } from '@/components/ui'
import FechaInput from '@/components/ui/FechaInput'
import type { Moneda, Quien } from '@/types'

const TT = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, color:'#0f172a' }
const FORM_INIT = { nombre:'', banco:'', limite:'', moneda:'ARS' as Moneda, color:'#1A5E9E', icono:'V', quien:'ambos' as Quien, dia_cierre:'1', dia_vencimiento:'10' }
const CHART_COLORS = ['#1A5E9E','#F54927','#40B046','#5B3FA6','#E8A020','#D4537E','#1D9E75']
const CAT_COLORS: Record<string,{bg:string,c:string}> = {
  'Alimentación':{bg:'#E9F6EA',c:'#3B6D11'},'Tecnología':{bg:'#E6F1FB',c:'#185FA5'},
  'Ropa':{bg:'#FBEAF0',c:'#72243E'},'Hogar':{bg:'#EEEDFE',c:'#3C3489'},
  'Viajes':{bg:'#E1F5EE',c:'#0F6E56'},'Entretenimiento':{bg:'#FAEEDA',c:'#854F0B'},
  'Salud':{bg:'#FEF0EE',c:'#D03E21'},'Otros':{bg:'#F1EFE8',c:'#5F5E5A'},
}

export default function TarjetasPage() {
  const { añoActivo, vistaTipo, mesActivo, monedaPrincipal: m, monedasPalette } = useAppStore()
  const esMensual = vistaTipo === 'mensual'
  const periodoLabel = esMensual ? `${MESES_CORTOS[mesActivo-1]} ${añoActivo}` : `${añoActivo}`
  const { data: tarjetas, loading: lt, refetch: refTarjetas } = useTarjetas()
  const { data: pagosRaw, loading: lp } = usePagosTarjeta()
  const { data: txnsRaw,  loading: lx, refetch: refTxns } = useTarjetaTransacciones()
  const [selTC, setSelTC]         = useState<string|null>(null)
  const [filterCat, setFilterCat] = useState('Todos')
  const [search, setSearch]       = useState('')
  const [showModal, setShowModal]   = useState(false)
  const [showPDFModal, setShowPDFModal] = useState(false)
  const [pdfTarjetaId, setPdfTarjetaId] = useState<string|null>(null)
  const [pdfLoading, setPdfLoading]   = useState(false)
  const [pdfError, setPdfError]       = useState('')
  const [pdfTxns, setPdfTxns]         = useState<any[]>([])
  const [pdfStep, setPdfStep]         = useState<'upload'|'review'|'done'>('upload')
  const [savingPdf, setSavingPdf]     = useState(false)
  const [comercios, setComercios]     = useState<any[]>([])
  const [iaDisponible, setIaDisponible] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/analizar-comprobante').then(r => r.json()).then(d => setIaDisponible(!!d.disponible)).catch(() => setIaDisponible(false))
  }, [])

  // Modal edición de transacción
  const [showTxnModal, setShowTxnModal] = useState(false)
  const [txnEditId, setTxnEditId]       = useState<string|null>(null)
  const [txnForm, setTxnForm]           = useState({ descripcion:'', categoria:'Otros', fecha:'', monto:'', moneda:'ARS' as Moneda, cuota_actual:'', cuota_total:'' })
  const [savingTxn, setSavingTxn]       = useState(false)

  const openEditTxnModal = (t: any) => {
    setTxnForm({
      descripcion: t.descripcion ?? '', categoria: t.categoria ?? 'Otros',
      fecha: t.fecha ?? '', monto: String(t.monto ?? ''), moneda: (t.moneda ?? 'ARS') as Moneda,
      cuota_actual: t.cuota_actual ? String(t.cuota_actual) : '', cuota_total: t.cuota_total ? String(t.cuota_total) : '',
    })
    setTxnEditId(t.id)
    setShowTxnModal(true)
  }

  const handleSaveTxn = async () => {
    if (!txnEditId || !txnForm.descripcion || !txnForm.monto || !txnForm.fecha) return
    setSavingTxn(true)
    try {
      await updateTarjetaTransaccion(txnEditId, {
        descripcion: txnForm.descripcion, categoria: txnForm.categoria,
        fecha: txnForm.fecha, monto: parseFloat(txnForm.monto), moneda: txnForm.moneda,
        cuota_actual: txnForm.cuota_actual ? parseInt(txnForm.cuota_actual) : undefined,
        cuota_total: txnForm.cuota_total ? parseInt(txnForm.cuota_total) : undefined,
      })
      setShowTxnModal(false); setTxnEditId(null); refTxns()
    } catch (e) { console.error(e) } finally { setSavingTxn(false) }
  }

  const handleDeleteTxn = async () => {
    if (!txnEditId) return
    if (!confirm('¿Eliminar esta transacción?')) return
    setSavingTxn(true)
    try {
      await deleteTarjetaTransaccion(txnEditId)
      setShowTxnModal(false); setTxnEditId(null); refTxns()
    } catch (e) { console.error(e) } finally { setSavingTxn(false) }
  }

  // Cargar historial de comercios al montar
  useEffect(() => {
    import('@/lib/queries').then(q => q.getTarjetasComercios()).then(setComercios).catch(()=>{})
  }, [])
  const [saving, setSaving]       = useState(false)
  const [form, setForm]           = useState(FORM_INIT)

  const activaId   = selTC ?? 'todas'

  // Todo lo que sigue queda acotado al año activo (y, si esMensual, además al mes activo)
  const pagos = useMemo(() =>
    (pagosRaw ?? []).filter(p => p.año === añoActivo && (!esMensual || p.mes === mesActivo))
  , [pagosRaw, añoActivo, esMensual, mesActivo])

  const txns = useMemo(() =>
    (txnsRaw ?? []).filter(t => {
      const año = Number(t.fecha.slice(0,4))
      const mes = Number(t.fecha.slice(5,7))
      return año === añoActivo && (!esMensual || mes === mesActivo)
    })
  , [txnsRaw, añoActivo, esMensual, mesActivo])

  const MESES_DISP = esMensual ? [MESES_CORTOS[mesActivo-1]] : MESES_CORTOS

  const pagosPorTC = useMemo(() => {
    const map: Record<string, Record<number,number>> = {}
    ;(pagos??[]).forEach(p => {
      if (!map[p.tarjeta_id]) map[p.tarjeta_id]={}
      map[p.tarjeta_id][p.mes] = p.monto
    })
    return map
  }, [pagos])

  const chartData = useMemo(() => MESES_DISP.map((month) => {
    const mes = MESES_CORTOS.indexOf(month) + 1
    const point: Record<string,number|string> = { month }
    if (activaId==='todas') {
      ;(tarjetas??[]).forEach(t => { point[t.id] = pagosPorTC[t.id]?.[mes]??0 })
    } else {
      point['pago'] = pagosPorTC[activaId]?.[mes]??0
    }
    return point
  }), [tarjetas, pagosPorTC, activaId, MESES_DISP])

  const filteredTxns = useMemo(() => (txns??[])
    .filter(t => activaId==='todas' || t.tarjeta_id===activaId)
    .filter(t => filterCat==='Todos' || t.categoria===filterCat)
    .filter(t => !search || t.descripcion.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>b.fecha.localeCompare(a.fecha))
  , [txns, activaId, filterCat, search])

  const totalPorTC = useMemo(() => {
    const map: Record<string,number> = {}
    ;(pagos??[]).forEach(p => { map[p.tarjeta_id] = (map[p.tarjeta_id]||0)+p.monto })
    return map
  }, [pagos])

  const totalGlobal = Object.values(totalPorTC).reduce((s,v)=>s+v,0)

  const compData = useMemo(() => (tarjetas??[]).map((t,i)=>({
    name: t.nombre+' '+t.banco.split(' · ').slice(-1)[0],
    value: totalPorTC[t.id]||0,
    color: CHART_COLORS[i%CHART_COLORS.length],
  })).filter(d=>d.value>0), [tarjetas, totalPorTC])

  const cats = ['Todos','Alimentación','Tecnología','Ropa','Hogar','Viajes','Entretenimiento','Salud','Otros']

  // Split tarjetas by moneda — must be before any early return
  const tarjetasConMoneda = useMemo(() => {
    const result: { tarjeta: NonNullable<typeof tarjetas>[number]; moneda: string }[] = []
    ;(tarjetas??[]).forEach(t => {
      const monedas = [...new Set((txns??[]).filter(x=>x.tarjeta_id===t.id).map(x=>x.moneda))]
      if (monedas.length <= 1) {
        result.push({ tarjeta: t, moneda: t.moneda })
      } else {
        monedas.forEach(mon => result.push({ tarjeta: t, moneda: mon }))
      }
    })
    return result
  }, [tarjetas, txns])

  if (lt||lp||lx) return <LoadingSpinner />

  const tcActiva = activaId==='todas' ? null : (tarjetas??[]).find(t=>t.id===activaId.split('|')[0])
  const monedaActiva = activaId==='todas' ? null : activaId.includes('|') ? activaId.split('|')[1] : null

  const kpiPagos   = activaId==='todas'
    ? MESES_DISP.map((_,i)=>(tarjetas??[]).reduce((s,t)=>s+(pagosPorTC[t.id]?.[i+1]??0),0))
    : MESES_DISP.map((_,i)=>pagosPorTC[activaId]?.[i+1]??0)
  const kpiTotal   = kpiPagos.reduce((a,b)=>a+b,0)
  const kpiUlt     = kpiPagos[kpiPagos.length-1]
  const kpiPen     = kpiPagos[kpiPagos.length-2]
  const kpiTrend   = kpiPen>0 ? Math.round(((kpiUlt-kpiPen)/kpiPen)*100) : null
  const kpiMayor   = Math.max(...kpiPagos)
  const kpiMayorMes = MESES_DISP[kpiPagos.indexOf(kpiMayor)]

  return (
    <div>
      <PageHeader title="Tarjetas de crédito" subtitle="Seguimiento de pagos y transacciones"
        action={<div className="flex gap-2">
          <button className="btn-ghost text-sm" onClick={()=>{ setPdfTarjetaId(selTC); setShowPDFModal(true); setPdfStep('upload'); setPdfTxns([]); setPdfError('') }}>Importar PDF</button>
          <button className="btn-primary" onClick={()=>setShowModal(true)}>+ Nueva tarjeta</button>
        </div>} />

      {/* ── Selector de tarjetas — full width ── */}
      <div className="flex gap-3 overflow-x-auto pb-2 mb-6">
        <div onClick={()=>setSelTC(null)}
          className={`flex-shrink-0 bg-white border-2 rounded-2xl p-4 cursor-pointer transition-all min-w-[140px] ${activaId==='todas'?'border-slate-400':'border-slate-100 hover:border-slate-200'}`}>
          <div className="text-2xl mb-2">★</div>
          <div className="text-sm font-semibold text-slate-900">Todas</div>
          <div className="text-xs text-slate-400 mt-1">total {periodoLabel}</div>
          <div className="text-lg font-bold font-mono text-slate-700 mt-1">{fmt(totalGlobal,m)}</div>
        </div>
        {tarjetasConMoneda.map(({tarjeta: t, moneda: mon})=>{
          const cardId   = tarjetasConMoneda.filter(x=>x.tarjeta.id===t.id).length > 1 ? `${t.id}|${mon}` : t.id
          const isActive = activaId===cardId
          const txnsMes  = (txns??[]).filter(x=>x.tarjeta_id===t.id && x.moneda===mon)
          const totalMon = txnsMes.reduce((s,x)=>s+x.monto,0)
          const ultMes   = (txns??[]).filter(x=>x.tarjeta_id===t.id && x.moneda===mon && new Date(x.fecha).getMonth()===new Date().getMonth()).reduce((s,x)=>s+x.monto,0)
          const multiMoneda = tarjetasConMoneda.filter(x=>x.tarjeta.id===t.id).length > 1
          return (
            <div key={cardId} onClick={()=>setSelTC(cardId)}
              className="flex-shrink-0 bg-white border-2 rounded-2xl p-4 cursor-pointer transition-all min-w-[155px]"
              style={{borderColor: isActive ? t.color : '#f1f5f9'}}>
              <div className="flex justify-between items-start mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{background:t.color}}>{t.icono}</div>
                <div className="flex flex-col items-end gap-1">
                  {t.quien!=='ambos' && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.quien==='Mati'?'bg-blue-50 text-blue-700':'bg-pink-50 text-pink-700'}`}>{t.quien}</span>
                  )}
                  {multiMoneda && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{mon}</span>
                  )}
                </div>
              </div>
              <div className="text-sm font-semibold text-slate-900">{t.nombre}</div>
              <div className="text-xs text-slate-400">{t.banco}</div>
              <div className="text-lg font-bold font-mono mt-1" style={{color:t.color}}>
                {mon==='USD'?'US$':mon==='EUR'?'€':'$'}{(ultMes||totalMon).toLocaleString('es-AR',{maximumFractionDigits:0})}
              </div>
              <div className="text-[10px] text-slate-400">{ultMes?`últ. mes · ${mon}`:`total · ${mon}`}</div>
            </div>
          )
        })}
      </div>

      {/* ── Layout principal: Transacciones 2/3 | Widgets 1/3 ── */}
      <div className="grid grid-cols-3 gap-5 items-start">

        {/* ── Columna izquierda: Transacciones ── */}
        <div className="col-span-2">
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
                          <div onClick={() => openEditTxnModal(t)} className="text-slate-700 font-medium cursor-pointer hover:underline hover:font-bold">{t.descripcion}</div>
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
        </div>

        {/* ── Columna derecha: Widgets ── */}
        <div className="col-span-1 flex flex-col gap-5">

          {/* Evolución de pagos */}
          <Card>
            <CardTitle>
              Evolución de pagos
              <span className="text-slate-400 text-xs font-normal ml-2">{activaId==='todas'?'Todas las tarjetas':tcActiva?.nombre}</span>
            </CardTitle>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} barCategoryGap="30%" barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{fill:'#94a3b8',fontSize:10}} axisLine={false} tickLine={false} />
                <YAxis tick={{fill:'#94a3b8',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>v===0?'':fmt(v,m)} />
                <Tooltip contentStyle={TT} formatter={(v:number)=>[fmt(v,m)]} />
                {activaId==='todas'
                  ? (tarjetas??[]).map((t,i)=><Bar key={t.id} dataKey={t.id} name={t.nombre} fill={CHART_COLORS[i%CHART_COLORS.length]} radius={0} maxBarSize={28} stackId="s" />)
                  : <Bar dataKey="pago" fill={tcActiva?.color||'#1A5E9E'} radius={0} maxBarSize={40} />
                }
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* KPIs */}
          <Card>
            <div className="flex flex-col gap-3">
              {[
                {l:'Total pagado 2026', v:fmt(kpiTotal,m), s:activaId==='todas'?'Todas las tarjetas':tcActiva?.banco||''},
                {l:`Último pago (${MESES_CORTOS[new Date().getMonth()]})`, v:fmt(kpiUlt,m), s:kpiTrend!==null?(kpiTrend>=0?'▲':'▼')+' '+Math.abs(kpiTrend)+'% vs anterior':'', c:kpiTrend!==null&&kpiTrend>=0?'#F54927':'#40B046'},
                {l:'Mes más caro', v:fmt(kpiMayor,m), s:kpiMayorMes},
              ].map(k=>(
                <div key={k.l} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <div className="label mb-1">{k.l}</div>
                  <div className="text-lg font-bold font-mono text-slate-900">{k.v}</div>
                  {k.s && <div className="text-xs mt-1" style={{color:k.c||'#94a3b8'}}>{k.s}</div>}
                </div>
              ))}
            </div>
          </Card>

          {/* Donut por tarjeta — solo en "todas" */}
          {activaId==='todas' && compData.length>0 && (
            <Card padding="sm">
              <div className="text-slate-900 font-semibold text-xs mb-2">Por tarjeta</div>
              <ResponsiveContainer width="100%" height={100}>
                <PieChart>
                  <Pie data={compData} cx="50%" cy="50%" innerRadius={30} outerRadius={46} paddingAngle={3} dataKey="value">
                    {compData.map((d,i)=><Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={TT} formatter={(v:number)=>[fmt(v,m)]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1 mt-1">
                {compData.map(d=>(
                  <div key={d.name} className="flex justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full" style={{background:d.color}} />
                      <span className="text-[10px] text-slate-500 truncate max-w-[100px]">{d.name}</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-slate-700">{fmt(d.value,m)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

        </div>
      </div>

      {/* Modal nueva tarjeta */}
      <Modal open={showModal} onClose={()=>{setShowModal(false);setForm(FORM_INIT)}} title="Nueva tarjeta">
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Nombre</FieldLabel><input value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Ej: VISA Galicia" className="input-field" /></div>
          <div><FieldLabel>Banco / titular</FieldLabel><input value={form.banco} onChange={e=>setForm(p=>({...p,banco:e.target.value}))} placeholder="Ej: Galicia · Mati" className="input-field" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Monto</FieldLabel><input type="number" value={form.limite} onChange={e=>setForm(p=>({...p,limite:e.target.value}))} placeholder="0" className="input-field" /></div>
            <div><FieldLabel>Moneda</FieldLabel><select value={form.moneda} onChange={e=>setForm(p=>({...p,moneda:e.target.value as Moneda}))} className="input-field">{monedasPalette.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Titular</FieldLabel><select value={form.quien} onChange={e=>setForm(p=>({...p,quien:e.target.value as Quien}))} className="input-field"><option value="ambos">Ambos</option><option value="Mati">Mati</option><option value="Dani">Dani</option></select></div>
            <div><FieldLabel>Ícono</FieldLabel><input value={form.icono} onChange={e=>setForm(p=>({...p,icono:e.target.value}))} placeholder="V" maxLength={3} className="input-field" /></div>
          </div>
          <div><FieldLabel>Color</FieldLabel>
            <div className="flex gap-2 mt-1">
              {['#1A5E9E','#F54927','#7F77DD','#EF9F27','#D4537E','#1D9E75','#639922'].map(c=>(
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
      {/* ── Modal importar PDF tarjeta ── */}
      <Modal open={showPDFModal} onClose={()=>setShowPDFModal(false)} title="Importar resumen de tarjeta">
        {pdfStep==='upload' && (
          <div className="flex flex-col gap-4">
            <div>
              <FieldLabel>Tarjeta</FieldLabel>
              <select value={pdfTarjetaId||''} onChange={e=>setPdfTarjetaId(e.target.value)} className="input-field">
                <option value="">Seleccioná una tarjeta</option>
                {(tarjetas??[]).map(t=><option key={t.id} value={t.id}>{t.nombre} · {t.banco}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>Archivo PDF</FieldLabel>
              {iaDisponible === false && (
                <p className="text-xs text-slate-400 mb-1.5">Próximamente — todavía no está activada la lectura automática.</p>
              )}
              <input type="file" accept=".pdf" disabled={iaDisponible !== true}
                onChange={async e => {
                  const file = e.target.files?.[0]
                  if (!file || !pdfTarjetaId) return
                  setPdfLoading(true); setPdfError('')
                  try {
                    const base64 = await new Promise<string>((res,rej)=>{
                      const r = new FileReader()
                      r.onload = ()=>res((r.result as string).split(',')[1])
                      r.onerror = ()=>rej(new Error('Error leyendo archivo'))
                      r.readAsDataURL(file)
                    })
                    // Build learning context from previous corrections
                    const tarjetaActual = (tarjetas??[]).find(t=>t.id===pdfTarjetaId)
                    const comerciosCtx = comercios.length > 0
                      ? `\n\nREGLAS APRENDIDAS DE CORRECCIONES PREVIAS (usá estas categorías para estos comercios):\n` +
                        comercios.slice(0,50).map(co =>
                          `- "${co.descripcion_raw}" → descripcion_limpia: "${co.descripcion_limpia||co.descripcion_raw}", categoria: "${co.categoria}"`
                        ).join('\n')
                      : ''

                    const tarjetaCtx = tarjetaActual
                      ? `\n\nDATOS DE LA TARJETA:\n- Nombre: ${tarjetaActual.nombre}\n- Banco: ${tarjetaActual.banco}\n- Red: detectar del PDF (VISA/Mastercard/Amex)\n- Titular: ${tarjetaActual.quien}`
                      : ''

                    const resp = await fetch('/api/analizar-comprobante',{
                      method:'POST',
                      headers:{'Content-Type':'application/json'},
                      body: JSON.stringify({
                        base64, mediaType: 'application/pdf', esPdf: true, maxTokens: 4000,
                        prompt: `Extraé todas las transacciones de este resumen de tarjeta de crédito.${tarjetaCtx}${comerciosCtx}

Respondé SOLO con un JSON array, sin texto extra, sin backticks, sin markdown.
Cada transacción debe tener estos campos exactos:
{
  "descripcion": "nombre legible del comercio (no el código interno del extracto)",
  "descripcion_raw": "nombre exacto como aparece en el extracto",
  "categoria": "una de: Alimentación|Tecnología|Ropa|Hogar|Viajes|Entretenimiento|Salud|Otros",
  "fecha": "YYYY-MM-DD",
  "monto": número positivo,
  "moneda": "ARS" o "USD",
  "cuota_actual": número o null,
  "cuota_total": número o null,
  "tipo": "debito",
  "ultimos_4": "últimos 4 dígitos de la tarjeta si aparecen en el PDF, sino null",
  "red": "VISA|Mastercard|Amex|otra, detectado del PDF"
}
Solo incluí gastos/compras, no pagos ni resúmenes de cuenta.
Para el campo descripcion, usá el nombre real del negocio, no el código técnico del extracto.`
                      })
                    })
                    const data = await resp.json()
                    if (!resp.ok) throw new Error(data?.error || 'Error analizando el PDF')
                    const clean = (data.text||'').replace(/\`\`\`json|\`\`\`/g,'').trim()
                    const parsed = JSON.parse(clean)
                    setPdfTxns(parsed.map((t:any,i:number)=>({...t,id:i,selected:true,tarjeta_id:pdfTarjetaId})))
                    setPdfStep('review')
                  } catch(err:any){
                    setPdfError('No se pudo procesar el PDF: '+(err.message||'Error'))
                  } finally { setPdfLoading(false) }
                }}
                className="input-field py-2 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" />
            </div>
            {pdfLoading && <div className="text-center py-4 text-slate-400 text-sm">Analizando PDF con IA...</div>}
            {pdfError && <div className="text-red-500 text-sm bg-red-50 px-4 py-3 rounded-xl">{pdfError}</div>}
          </div>
        )}

        {pdfStep==='review' && (
          <div className="flex flex-col gap-4">
            <div className="text-slate-600 text-sm">{pdfTxns.filter(t=>t.selected).length} de {pdfTxns.length} transacciones seleccionadas</div>
            <div className="overflow-y-auto max-h-[50vh] flex flex-col gap-1.5">
              {pdfTxns.map((t,i)=>(
                <div key={i} className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${t.selected?'border-blue-200 bg-blue-50':'border-slate-100 bg-slate-50 opacity-50'}`}
                  onClick={()=>setPdfTxns(prev=>prev.map((x,j)=>j===i?{...x,selected:!x.selected}:x))}>
                  <input type="checkbox" checked={t.selected} onChange={()=>{}} className="w-4 h-4 accent-blue-700 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700 truncate">{t.descripcion}</div>
                    <div className="text-xs text-slate-400">{t.fecha} · {t.categoria}</div>
                    {t.descripcion_raw && t.descripcion_raw !== t.descripcion && <div className="text-[10px] text-slate-300 truncate">{t.descripcion_raw}</div>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select value={t.categoria}
                      onClick={e=>e.stopPropagation()}
                      onChange={e=>setPdfTxns(prev=>prev.map((x,j)=>j===i?{...x,categoria:e.target.value}:x))}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white cursor-pointer">
                      {['Alimentación','Tecnología','Ropa','Hogar','Viajes','Entretenimiento','Salud','Otros'].map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                    <span className={`font-mono font-bold text-sm ${t.moneda==='USD'?'text-blue-700':'text-red-600'}`}>
                      {t.moneda==='USD'?'US$':'$'}{Number(t.monto).toLocaleString('es-AR')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={()=>setPdfStep('upload')} className="btn-ghost flex-1">Volver</button>
              <button onClick={async()=>{
                setSavingPdf(true)
                try {
                  const {createClient}=await import('@/lib/supabase/client')
                  const sb=createClient()
                  const tarjetaActual = (tarjetas??[]).find(t=>t.id===pdfTarjetaId)
                  const toInsert = pdfTxns.filter(t=>t.selected).map(({id:_,selected:__,descripcion_raw:___,ultimos_4:____,red:_____,...t})=>t)
                  const {error}=await sb.from('tarjeta_transacciones').insert(toInsert)
                  if(error) throw error

                  // Guardar aprendizaje: cada transacción corregida
                  const { upsertTarjetaComercios } = await import('@/lib/queries')
                  const aprendizaje = pdfTxns.filter(t=>t.selected && t.descripcion_raw).map(t=>({
                    descripcion_raw: t.descripcion_raw || t.descripcion,
                    descripcion_limpia: t.descripcion,
                    categoria: t.categoria,
                    tarjeta_id: pdfTarjetaId,
                    ultimos_4: t.ultimos_4 || null,
                    red: t.red || null,
                    banco: tarjetaActual?.banco || null,
                    quien: tarjetaActual?.quien || null,
                  }))
                  if (aprendizaje.length > 0) {
                    await upsertTarjetaComercios(aprendizaje).catch(()=>{})
                    setComercios(prev => {
                      const map = new Map(prev.map(c=>[c.descripcion_raw, c]))
                      aprendizaje.forEach(a => map.set(a.descripcion_raw, {...a, id:'', user_id:'', created_at:'', updated_at:''}))
                      return [...map.values()]
                    })
                  }
                  setPdfStep('done')
                } catch(err:any){ setPdfError('Error guardando: '+(err.message||'')) }
                finally { setSavingPdf(false) }
              }} disabled={savingPdf||pdfTxns.filter(t=>t.selected).length===0}
                className="btn-primary flex-1 disabled:opacity-50">{savingPdf?'Guardando...':'Guardar transacciones'}</button>
            </div>
            {pdfError && <div className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-xl">{pdfError}</div>}
          </div>
        )}

        {pdfStep==='done' && (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">✓</div>
            <div className="text-slate-900 font-semibold text-lg mb-1">Transacciones importadas</div>
            <div className="text-slate-400 text-sm mb-5">Ya aparecen en la tabla de transacciones.</div>
            <button onClick={()=>{ setShowPDFModal(false); setPdfStep('upload'); setPdfTxns([]) }} className="btn-primary">Cerrar</button>
          </div>
        )}
      </Modal>

      <Modal open={showTxnModal} onClose={() => { setShowTxnModal(false); setTxnEditId(null) }} title="Editar transacción">
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Descripción</FieldLabel>
            <input value={txnForm.descripcion} onChange={e => setTxnForm(p => ({ ...p, descripcion: e.target.value }))} className="input-field" />
          </div>
          <div><FieldLabel>Categoría</FieldLabel>
            <select value={txnForm.categoria} onChange={e => setTxnForm(p => ({ ...p, categoria: e.target.value }))} className="input-field">
              {['Alimentación','Tecnología','Ropa','Hogar','Viajes','Entretenimiento','Salud','Otros'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Monto</FieldLabel>
              <input type="number" step="0.01" value={txnForm.monto} onChange={e => setTxnForm(p => ({ ...p, monto: e.target.value }))} className="input-field" />
            </div>
            <div><FieldLabel>Moneda</FieldLabel>
              <select value={txnForm.moneda} onChange={e => setTxnForm(p => ({ ...p, moneda: e.target.value as Moneda }))} className="input-field">
                {monedasPalette.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1"><FieldLabel>Fecha</FieldLabel>
              <FechaInput value={txnForm.fecha} onChange={iso => setTxnForm(p => ({ ...p, fecha: iso }))} />
            </div>
            <div><FieldLabel>Cuota actual</FieldLabel>
              <input type="number" value={txnForm.cuota_actual} onChange={e => setTxnForm(p => ({ ...p, cuota_actual: e.target.value }))} placeholder="—" className="input-field" />
            </div>
            <div><FieldLabel>Cuotas totales</FieldLabel>
              <input type="number" value={txnForm.cuota_total} onChange={e => setTxnForm(p => ({ ...p, cuota_total: e.target.value }))} placeholder="—" className="input-field" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleDeleteTxn} disabled={savingTxn} className="text-red-500 hover:text-red-600 border-none bg-transparent cursor-pointer text-sm px-2 disabled:opacity-50">Eliminar</button>
            <div className="flex-1" />
            <button onClick={() => { setShowTxnModal(false); setTxnEditId(null) }} className="btn-ghost">Cancelar</button>
            <button onClick={handleSaveTxn} disabled={savingTxn || !txnForm.descripcion || !txnForm.monto || !txnForm.fecha} className="btn-primary disabled:opacity-50">{savingTxn ? 'Guardando...' : 'Guardar cambios'}</button>
          </div>
        </div>
      </Modal>

    </div>
  )
}
