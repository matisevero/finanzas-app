'use client'
import { useState, useMemo } from 'react'
import { useAppStore } from '@/store/appStore'
import { useMetas } from '@/hooks'
import { createMeta, updateMeta, deleteMeta } from '@/lib/queries'
import { fmt } from '@/lib/utils/formatters'
import { calcularMeta } from '@/lib/utils/calculations'
import { META_COLORS, ICONOS_GENERALES } from '@/lib/utils/constants'
import { PageHeader, Card, Modal, LoadingSpinner, EmptyState, FieldLabel, ProgressBar } from '@/components/ui'
import type { Moneda } from '@/types'

const FORM_INIT = { nombre:'', descripcion:'', monto_objetivo:'', monto_actual:'0', moneda:'USD' as Moneda, fecha_limite:'', icono:'🎯', color:'#1A5E9E' }

export default function MetasPage() {
  const { monedaPrincipal: m } = useAppStore()
  const { data: metas, loading, refetch } = useMetas()
  const [showModal, setShowModal]   = useState(false)
  const [editId, setEditId]         = useState<string|null>(null)
  const [saving, setSaving]         = useState(false)
  const [form, setForm]             = useState(FORM_INIT)
  const [selIcon, setSelIcon]       = useState('🎯')
  const [selColor, setSelColor]     = useState('#1A5E9E')
  const [addMontos, setAddMontos]   = useState<Record<string,string>>({})

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

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <PageHeader title="Metas de ahorro" subtitle="Tus objetivos financieros y el camino para llegar"
        action={<button className="btn-primary" onClick={openNew}>+ Nueva meta</button>} />

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          {l:'Metas activas',      v:String(kpis.total),              s:kpis.compl>0?kpis.compl+' completadas':'',          c:'#1A5E9E'},
          {l:'Completadas',        v:`${kpis.compl}/${kpis.total}`,   s:'Objetivos alcanzados',                              c:'#2D7D2D'},
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
          <div className="grid grid-cols-2 gap-5 mb-6">
            {(metas??[]).map(meta=>{
              const { pct, meses, cuota, falta } = calcularMeta(meta.monto_objetivo, meta.monto_actual, meta.fecha_limite)
              const mon = meta.moneda as Moneda
              return (
                <div key={meta.id} className="bg-white border-2 rounded-2xl p-6 shadow-card relative overflow-hidden"
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
                    <div className="flex gap-2">
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
                    <span className="text-xs font-bold" style={{color:meta.completada?'#2D7D2D':meta.color}}>
                      {meta.completada?'✓ Completada':pct+'% alcanzado'}
                    </span>
                  </div>

                  {!meta.completada ? (
                    <>
                      <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-100 mb-4">
                        <div><div className="label mb-0.5">Meses restantes</div><div className="text-sm font-mono font-bold text-slate-700">{meses>0?meses+' meses':'Vencida'}</div></div>
                        <div><div className="label mb-0.5">Ahorro mensual</div><div className="text-sm font-mono font-bold" style={{color:meta.color}}>{meses>0?fmt(cuota,mon):'—'}</div></div>
                        <div><div className="label mb-0.5">Fecha límite</div><div className="text-sm font-mono font-bold text-slate-700">{meta.fecha_limite.slice(0,7)}</div></div>
                      </div>
                      <div className="flex gap-2">
                        <input type="number" value={addMontos[meta.id]||''} onChange={e=>setAddMontos(p=>({...p,[meta.id]:e.target.value}))}
                          placeholder={`Agregar ${mon}...`} className="input-field flex-1 font-mono text-sm py-2" />
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

      {/* Modal */}
      <Modal open={showModal} onClose={()=>setShowModal(false)} title={editId?'Editar meta':'Nueva meta'}>
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Nombre</FieldLabel><input value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Ej: Viaje a Europa" className="input-field" /></div>
          <div><FieldLabel>Descripción (opcional)</FieldLabel><input value={form.descripcion} onChange={e=>setForm(p=>({...p,descripcion:e.target.value}))} placeholder="Para qué es este ahorro" className="input-field" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Monto objetivo</FieldLabel><input type="number" value={form.monto_objetivo} onChange={e=>setForm(p=>({...p,monto_objetivo:e.target.value}))} placeholder="0" className="input-field" /></div>
            <div><FieldLabel>Ya ahorrado</FieldLabel><input type="number" value={form.monto_actual} onChange={e=>setForm(p=>({...p,monto_actual:e.target.value}))} placeholder="0" className="input-field" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Moneda</FieldLabel>
              <select value={form.moneda} onChange={e=>setForm(p=>({...p,moneda:e.target.value as Moneda}))} className="input-field">
                {['ARS','USD','EUR'].map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><FieldLabel>Fecha límite</FieldLabel><input type="date" value={form.fecha_limite} onChange={e=>setForm(p=>({...p,fecha_limite:e.target.value}))} className="input-field" /></div>
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
    </div>
  )
}
