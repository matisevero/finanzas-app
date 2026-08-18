'use client'
import { useState, useMemo } from 'react'
import { useAppStore, useMonedasDisponibles } from '@/store/appStore'
import { useMetas, useAhorros, useAllIngresos, useAllEgresos, useEtiquetas, useEgresoEtiquetas, useIngresoEtiquetas } from '@/hooks'
import { createMeta, updateMeta, deleteMeta, createAhorro, updateAhorro, deleteAhorro, archivarAhorro } from '@/lib/queries'
import { fmt } from '@/lib/utils/formatters'
import { calcularMeta } from '@/lib/utils/calculations'
import { META_COLORS, ICONOS_GENERALES } from '@/lib/utils/constants'
import { PageHeader, Card, Modal, LoadingSpinner, EmptyState, FieldLabel, ProgressBar } from '@/components/ui'
import FechaInput from '@/components/ui/FechaInput'
import MontoInput from '@/components/ui/MontoInput'
import { fmtFull, fmtDate } from '@/lib/utils/formatters'
import { TIPOS_INGRESO, TIPOS_EGRESO } from '@/lib/utils/constants'
import type { Moneda, Ahorro } from '@/types'

const FORM_INIT = { nombre:'', descripcion:'', monto_objetivo:'', monto_actual:'0', moneda:'USD' as Moneda, fecha_limite:'', icono:'🎯', color:'#1A5E9E' }
const AHORRO_FORM_INIT = { nombre:'', categoria:'', moneda:'ARS' as Moneda, icono:'💰', color:'#1A5E9E' }

