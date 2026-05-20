'use client'
import { useState, useMemo } from 'react'
import { useAppStore } from '@/store/appStore'
import { useDeudas, useEventosMes } from '@/hooks'
import { createDeuda, togglePagado, createEvento } from '@/lib/queries'
import { fmt, fmtDate } from '@/lib/utils/formatters'
import { MESES, MESES_CORTOS, TIPOS_EVENTO } from '@/lib/utils/constants'
import { PageHeader, Card, Modal, Badge, Table, Th, Td, LoadingSpinner, EmptyState, FieldLabel, ProgressBar, Tabs } from '@/components/ui'
import type { Moneda } from '@/types'

const HOY = new Date()
const HOY_DIA = HOY.getDate()
const HOY_MES = HOY.getMonth()
const HOY_AÑO = HOY.getFullYear()

export default function DeudasPage() {
  const { añoActivo } = useAppStore()
  const { data: deudas, loading: ld, refetch: refDeudas } = useDeudas()
  const [tab, setTab] = useState<'calendario'|'largo'>('calendario')
  const [calMes, setCalMes] = useState(HOY_MES)
  const [calAño, setCalAño] = useState(HOY_AÑO)
  const { data: eventos, loading: le, refetch: refEventos } = useEventosMes(calAño, calMes + 1)
  const [expanded, setExpanded] = useState<Record<string,boolean>>({})
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mostrarDeudas, setMostrarDeudas] = useState(false)
  const [form, setForm] = useState({ nombre:'', banco:'', total_original:'', cuota_mensual:'', fecha_inicio:new Date().toISOString().split('T')[0], fecha_vencimiento:'', cuota_actual:'1', cuota_total:'1', moneda:'ARS' as Moneda, color:'#5B3FA6' })

  const diasEnMes = new Date(calAño, calMes+1, 0).getDate()
  const primerDia = new Date(calAño, calMes, 1).getDay()
  const offsetLunes = primerDia===0 ? 6 : primerDia-1

  const eventosPorDia = useMemo(() => {
    const m: Record<number, typeof eventos> = {}
    ;(eventos??[]).forEach(e => { if (!m[e.dia]) m[e.dia]=[]; m[e.dia]!.push(e) })
    return m
  }, [eventos])

  const totalPendiente = (deudas??[]).reduce((s,d)=>s+d.pendiente,0)
  const cuotaMensual   = (deudas??[]).reduce((s,d)=>s+d.cuota_mensual,0)
  const venceMes       = (eventos??[]).filter(e=>e.tipo!=='ingreso'&&!e.pagado&&e.monto).reduce((s,e)=>s+(e.monto??0),0)
  const pagadoMes      = (eventos??[]).filter(e=>e.pagado&&e.monto).reduce((s,e)=>s+(e.monto??0),0)
  const pendientes     = (eventos??[]).filter(e=>!e.pagado).length

  const handleToggle = async (id:string, pagado:boolean) => {
    await togglePagado(id, !pagado); refEventos()
  }

  const handleSaveDeuda = async () => {
    if (!form.nombre||!form.total_original||!form.fecha_vencimiento) return
    setSaving(true)
    try {
      await createDeuda({
        nombre:form.nombre, banco:form.banco,
        total_original:parseFloat(form.total_original),
        pendiente:parseFloat(form.total_original),
        cuota_mensual:parseFloat(form.cuota_mensual)||0,
        tasa_interes:0, moneda:form.moneda,
        fecha_inicio:form.fecha_inicio, fecha_vencimiento:form.fecha_vencimiento,
        cuota_actual:parseInt(form.cuota_actual), cuota_total:parseInt(form.cuota_total),
        color:form.color, activa:true,
      })
      setShowModal(false); refDeudas()
    } catch(e){ console.error(e) } finally { setSaving(false) }
  }

  const navMes = (dir:number) => {
    let m = calMes+dir, a = calAño
    if (m<0){ m=11; a-- } else if (m>11){ m=0; a++ }
    setCalMes(m); setCalAño(a)
  }

  if (ld||le) return <LoadingSpinner />

  return (
    <div>
      <PageHeader title="Deudas" subtitle="Calendario de vencimientos y obligaciones activas"
        action={<button className="btn-primary" onClick={()=>setShowModal(true)}>+ Nueva deuda</button>} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          {l:'Deuda total',       v:fmt(totalPendiente), s:'Pendiente de pago',    c:'#5B3FA6'},
          {l:'Vence este mes',    v:fmt(venceMes),       s:`${pendientes} vencimientos`, c:'#C0392B'},
          {l:'Cuota mensual fija',v:fmt(cuotaMensual),  s:'Comprometido/mes',     c:'#E8A020'},
          {l:'Deudas activas',    v:String((deudas??[]).length), s:'Obligaciones registradas', c:'#1A5E9E'},
        ].map(k=>(
          <div key={k.l} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card">
            <div className="label mb-1">{k.l}</div>
            <div className="text-2xl font-bold font-mono" style={{color:k.c}}>{k.v}</div>
            <div className="text-slate-400 text-xs mt-1">{k.s}</div>
          </div>
        ))}
      </div>

      {/* Tabs + Resumen del mes en la misma línea */}
      <div className="flex items-center justify-between mb-5">
        <Tabs tabs={[{value:'calendario',label:'📅 Calendario'},{value:'largo',label:'📋 Largo plazo'}]} value={tab} onChange={v=>setTab(v as any)} />
        {tab==='calendario' && (
          <div className="flex items-center gap-5 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Total a pagar:</span>
              <span className="font-mono font-bold text-red-600">{fmt(venceMes)}</span>
            </div>
            <div className="w-px h-4 bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Pagado:</span>
              <span className="font-mono font-bold text-emerald-600">{fmt(pagadoMes)}</span>
            </div>
            <div className="w-px h-4 bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Pendiente:</span>
              <span className="font-mono font-bold text-red-600">{fmt(venceMes - pagadoMes)}</span>
            </div>
            <div className="w-px h-4 bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Sin monto:</span>
              <span className="font-mono font-bold text-amber-600">{(eventos??[]).filter(e=>!e.monto).length} eventos</span>
            </div>
          </div>
        )}
      </div>

      <div>
        {tab==='calendario' && (
          <div className="grid grid-cols-2 gap-5">

            {/* COLUMNA IZQUIERDA — Próximos vencimientos */}
            <Card>
              <div className="text-slate-900 font-semibold text-sm mb-3">Próximos vencimientos</div>
              {(eventos??[]).filter(e=>!e.pagado&&e.tipo!=='ingreso').sort((a,b)=>a.dia-b.dia).slice(0,8).length===0 ? (
                <div className="text-slate-400 text-xs text-center py-4">Sin pendientes 🎉</div>
              ) : (eventos??[]).filter(e=>!e.pagado&&e.tipo!=='ingreso').sort((a,b)=>a.dia-b.dia).slice(0,8).map(ev=>{
                const t = TIPOS_EVENTO[ev.tipo]||TIPOS_EVENTO.egreso
                return (
                  <div key={ev.id} className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
                    <div className="w-9 h-9 rounded-lg flex flex-col items-center justify-center flex-shrink-0" style={{background:t.color+'18'}}>
                      <span className="text-sm font-bold font-mono leading-none" style={{color:t.color}}>{ev.dia}</span>
                      <span className="text-[8px] font-bold uppercase" style={{color:t.color}}>{MESES_CORTOS[calMes]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700 truncate">{ev.descripcion}</div>
                      <div className="text-xs text-slate-400">{t.label}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-mono font-bold text-red-600">{ev.monto?fmt(ev.monto):'-'}</div>
                    </div>
                    <button onClick={()=>handleToggle(ev.id,ev.pagado)}
                      className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 cursor-pointer transition-all ${ev.pagado?'bg-emerald-600 border-emerald-600 text-white':'border-slate-300 bg-transparent'}`}>
                      {ev.pagado&&<span className="text-[10px]">✓</span>}
                    </button>
                  </div>
                )
              })}
            </Card>

            {/* COLUMNA DERECHA — Calendario */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <button onClick={()=>navMes(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer">‹</button>
                  <span className="font-semibold text-slate-900 min-w-[160px] text-center">{MESES[calMes]} {calAño}</span>
                  <button onClick={()=>navMes(1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer">›</button>
                </div>
                <div className="flex gap-3 flex-wrap">
                  {Object.entries(TIPOS_EVENTO).map(([k,v])=>(
                    <div key={k} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-sm" style={{background:v.color}} />
                      <span className="text-slate-400 text-xs">{v.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d=>(
                  <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase py-1">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({length:offsetLunes}).map((_,i)=><div key={`e${i}`} className="min-h-[72px]" />)}
                {Array.from({length:diasEnMes}).map((_,i)=>{
                  const dia = i+1
                  const isHoy = dia===HOY_DIA && calMes===HOY_MES && calAño===HOY_AÑO
                  const isPast = new Date(calAño,calMes,dia) < new Date(HOY_AÑO,HOY_MES,HOY_DIA)
                  const dayEvs = eventosPorDia[dia]??[]
                  const visible = dayEvs.slice(0,3)
                  const extra = dayEvs.length-3
                  return (
                    <div key={dia} className={`min-h-[72px] rounded-lg p-1.5 border transition-all ${isHoy?'bg-blue-50 border-blue-200':'border-transparent'} ${dayEvs.length>0?'hover:bg-slate-50 cursor-pointer':''} ${isPast&&!isHoy?'opacity-50':''}`}>
                      <div className={`text-xs font-bold mb-1 ${isHoy?'text-blue-700':'text-slate-500'}`}>
                        {dia}{isHoy&&<span className="ml-1 text-[8px] bg-blue-700 text-white rounded px-1">hoy</span>}
                      </div>
                      {visible.map(ev=>{
                        const t = TIPOS_EVENTO[ev.tipo]||TIPOS_EVENTO.egreso
                        return (
                          <div key={ev.id} onClick={()=>handleToggle(ev.id,ev.pagado)}
                            className={`text-[9px] font-medium px-1 py-0.5 rounded mb-0.5 truncate cursor-pointer transition-opacity ${ev.pagado?'opacity-40 line-through':''}`}
                            style={{background:t.color+'18',color:t.color}}>
                            {t.icon} {ev.descripcion}
                          </div>
                        )
                      })}
                      {extra>0 && <div className="text-[9px] text-slate-400">+{extra} más</div>}
                    </div>
                  )
                })}
              </div>
            </Card>

          </div>
        )}

        {tab==='largo' && (
          <div>
            {(deudas??[]).length===0 ? (
              <EmptyState icon="📋" title="Sin deudas registradas" description="Agregá tu primera deuda para hacer seguimiento." />
            ) : (
              <>
                {/* Toggle deudas del mes */}
                <div className="flex items-center justify-between mb-4">
                  <span className="text-slate-500 text-sm">Deudas activas — {(deudas??[]).length} registradas</span>
                  <button
                    onClick={()=>setMostrarDeudas(p=>!p)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium cursor-pointer transition-all ${mostrarDeudas?'bg-slate-900 border-slate-900 text-white':'bg-white border-slate-200 text-slate-600 hover:border-slate-400'}`}>
                    {mostrarDeudas ? '👁 Ocultar deudas del mes' : '👁 Ver deudas del mes'}
                  </button>
                </div>

                {/* Deudas del mes — colapsable */}
                <div className={`overflow-hidden transition-all duration-300 ${mostrarDeudas?'max-h-[2000px] opacity-100 mb-5':'max-h-0 opacity-0'}`}>
                  <div className="grid grid-cols-2 gap-4">
                    {(eventos??[]).filter(e=>e.tipo!=='ingreso').sort((a,b)=>a.dia-b.dia).map(ev=>{
                      const t = TIPOS_EVENTO[ev.tipo]||TIPOS_EVENTO.egreso
                      return (
                        <div key={ev.id} className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3">
                          <div className="w-9 h-9 rounded-lg flex flex-col items-center justify-center flex-shrink-0" style={{background:t.color+'18'}}>
                            <span className="text-sm font-bold font-mono leading-none" style={{color:t.color}}>{ev.dia}</span>
                            <span className="text-[8px] font-bold uppercase" style={{color:t.color}}>{MESES_CORTOS[calMes]}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-700 truncate">{ev.descripcion}</div>
                            <div className="text-xs text-slate-400">{t.label}</div>
                          </div>
                          <div className="text-sm font-mono font-bold text-red-600">{ev.monto?fmt(ev.monto):'-'}</div>
                          <button onClick={()=>handleToggle(ev.id,ev.pagado)}
                            className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 cursor-pointer transition-all ${ev.pagado?'bg-emerald-600 border-emerald-600 text-white':'border-slate-300 bg-transparent'}`}>
                            {ev.pagado&&<span className="text-[10px]">✓</span>}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Deudas largo plazo */}
                <div className="grid grid-cols-2 gap-5">
                  {(deudas??[]).map(d=>{
                    const pagado = d.total_original - d.pendiente
                    const pct = Math.round((pagado/d.total_original)*100)
                    const isExp = expanded[d.id]
                    return (
                      <Card key={d.id}>
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <div className="text-lg font-semibold text-slate-900">{d.nombre}</div>
                            <div className="text-slate-400 text-sm">{d.banco}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold font-mono" style={{color:d.color}}>{fmt(d.pendiente, d.moneda as Moneda)}</div>
                            <div className="text-slate-400 text-xs">pendiente</div>
                          </div>
                        </div>
                        <ProgressBar value={pct} color={d.color} height={6} />
                        <div className="flex justify-between mt-1.5 mb-4">
                          <span className="text-slate-400 text-xs">Pagado: {fmt(pagado, d.moneda as Moneda)}</span>
                          <span className="text-xs font-bold" style={{color:d.color}}>{pct}% completado</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-100">
                          <div><div className="label mb-0.5">Cuota</div><div className="text-sm font-mono font-bold text-slate-700">{fmt(d.cuota_mensual)}/mes</div></div>
                          <div><div className="label mb-0.5">Progreso</div><div className="text-sm font-mono font-bold text-slate-700">{d.cuota_actual}/{d.cuota_total}</div></div>
                          <div><div className="label mb-0.5">Vencimiento</div><div className="text-sm font-mono font-bold text-slate-700">{d.fecha_vencimiento?.slice(0,7)}</div></div>
                        </div>
                        <button onClick={()=>setExpanded(p=>({...p,[d.id]:!isExp}))}
                          className="w-full text-xs text-slate-400 hover:text-slate-600 mt-3 pt-3 border-t border-slate-50 border-none bg-transparent cursor-pointer">
                          {isExp?'▲ Ocultar historial':'▼ Ver historial de pagos'}
                        </button>
                        {isExp && (
                          <div className="mt-3 pt-3 border-t border-slate-100">
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Historial</div>
                            <div className="text-slate-400 text-xs text-center py-3">Sin pagos registrados aún</div>
                          </div>
                        )}
                      </Card>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={()=>setShowModal(false)} title="Nueva deuda">
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Nombre</FieldLabel><input value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Ej: Artefactos Dpto" className="input-field" /></div>
          <div><FieldLabel>Banco / descripción</FieldLabel><input value={form.banco} onChange={e=>setForm(p=>({...p,banco:e.target.value}))} placeholder="Ej: Cuotas casa" className="input-field" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Monto total</FieldLabel><input type="number" value={form.total_original} onChange={e=>setForm(p=>({...p,total_original:e.target.value}))} placeholder="0" className="input-field" /></div>
            <div><FieldLabel>Cuota mensual</FieldLabel><input type="number" value={form.cuota_mensual} onChange={e=>setForm(p=>({...p,cuota_mensual:e.target.value}))} placeholder="0" className="input-field" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Cuota actual</FieldLabel><input type="number" value={form.cuota_actual} onChange={e=>setForm(p=>({...p,cuota_actual:e.target.value}))} className="input-field" /></div>
            <div><FieldLabel>Total cuotas</FieldLabel><input type="number" value={form.cuota_total} onChange={e=>setForm(p=>({...p,cuota_total:e.target.value}))} className="input-field" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Fecha inicio</FieldLabel><input type="date" value={form.fecha_inicio} onChange={e=>setForm(p=>({...p,fecha_inicio:e.target.value}))} className="input-field" /></div>
            <div><FieldLabel>Fecha vencimiento</FieldLabel><input type="date" value={form.fecha_vencimiento} onChange={e=>setForm(p=>({...p,fecha_vencimiento:e.target.value}))} className="input-field" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Moneda</FieldLabel><select value={form.moneda} onChange={e=>setForm(p=>({...p,moneda:e.target.value as Moneda}))} className="input-field">{['ARS','USD','EUR'].map(c=><option key={c} value={c}>{c}</option>)}</select></div>
            <div><FieldLabel>Color</FieldLabel>
              <div className="flex gap-2 mt-1">
                {['#5B3FA6','#C0392B','#1D9E75','#2D7D2D','#1A5E9E','#E8A020','#D4537E'].map(c=>(
                  <button key={c} onClick={()=>setForm(p=>({...p,color:c}))} className={`w-7 h-7 rounded-full border-2 cursor-pointer transition-all ${form.color===c?'border-slate-900 scale-110':'border-transparent'}`} style={{background:c}} />
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={()=>setShowModal(false)} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={handleSaveDeuda} disabled={saving||!form.nombre||!form.total_original} className="btn-primary flex-1 disabled:opacity-50">{saving?'Guardando...':'Guardar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