export default function AhorrosPage() {
  const [tab, setTab] = useState<'metas'|'general'>('metas')
  const { monedaPrincipal: m } = useAppStore()
  const monedasPalette = useMonedasDisponibles()
  const { data: metas, loading, refetch } = useMetas()
  const { data: ahorros, loading: loadingAhorros, refetch: refetchAhorros } = useAhorros()
  const { data: allIngresos, loading: liAll } = useAllIngresos()
  const { data: allEgresos, loading: leAll } = useAllEgresos()
  const { data: etiquetas, refetch: refetchEtiquetas } = useEtiquetas()
  const { data: egresoEtiquetas } = useEgresoEtiquetas()
  const { data: ingresoEtiquetas } = useIngresoEtiquetas()
  const [expandidoId, setExpandidoId] = useState<string|null>(null)
  const [showModal, setShowModal]   = useState(false)
  const [editId, setEditId]         = useState<string|null>(null)
  const [saving, setSaving]         = useState(false)
  const [form, setForm]             = useState(FORM_INIT)
  const [selIcon, setSelIcon]       = useState('🎯')
  const [selColor, setSelColor]     = useState('#1A5E9E')
  const [addMontos, setAddMontos]   = useState<Record<string,string>>({})

  const [showAhorroModal, setShowAhorroModal] = useState(false)
  const [ahorroEditId, setAhorroEditId]       = useState<string|null>(null)
  const [ahorroForm, setAhorroForm]           = useState(AHORRO_FORM_INIT)
  const [savingAhorro, setSavingAhorro]       = useState(false)
  const [ajusteAbierto, setAjusteAbierto]     = useState<string|null>(null)
  const [ajusteValor, setAjusteValor]         = useState('')

  const openNewAhorro = () => { setAhorroEditId(null); setAhorroForm(AHORRO_FORM_INIT); setShowAhorroModal(true) }
  const openEditAhorro = (a: Ahorro) => {
    setAhorroEditId(a.id)
    setAhorroForm({ nombre:a.nombre, categoria:a.categoria, moneda:a.moneda as Moneda, icono:a.icono, color:a.color })
    setShowAhorroModal(true)
  }
  const handleSaveAhorro = async () => {
    if (!ahorroForm.nombre || !ahorroForm.categoria) return
    setSavingAhorro(true)
    try {
      if (ahorroEditId) await updateAhorro(ahorroEditId, ahorroForm)
      else await createAhorro({ ...ahorroForm, ajuste_manual: 0 })
      setShowAhorroModal(false); refetchAhorros()
    } catch(e){ console.error(e) } finally { setSavingAhorro(false) }
  }
  const handleDeleteAhorro = async (id: string) => {
    if (!confirm('¿Eliminar este ahorro? Esto no borra tus ingresos/egresos, solo la card.')) return
    await deleteAhorro(id); refetchAhorros()
  }
  const etiquetaDeAhorro = (a: Ahorro) => (etiquetas ?? []).find(e => e.tipo === 'ahorro' && e.ahorro_id === a.id)

  const movimientosEtiquetados = (a: Ahorro) => {
    const et = etiquetaDeAhorro(a)
    if (!et) return []
    const egresoIds  = new Set((egresoEtiquetas ?? []).filter(r => r.etiqueta_id === et.id).map(r => r.egreso_id))
    const ingresoIds = new Set((ingresoEtiquetas ?? []).filter(r => r.etiqueta_id === et.id).map(r => r.ingreso_id))
    const egr = (allEgresos ?? []).filter(e => egresoIds.has(e.id)).map(e => ({ tipo: 'egreso' as const, id: e.id, fecha: e.fecha, descripcion: e.descripcion, categoria: e.categoria, monto: e.monto, moneda: e.moneda as Moneda }))
    const ing = (allIngresos ?? []).filter(i => ingresoIds.has(i.id)).map(i => ({ tipo: 'ingreso' as const, id: i.id, fecha: i.fecha, descripcion: i.descripcion, categoria: i.tipo, monto: i.monto, moneda: i.moneda as Moneda }))
    return [...egr, ...ing].sort((x,y)=>y.fecha.localeCompare(x.fecha))
  }

  const handleArchivarAhorro = async (a: Ahorro, archivar: boolean) => {
    await archivarAhorro(a.id, archivar)
    refetchEtiquetas()
  }

  const handleAjustar = async (a: Ahorro, signo: 1|-1) => {
    const val = parseFloat(ajusteValor||'0')
    if (!val) return
    await updateAhorro(a.id, { ajuste_manual: a.ajuste_manual + signo*val })
    setAjusteValor(''); setAjusteAbierto(null); refetchAhorros()
  }

  // Ahorro/inversión: matchea por categoría exacta del item (tipo en ingresos, categoria en egresos),
  // y por moneda — el "automático" nunca es negativo, igual que en el widget del Dashboard.
  const automaticoDe = (a: Ahorro) => {
    const ing = (allIngresos ?? []).filter(i => i.tipo === a.categoria && i.moneda === a.moneda).reduce((s,i)=>s+i.monto,0)
    const egr = (allEgresos ?? []).filter(e => e.categoria === a.categoria && e.moneda === a.moneda).reduce((s,e)=>s+e.monto,0)
    return Math.max(0, ing - egr)
  }

  const openNew = () => {
    setEditId(null); setForm(FORM_INIT); setSelIcon('🎯'); setSelColor('#1A5E9E'); setShowModal(true)
  }

  const openEdit = (meta: typeof metas extends (infer T)[]|null ? T : never) => {
    if (!meta) return
    setEditId(meta.id)
    setForm({ nombre:meta.nombre, descripcion:meta.descripcion||'', monto_objetivo:String(meta.monto_objetivo), monto_actual:String(meta.monto_actual), moneda:meta.moneda as Moneda, fecha_limite:meta.fecha_limite, icono:meta.icono, color:meta.color })
    setSelIcon(meta.icono); setSelColor(meta.color); setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.nombre||!form.monto_objetivo||!form.fecha_limite) return
    setSaving(true)
    try {
      const payload = { nombre:form.nombre, descripcion:form.descripcion||undefined, monto_objetivo:parseFloat(form.monto_objetivo), monto_actual:parseFloat(form.monto_actual)||0, moneda:form.moneda, fecha_limite:form.fecha_limite, icono:selIcon, color:selColor, completada:false }
      if (editId) await updateMeta(editId, payload)
      else await createMeta(payload)
      setShowModal(false); refetch()
    } catch(e){ console.error(e) } finally { setSaving(false) }
  }

  const handleDelete = async (id:string) => {
    if (!confirm('¿Eliminar esta meta?')) return
    await deleteMeta(id); refetch()
  }

  const handleAgregar = async (id:string) => {
    const val = parseFloat(addMontos[id]||'0')
    if (!val) return
    const meta = (metas??[]).find(x=>x.id===id)
    if (!meta) return
    const nuevo = Math.min(meta.monto_objetivo, meta.monto_actual+val)
    await updateMeta(id, { monto_actual:nuevo, completada: nuevo>=meta.monto_objetivo })
    setAddMontos(p=>({...p,[id]:''})); refetch()
  }

  // KPIs globales (todo en ARS equivalente)
  const kpis = useMemo(()=>{
    const total   = (metas??[]).length
    const compl   = (metas??[]).filter(m=>m.completada).length
    const proxMeses = Math.min(...(metas??[]).filter(m=>!m.completada).map(m=>calcularMeta(m.monto_objetivo,m.monto_actual,m.fecha_limite).meses).filter(m=>m>0))
    const proxMeta  = (metas??[]).find(m=>!m.completada&&calcularMeta(m.monto_objetivo,m.monto_actual,m.fecha_limite).meses===proxMeses)
    return { total, compl, proxMeses:isFinite(proxMeses)?proxMeses:null, proxMeta }
  }, [metas])

  const sorted = useMemo(()=>[...(metas??[])].sort((a,b)=>(b.monto_actual/b.monto_objetivo)-(a.monto_actual/a.monto_objetivo)), [metas])

  if ((loading && !metas) || (loadingAhorros && !ahorros)) return <LoadingSpinner />

  return (
    <div>
      <PageHeader title="Ahorros" subtitle={tab==='metas' ? 'Tus objetivos financieros y el camino para llegar' : 'Todo lo que tenés ahorrado e invertido, por categoría'}
        action={tab==='metas'
          ? <button className="btn-primary" onClick={openNew}>+ Nueva meta</button>
          : <button className="btn-primary" onClick={openNewAhorro}>+ Nuevo ahorro</button>} />

      <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl mb-6 max-w-[300px]">
        {(['metas','general'] as const).map(t => (
          <button key={t} onClick={()=>setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all border-none cursor-pointer ${tab===t?'bg-white text-slate-900 shadow-sm':'bg-transparent text-slate-500'}`}>
            {t==='metas'?'Metas':'Ahorro general'}
          </button>
        ))}
      </div>

      {tab==='metas' && <>
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          {l:'Metas activas',      v:String(kpis.total),              s:kpis.compl>0?kpis.compl+' completadas':'',          c:'#1A5E9E'},
          {l:'Completadas',        v:`${kpis.compl}/${kpis.total}`,   s:'Objetivos alcanzados',                              c:'#40B046'},
          {l:'Próximo vencimiento',v:kpis.proxMeses!=null?kpis.proxMeses+' meses':'—', s:kpis.proxMeta?.nombre||'Sin metas activas', c:'#E8A020'},
          {l:'En progreso',        v:String((metas??[]).filter(m=>!m.completada).length), s:'Metas sin completar',           c:'#5B3FA6'},
        ].map(k=>(
          <div key={k.l} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card">
            <div className="label mb-1">{k.l}</div>
            <div className="text-2xl font-bold font-mono" style={{color:k.c}}>{k.v}</div>
            <div className="text-slate-400 text-xs mt-1">{k.s}</div>
          </div>
        ))}
      </div>

      {(metas??[]).length===0 ? (
        <EmptyState icon="🎯" title="Sin metas registradas" description="Creá tu primera meta de ahorro para empezar a hacer seguimiento." action={<button className="btn-primary" onClick={openNew}>+ Nueva meta</button>} />
      ) : (
        <>
          {/* Grid de metas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            {(metas??[]).map(meta=>{
              const { pct, meses, cuota, falta } = calcularMeta(meta.monto_objetivo, meta.monto_actual, meta.fecha_limite)
              const mon = meta.moneda as Moneda
              return (
                <div key={meta.id} className="group bg-white border-2 rounded-2xl p-6 shadow-card relative overflow-hidden"
                  style={{borderColor:meta.completada?'#86efac':meta.color+'22'}}>
                  <div className="absolute top-0 right-0 w-20 h-20 rounded-bl-[80px]" style={{background:meta.color+'08'}} />

                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{meta.icono}</span>
                      <div>
                        <div className="text-lg font-semibold text-slate-900">{meta.nombre}</div>
                        {meta.descripcion&&<div className="text-slate-400 text-sm">{meta.descripcion}</div>}
                      </div>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity select-none">
                      <button onClick={()=>openEdit(meta)} className="text-slate-300 hover:text-slate-600 text-sm border-none bg-transparent cursor-pointer">✎</button>
                      <button onClick={()=>handleDelete(meta.id)} className="text-slate-300 hover:text-red-500 text-sm border-none bg-transparent cursor-pointer">✕</button>
                    </div>
                  </div>

                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-3xl font-bold font-mono" style={{color:meta.color}}>{fmt(meta.monto_actual,mon)}</span>
                    <span className="text-slate-400 text-sm">de</span>
                    <span className="text-slate-600 font-mono font-semibold">{fmt(meta.monto_objetivo,mon)}</span>
                  </div>

                  <ProgressBar value={pct} color={meta.color} height={8} />
                  <div className="flex justify-between mt-1.5 mb-4">
                    <span className="text-slate-400 text-xs">Falta {fmt(falta,mon)}</span>
                    <span className="text-xs font-bold" style={{color:meta.completada?'#40B046':meta.color}}>
                      {meta.completada?'✓ Completada':pct+'% alcanzado'}
                    </span>
                  </div>

                  {!meta.completada ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-100 mb-4">
                        <div><div className="label mb-0.5">Meses restantes</div><div className="text-sm font-mono font-bold text-slate-700">{meses>0?meses+' meses':'Vencida'}</div></div>
                        <div><div className="label mb-0.5">Ahorro mensual</div><div className="text-sm font-mono font-bold" style={{color:meta.color}}>{meses>0?fmt(cuota,mon):'—'}</div></div>
                        <div><div className="label mb-0.5">Fecha límite</div><div className="text-sm font-mono font-bold text-slate-700">{meta.fecha_limite.slice(0,7)}</div></div>
                      </div>
                      <div className="flex gap-2">
                        <MontoInput value={addMontos[meta.id]||''} onChange={raw=>setAddMontos(p=>({...p,[meta.id]:raw}))}
                          placeholder={`Agregar ${mon}...`} className="flex-1 text-sm py-2" />
                        <button onClick={()=>handleAgregar(meta.id)} className="btn-primary py-2 px-4 text-sm flex-shrink-0" style={{background:meta.color}}>
                          + Agregar
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 pt-2">
                      <span className="bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-2 rounded-full">🎉 ¡Meta alcanzada!</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Ranking comparado */}
          <Card>
            <div className="text-slate-900 font-semibold text-[15px] mb-4">Progreso comparado</div>
            {sorted.map(meta=>{
              const { pct, meses } = calcularMeta(meta.monto_objetivo, meta.monto_actual, meta.fecha_limite)
              return (
                <div key={meta.id} className="mb-4 last:mb-0">
                  <div className="flex justify-between items-center mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{meta.icono}</span>
                      <span className="text-sm font-medium text-slate-700">{meta.nombre}</span>
                      <span className="text-xs text-slate-400">({meta.moneda})</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400 text-xs">{meses>0?meses+' meses':meta.completada?'Completada':'Vencida'}</span>
                      <span className="text-sm font-bold font-mono" style={{color:meta.color}}>{pct}%</span>
                    </div>
                  </div>
                  <ProgressBar value={pct} color={meta.color} height={5} />
                </div>
              )
            })}
          </Card>
        </>
      )}
      </>}

      {tab==='general' && <>
        {(ahorros??[]).length===0 ? (
          <EmptyState icon="💰" title="Sin categorías de ahorro" description="Creá tu primera categoría (ej. Inversiones pesos) para empezar a ver cuánto tenés ahorrado e invertido en total." action={<button className="btn-primary" onClick={openNewAhorro}>+ Nuevo ahorro</button>} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {(ahorros??[]).map(a=>{
              const auto  = automaticoDe(a)
              const total = Math.max(0, auto + a.ajuste_manual)
              const et = etiquetaDeAhorro(a)
              const archivado = et?.estado === 'archivada'
              const movs = movimientosEtiquetados(a)
              return (
                <div key={a.id} className="group bg-white border-2 rounded-2xl p-6 shadow-card relative overflow-hidden" style={{borderColor:a.color+'22', opacity: archivado ? 0.6 : 1}}>
                  <div className="absolute top-0 right-0 w-20 h-20 rounded-bl-[80px]" style={{background:a.color+'08'}} />
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{a.icono}</span>
                      <div>
                        <div className="text-lg font-semibold text-slate-900 flex items-center gap-2">{a.nombre}{archivado && <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Archivado</span>}</div>
                        <div className="text-slate-400 text-sm">{a.categoria} · {a.moneda}</div>
                      </div>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity select-none">
                      <button onClick={()=>openEditAhorro(a)} className="text-slate-300 hover:text-slate-600 text-sm border-none bg-transparent cursor-pointer">✎</button>
                      <button onClick={()=>handleArchivarAhorro(a, !archivado)} className="text-slate-300 hover:text-slate-600 text-sm border-none bg-transparent cursor-pointer">{archivado?'↺':'🗄'}</button>
                      <button onClick={()=>handleDeleteAhorro(a.id)} className="text-slate-300 hover:text-red-500 text-sm border-none bg-transparent cursor-pointer">✕</button>
                    </div>
                  </div>

                  <div className="text-3xl font-bold font-mono mb-4" style={{color:a.color}}>{fmt(total, a.moneda as Moneda)}</div>

                  <div className="flex justify-between text-xs text-slate-500 pt-3 border-t border-slate-100">
                    <span>Automático (ingresos/egresos)</span>
                    <span className="font-mono font-semibold text-slate-700">{fmt(auto, a.moneda as Moneda)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 mt-1.5 mb-4">
                    <span>Ajuste manual</span>
                    <span className="font-mono font-semibold text-slate-700">{a.ajuste_manual>=0?'+':''}{fmt(a.ajuste_manual, a.moneda as Moneda)}</span>
                  </div>

                  {ajusteAbierto===a.id ? (
                    <div className="flex gap-2">
                      <MontoInput value={ajusteValor} onChange={raw=>setAjusteValor(raw)} placeholder={`Monto ${a.moneda}...`} className="flex-1 text-sm py-2" />
                      <button onClick={()=>handleAjustar(a,1)} className="btn-primary py-2 px-3 text-sm flex-shrink-0" style={{background:'#40B046'}}>+</button>
                      <button onClick={()=>handleAjustar(a,-1)} className="btn-primary py-2 px-3 text-sm flex-shrink-0" style={{background:'#F54927'}}>−</button>
                      <button onClick={()=>{setAjusteAbierto(null);setAjusteValor('')}} className="btn-ghost py-2 px-3 text-sm flex-shrink-0">✕</button>
                    </div>
                  ) : (
                    <button onClick={()=>setAjusteAbierto(a.id)} className="btn-ghost w-full py-2 text-sm">+/− Ajustar manualmente</button>
                  )}

                  <button onClick={()=>setExpandidoId(v=>v===a.id?null:a.id)} className="text-slate-400 hover:text-slate-600 text-xs border-none bg-transparent cursor-pointer mt-3 px-0">
                    {expandidoId===a.id?'▾':'▸'} Movimientos etiquetados ({movs.length})
                  </button>
                  {expandidoId===a.id && (
                    <div className="mt-2 pt-2 border-t border-slate-100">
                      {movs.length===0 ? (
                        <div className="text-slate-400 text-xs py-2">Sin movimientos asociados — es solo informativo, no afecta el saldo de arriba.</div>
                      ) : (
                        <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                          {movs.map(mv=>(
                            <div key={`${mv.tipo}-${mv.id}`} className="flex justify-between items-center text-xs py-1">
                              <span className="text-slate-500 truncate">{fmtDate(mv.fecha)} · {mv.descripcion || (mv.tipo==='egreso' ? (TIPOS_EGRESO[mv.categoria as keyof typeof TIPOS_EGRESO]?.label ?? mv.categoria) : (TIPOS_INGRESO[mv.categoria as keyof typeof TIPOS_INGRESO]?.label ?? mv.categoria))}</span>
                              <span className={`font-mono font-semibold flex-shrink-0 ml-2 ${mv.tipo==='egreso'?'text-red-600':'text-emerald-700'}`}>{mv.tipo==='egreso'?'-':'+'}{fmtFull(mv.monto, mv.moneda)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </>}

      {/* Modal meta */}
      <Modal open={showModal} onClose={()=>setShowModal(false)} title={editId?'Editar meta':'Nueva meta'}>
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Nombre</FieldLabel><input value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Ej: Viaje a Europa" className="input-field" /></div>
          <div><FieldLabel>Descripción (opcional)</FieldLabel><input value={form.descripcion} onChange={e=>setForm(p=>({...p,descripcion:e.target.value}))} placeholder="Para qué es este ahorro" className="input-field" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Monto objetivo</FieldLabel><MontoInput value={form.monto_objetivo} onChange={raw=>setForm(p=>({...p,monto_objetivo:raw}))} placeholder="0" /></div>
            <div><FieldLabel>Ya ahorrado</FieldLabel><MontoInput value={form.monto_actual} onChange={raw=>setForm(p=>({...p,monto_actual:raw}))} placeholder="0" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Moneda</FieldLabel>
              <select value={form.moneda} onChange={e=>setForm(p=>({...p,moneda:e.target.value as Moneda}))} className="input-field">
                {monedasPalette.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><FieldLabel>Fecha límite</FieldLabel><FechaInput value={form.fecha_limite} onChange={iso=>setForm(p=>({...p,fecha_limite:iso}))} /></div>
          </div>
          <div><FieldLabel>Ícono</FieldLabel>
            <div className="flex flex-wrap gap-2 mt-1">
              {ICONOS_GENERALES.slice(0,16).map(ic=>(
                <button key={ic} onClick={()=>setSelIcon(ic)} className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg cursor-pointer border-2 transition-all ${selIcon===ic?'border-blue-700 bg-blue-50':'border-slate-200 bg-slate-50'}`}>{ic}</button>
              ))}
            </div>
          </div>
          <div><FieldLabel>Color</FieldLabel>
            <div className="flex gap-2 mt-1">
              {META_COLORS.map(c=>(
                <button key={c} onClick={()=>setSelColor(c)} className={`w-7 h-7 rounded-full border-2 cursor-pointer transition-all ${selColor===c?'border-slate-900 scale-110':'border-transparent'}`} style={{background:c}} />
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={()=>setShowModal(false)} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={handleSave} disabled={saving||!form.nombre||!form.monto_objetivo||!form.fecha_limite} className="btn-primary flex-1 disabled:opacity-50">{saving?'Guardando...':'Guardar'}</button>
          </div>
        </div>
      </Modal>

      {/* Modal ahorro */}
      <Modal open={showAhorroModal} onClose={()=>setShowAhorroModal(false)} title={ahorroEditId?'Editar ahorro':'Nuevo ahorro'}>
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Nombre</FieldLabel><input value={ahorroForm.nombre} onChange={e=>setAhorroForm(p=>({...p,nombre:e.target.value}))} placeholder="Ej: Inversiones en pesos" className="input-field" /></div>
          <div>
            <FieldLabel>Categoría (debe coincidir con la de Ingresos/Egresos)</FieldLabel>
            <input list="categorias-ahorro-datalist" value={ahorroForm.categoria} onChange={e=>setAhorroForm(p=>({...p,categoria:e.target.value}))} placeholder="Ej: inversion_pesos" className="input-field" />
            <datalist id="categorias-ahorro-datalist">
              {Array.from(new Set([...(allIngresos??[]).map(i=>i.tipo), ...(allEgresos??[]).map(e=>e.categoria)])).map(c=><option key={c} value={c} />)}
            </datalist>
          </div>
          <div><FieldLabel>Moneda</FieldLabel>
            <select value={ahorroForm.moneda} onChange={e=>setAhorroForm(p=>({...p,moneda:e.target.value as Moneda}))} className="input-field">
              {monedasPalette.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><FieldLabel>Ícono</FieldLabel>
            <div className="flex flex-wrap gap-2 mt-1">
              {ICONOS_GENERALES.slice(0,16).map(ic=>(
                <button key={ic} onClick={()=>setAhorroForm(p=>({...p,icono:ic}))} className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg cursor-pointer border-2 transition-all ${ahorroForm.icono===ic?'border-blue-700 bg-blue-50':'border-slate-200 bg-slate-50'}`}>{ic}</button>
              ))}
            </div>
          </div>
          <div><FieldLabel>Color</FieldLabel>
            <div className="flex gap-2 mt-1">
              {META_COLORS.map(c=>(
                <button key={c} onClick={()=>setAhorroForm(p=>({...p,color:c}))} className={`w-7 h-7 rounded-full border-2 cursor-pointer transition-all ${ahorroForm.color===c?'border-slate-900 scale-110':'border-transparent'}`} style={{background:c}} />
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={()=>setShowAhorroModal(false)} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={handleSaveAhorro} disabled={savingAhorro||!ahorroForm.nombre||!ahorroForm.categoria} className="btn-primary flex-1 disabled:opacity-50">{savingAhorro?'Guardando...':'Guardar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
