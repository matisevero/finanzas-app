'use client'
import { useState, useMemo } from 'react'
import { useAppStore, useMonedasDisponibles } from '@/store/appStore'
import {
  useMetas, useMetaAportes, useAhorros, useAhorroAjustes,
  useAllIngresos, useAllEgresos, useTarjetaTransacciones,
  useEtiquetas, useEgresoEtiquetas, useIngresoEtiquetas, useTarjetaTransaccionEtiquetas,
} from '@/hooks'
import {
  createMeta, updateMeta, deleteMeta, createMetaAporte, updateMetaAporte, deleteMetaAporte, sincronizarMontoActualMeta,
  createAhorro, updateAhorro, deleteAhorro, archivarAhorro, createAhorroAjuste, updateAhorroAjuste, deleteAhorroAjuste, sincronizarAjusteManualAhorro,
} from '@/lib/queries'
import { fmt, fmtFull, fmtDate } from '@/lib/utils/formatters'
import { calcularMeta } from '@/lib/utils/calculations'
import { META_COLORS, ICONOS_GENERALES, TIPOS_INGRESO, TIPOS_EGRESO } from '@/lib/utils/constants'
import { PageHeader, Card, Modal, LoadingSpinner, EmptyState, FieldLabel, ProgressBar } from '@/components/ui'
import { AsociarMovimientoModal, desasociarMovimiento } from '@/components/ui/AsociarMovimientoModal'
import { EditarMovimientoRapidoModal, type MovimientoEditable } from '@/components/ui/EditarMovimientoRapidoModal'
import { EditarAjusteModal, type AjusteEditable } from '@/components/ui/EditarAjusteModal'
import FechaInput from '@/components/ui/FechaInput'
import MontoInput from '@/components/ui/MontoInput'
import type { Moneda, Ahorro, Meta, TipoPeriodoMeta, Etiqueta } from '@/types'

const FORM_INIT = { nombre:'', descripcion:'', monto_objetivo:'', moneda:'USD' as Moneda, fecha_limite:'', tipo_periodo:'objetivo' as TipoPeriodoMeta, icono:'🎯', color:'#1A5E9E' }
const AHORRO_FORM_INIT = { nombre:'', categoria:'', moneda:'ARS' as Moneda, icono:'💰', color:'#1A5E9E', cantidad:'' }
const PERIODOS: { key: TipoPeriodoMeta; label: string; hint: string }[] = [
  { key:'objetivo', label:'Objetivo puntual', hint:'Ej: viaje, compra grande — juntás hasta una fecha' },
  { key:'mensual',  label:'Mensual',          hint:'Ej: ahorrar $X este mes' },
  { key:'anual',    label:'Anual',            hint:'Ej: ahorrar $X este año' },
  { key:'lapso',    label:'Un lapso',         hint:'Un rango de tiempo puntual, elegís vos las fechas' },
]

function sugerirFechaLimite(tipo: TipoPeriodoMeta): string {
  const hoy = new Date()
  if (tipo === 'mensual') return new Date(hoy.getFullYear(), hoy.getMonth()+1, 0).toISOString().slice(0,10)
  if (tipo === 'anual')   return new Date(hoy.getFullYear(), 11, 31).toISOString().slice(0,10)
  return ''
}

type MovEtiquetado = { tipo:'egreso'|'ingreso'|'tarjeta'; id:string; fecha:string; descripcion:string; categoria:string; monto:number; moneda:Moneda; cotizacion?: number | null }

const entidadDeMov = (tipo: 'egreso'|'ingreso'|'tarjeta'): 'egreso'|'ingreso'|'tarjeta_transaccion' =>
  tipo === 'tarjeta' ? 'tarjeta_transaccion' : tipo

export default function AhorrosPage() {
  const [tab, setTab] = useState<'metas'|'general'>('metas')
  const { monedaPrincipal: m } = useAppStore()
  const monedasPalette = useMonedasDisponibles()
  const { data: metas, loading, refetch } = useMetas()
  const { data: ahorros, loading: loadingAhorros, refetch: refetchAhorros } = useAhorros()
  const { data: allIngresos, loading: liAll } = useAllIngresos()
  const { data: allEgresos, loading: leAll } = useAllEgresos()
  const { data: allTxnsTarjeta } = useTarjetaTransacciones()
  const { data: etiquetas, refetch: refetchEtiquetas } = useEtiquetas()
  const { data: egresoEtiquetas, refetch: refetchEgresoEtiquetas } = useEgresoEtiquetas()
  const { data: ingresoEtiquetas, refetch: refetchIngresoEtiquetas } = useIngresoEtiquetas()
  const { data: txnEtiquetas, refetch: refetchTxnEtiquetas } = useTarjetaTransaccionEtiquetas()

  const [selectedMetaId, setSelectedMetaId] = useState<string|null>(null)
  const [selectedAhorroId, setSelectedAhorroId] = useState<string|null>(null)

  const [showModal, setShowModal]   = useState(false)
  const [editId, setEditId]         = useState<string|null>(null)
  const [saving, setSaving]         = useState(false)
  const [form, setForm]             = useState(FORM_INIT)
  const [selIcon, setSelIcon]       = useState('🎯')
  const [selColor, setSelColor]     = useState('#1A5E9E')

  const [showAhorroModal, setShowAhorroModal] = useState(false)
  const [ahorroEditId, setAhorroEditId]       = useState<string|null>(null)
  const [ahorroForm, setAhorroForm]           = useState(AHORRO_FORM_INIT)
  const [savingAhorro, setSavingAhorro]       = useState(false)

  const etiquetaDeAhorro = (a: Ahorro) => (etiquetas ?? []).find(e => e.tipo === 'ahorro' && e.ahorro_id === a.id)
  const etiquetaDeMeta   = (meta: Meta) => (etiquetas ?? []).find(e => e.tipo === 'meta' && e.meta_id === meta.id)

  const movimientosEtiquetados = (etiquetaId: string | undefined): MovEtiquetado[] => {
    if (!etiquetaId) return []
    const egresoIds  = new Set((egresoEtiquetas ?? []).filter(r => r.etiqueta_id === etiquetaId).map(r => r.egreso_id))
    const ingresoIds = new Set((ingresoEtiquetas ?? []).filter(r => r.etiqueta_id === etiquetaId).map(r => r.ingreso_id))
    const txnIds      = new Set((txnEtiquetas ?? []).filter(r => r.etiqueta_id === etiquetaId).map(r => r.transaccion_id))
    const egr = (allEgresos ?? []).filter(e => egresoIds.has(e.id)).map(e => ({ tipo:'egreso' as const, id:e.id, fecha:e.fecha, descripcion:e.descripcion, categoria:e.categoria, monto:e.monto, moneda:e.moneda as Moneda, cotizacion:e.cotizacion }))
    const ing = (allIngresos ?? []).filter(i => ingresoIds.has(i.id)).map(i => ({ tipo:'ingreso' as const, id:i.id, fecha:i.fecha, descripcion:i.descripcion, categoria:i.tipo, monto:i.monto, moneda:i.moneda as Moneda, cotizacion:i.cotizacion }))
    const tar = (allTxnsTarjeta ?? []).filter(t => txnIds.has(t.id)).map(t => ({ tipo:'tarjeta' as const, id:t.id, fecha:t.fecha, descripcion:t.descripcion, categoria:t.categoria, monto:t.monto, moneda:t.moneda as Moneda, cotizacion:t.cotizacion_ars }))
    return [...egr, ...ing, ...tar].sort((x,y)=>y.fecha.localeCompare(x.fecha))
  }

  // ═══ Ahorro: form + acciones ═══════════════════════════════════════════════
  const openNewAhorro = () => { setAhorroEditId(null); setAhorroForm(AHORRO_FORM_INIT); setShowAhorroModal(true) }
  const openEditAhorro = (a: Ahorro) => {
    setAhorroEditId(a.id)
    setAhorroForm({ nombre:a.nombre, categoria:a.categoria, moneda:a.moneda as Moneda, icono:a.icono, color:a.color, cantidad: a.cantidad != null ? String(a.cantidad) : '' })
    setShowAhorroModal(true)
  }
  const handleSaveAhorro = async () => {
    if (!ahorroForm.nombre || !ahorroForm.categoria) return
    setSavingAhorro(true)
    try {
      const payload = { nombre: ahorroForm.nombre, categoria: ahorroForm.categoria, moneda: ahorroForm.moneda, icono: ahorroForm.icono, color: ahorroForm.color, cantidad: ahorroForm.cantidad ? parseFloat(ahorroForm.cantidad) : null }
      if (ahorroEditId) await updateAhorro(ahorroEditId, payload)
      else await createAhorro({ ...payload, ajuste_manual: 0 })
      setShowAhorroModal(false); refetchAhorros(); refetchEtiquetas()
    } catch(e){ console.error(e) } finally { setSavingAhorro(false) }
  }
  const handleDeleteAhorro = async (id: string) => {
    if (!confirm('¿Eliminar este ahorro? Esto no borra tus ingresos/egresos, solo la card.')) return
    await deleteAhorro(id); refetchAhorros(); if (selectedAhorroId===id) setSelectedAhorroId(null)
  }
  const handleArchivarAhorro = async (a: Ahorro, archivar: boolean) => { await archivarAhorro(a.id, archivar); refetchEtiquetas() }

  const automaticoDe = (a: Ahorro) => {
    const ing = (allIngresos ?? []).filter(i => i.tipo === a.categoria && i.moneda === a.moneda).reduce((s,i)=>s+i.monto,0)
    const egr = (allEgresos ?? []).filter(e => e.categoria === a.categoria && e.moneda === a.moneda).reduce((s,e)=>s+e.monto,0)
    return Math.max(0, ing - egr)
  }

  // ═══ Meta: form + acciones ══════════════════════════════════════════════════
  const openNew = () => { setEditId(null); setForm(FORM_INIT); setSelIcon('🎯'); setSelColor('#1A5E9E'); setShowModal(true) }
  const openEdit = (meta: Meta) => {
    setEditId(meta.id)
    setForm({ nombre:meta.nombre, descripcion:meta.descripcion||'', monto_objetivo:String(meta.monto_objetivo), moneda:meta.moneda as Moneda, fecha_limite:meta.fecha_limite, tipo_periodo:meta.tipo_periodo, icono:meta.icono, color:meta.color })
    setSelIcon(meta.icono); setSelColor(meta.color); setShowModal(true)
  }
  const handleSave = async () => {
    if (!form.nombre||!form.monto_objetivo||!form.fecha_limite) return
    setSaving(true)
    try {
      const payload = { nombre:form.nombre, descripcion:form.descripcion||undefined, monto_objetivo:parseFloat(form.monto_objetivo), moneda:form.moneda, fecha_limite:form.fecha_limite, tipo_periodo:form.tipo_periodo, icono:selIcon, color:selColor }
      if (editId) await updateMeta(editId, payload)
      else await createMeta({ ...payload, monto_actual:0, completada:false })
      setShowModal(false); refetch(); refetchEtiquetas()
    } catch(e){ console.error(e) } finally { setSaving(false) }
  }
  const handleDelete = async (id:string) => {
    if (!confirm('¿Eliminar esta meta?')) return
    await deleteMeta(id); refetch(); if (selectedMetaId===id) setSelectedMetaId(null)
  }

  // KPIs globales
  const kpis = useMemo(()=>{
    const total   = (metas??[]).length
    const compl   = (metas??[]).filter(x=>x.completada).length
    const proxMeses = Math.min(...(metas??[]).filter(x=>!x.completada).map(x=>calcularMeta(x.monto_objetivo,x.monto_actual,x.fecha_limite).meses).filter(x=>x>0))
    const proxMeta  = (metas??[]).find(x=>!x.completada&&calcularMeta(x.monto_objetivo,x.monto_actual,x.fecha_limite).meses===proxMeses)
    return { total, compl, proxMeses:isFinite(proxMeses)?proxMeses:null, proxMeta }
  }, [metas])

  const sorted = useMemo(()=>[...(metas??[])].sort((a,b)=>(b.monto_actual/b.monto_objetivo)-(a.monto_actual/a.monto_objetivo)), [metas])

  if ((loading && !metas) || (loadingAhorros && !ahorros)) return <LoadingSpinner />

  // ── Vista detalle: Meta ──────────────────────────────────────────────────────
  const metaSeleccionada = selectedMetaId ? (metas??[]).find(x=>x.id===selectedMetaId) : null
  if (metaSeleccionada) {
    const etMeta = etiquetaDeMeta(metaSeleccionada)
    return <MetaDetalle meta={metaSeleccionada} onVolver={()=>setSelectedMetaId(null)}
      onEditar={()=>openEdit(metaSeleccionada)} onEliminar={()=>handleDelete(metaSeleccionada.id)}
      etiqueta={etMeta} movimientos={movimientosEtiquetados(etMeta?.id)}
      onAporteRegistrado={()=>{refetch()}}
      asociarProps={{
        etiquetas: etiquetas??[], ingresos: allIngresos??[], egresos: allEgresos??[], tarjetaTxns: allTxnsTarjeta??[],
        ingresoEtiquetas: ingresoEtiquetas??[], egresoEtiquetas: egresoEtiquetas??[], txnEtiquetas: txnEtiquetas??[],
        ahorros: ahorros??[], metas: metas??[],
        onDone: () => { refetchEgresoEtiquetas(); refetchIngresoEtiquetas(); refetchTxnEtiquetas(); refetch() },
      }}
      modalEditar={<MetaModal open={showModal} onClose={()=>setShowModal(false)} editId={editId} form={form} setForm={setForm}
        selIcon={selIcon} setSelIcon={setSelIcon} selColor={selColor} setSelColor={setSelColor}
        saving={saving} onSave={handleSave} monedasPalette={monedasPalette} />} />
  }

  // ── Vista detalle: Ahorro ─────────────────────────────────────────────────────
  const ahorroSeleccionado = selectedAhorroId ? (ahorros??[]).find(x=>x.id===selectedAhorroId) : null
  if (ahorroSeleccionado) {
    const et = etiquetaDeAhorro(ahorroSeleccionado)
    return <AhorroDetalle ahorro={ahorroSeleccionado} onVolver={()=>setSelectedAhorroId(null)}
      onEditar={()=>openEditAhorro(ahorroSeleccionado)} onEliminar={()=>handleDeleteAhorro(ahorroSeleccionado.id)}
      archivado={et?.estado==='archivada'} onArchivar={()=>handleArchivarAhorro(ahorroSeleccionado, et?.estado!=='archivada')}
      automatico={automaticoDe(ahorroSeleccionado)} movimientos={movimientosEtiquetados(et?.id)}
      etiqueta={et}
      onAjusteRegistrado={()=>{refetchAhorros()}}
      asociarProps={{
        etiquetas: etiquetas??[], ingresos: allIngresos??[], egresos: allEgresos??[], tarjetaTxns: allTxnsTarjeta??[],
        ingresoEtiquetas: ingresoEtiquetas??[], egresoEtiquetas: egresoEtiquetas??[], txnEtiquetas: txnEtiquetas??[],
        ahorros: ahorros??[], metas: metas??[],
        onDone: () => { refetchEgresoEtiquetas(); refetchIngresoEtiquetas(); refetchTxnEtiquetas(); refetchAhorros() },
      }}
      modalEditar={<AhorroModal open={showAhorroModal} onClose={()=>setShowAhorroModal(false)} editId={ahorroEditId} form={ahorroForm} setForm={setAhorroForm}
        saving={savingAhorro} onSave={handleSaveAhorro} monedasPalette={monedasPalette}
        categoriasConocidas={Array.from(new Set([...(allIngresos??[]).map(i=>i.tipo), ...(allEgresos??[]).map(e=>e.categoria)]))} />} />
  }

  // ── Vista lista ────────────────────────────────────────────────────────────
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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          {l:'Metas activas',      v:String(kpis.total),              s:kpis.compl>0?kpis.compl+' completadas':'',          c:'#1A5E9E'},
          {l:'Completadas',        v:`${kpis.compl}/${kpis.total}`,   s:'Objetivos alcanzados',                              c:'#40B046'},
          {l:'Próximo vencimiento',v:kpis.proxMeses!=null?kpis.proxMeses+' meses':'—', s:kpis.proxMeta?.nombre||'Sin metas activas', c:'#E8A020'},
          {l:'En progreso',        v:String((metas??[]).filter(x=>!x.completada).length), s:'Metas sin completar',           c:'#5B3FA6'},
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            {(metas??[]).map(meta=>{
              const { pct, meses, cuota, falta } = calcularMeta(meta.monto_objetivo, meta.monto_actual, meta.fecha_limite)
              const mon = meta.moneda as Moneda
              return (
                <div key={meta.id} onClick={()=>setSelectedMetaId(meta.id)}
                  className="group cursor-pointer bg-white border-2 rounded-2xl p-6 shadow-card relative overflow-hidden hover:-translate-y-0.5 transition-all"
                  style={{borderColor:meta.completada?'#86efac':meta.color+'22'}}>
                  <div className="absolute top-0 right-0 w-20 h-20 rounded-bl-[80px]" style={{background:meta.color+'08'}} />
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{meta.icono}</span>
                      <div>
                        <div className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                          {meta.nombre}
                          <span className="text-[10px] font-normal bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{PERIODOS.find(p=>p.key===meta.tipo_periodo)?.label}</span>
                        </div>
                        {meta.descripcion&&<div className="text-slate-400 text-sm">{meta.descripcion}</div>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-3xl font-bold font-mono" style={{color:meta.color}}>{fmt(meta.monto_actual,mon)}</span>
                    <span className="text-slate-400 text-sm">de</span>
                    <span className="text-slate-600 font-mono font-semibold">{fmt(meta.monto_objetivo,mon)}</span>
                  </div>
                  <ProgressBar value={pct} color={meta.color} height={8} />
                  <div className="flex justify-between mt-1.5">
                    <span className="text-slate-400 text-xs">Falta {fmt(falta,mon)}</span>
                    <span className="text-xs font-bold" style={{color:meta.completada?'#40B046':meta.color}}>
                      {meta.completada?'✓ Completada':pct+'% alcanzado'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

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
              return (
                <div key={a.id} onClick={()=>setSelectedAhorroId(a.id)}
                  className="group cursor-pointer bg-white border-2 rounded-2xl p-6 shadow-card relative overflow-hidden hover:-translate-y-0.5 transition-all" style={{borderColor:a.color+'22', opacity: archivado ? 0.6 : 1}}>
                  <div className="absolute top-0 right-0 w-20 h-20 rounded-bl-[80px]" style={{background:a.color+'08'}} />
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{a.icono}</span>
                      <div>
                        <div className="text-lg font-semibold text-slate-900 flex items-center gap-2">{a.nombre}{archivado && <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Archivado</span>}</div>
                        <div className="text-slate-400 text-sm">{a.categoria} · {a.moneda}</div>
                      </div>
                    </div>
                  </div>
                  <div className="text-3xl font-bold font-mono mb-2" style={{color:a.color}}>{fmt(total, a.moneda as Moneda)}</div>
                  {a.cantidad != null && a.cantidad > 0 && (
                    <div className="text-xs text-slate-500">{a.cantidad} unidades · {fmt(total / a.cantidad, a.moneda as Moneda)} c/u</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </>}

      <MetaModal open={showModal} onClose={()=>setShowModal(false)} editId={editId} form={form} setForm={setForm}
        selIcon={selIcon} setSelIcon={setSelIcon} selColor={selColor} setSelColor={setSelColor}
        saving={saving} onSave={handleSave} monedasPalette={monedasPalette} />

      <AhorroModal open={showAhorroModal} onClose={()=>setShowAhorroModal(false)} editId={ahorroEditId} form={ahorroForm} setForm={setAhorroForm}
        saving={savingAhorro} onSave={handleSaveAhorro} monedasPalette={monedasPalette}
        categoriasConocidas={Array.from(new Set([...(allIngresos??[]).map(i=>i.tipo), ...(allEgresos??[]).map(e=>e.categoria)]))} />
    </div>
  )
}

// ═══ Vista de detalle: Meta ═══════════════════════════════════════════════════
function MetaDetalle({ meta, onVolver, onEditar, onEliminar, etiqueta, movimientos, onAporteRegistrado, asociarProps, modalEditar }: {
  meta: Meta; onVolver: () => void; onEditar: () => void; onEliminar: () => void
  etiqueta: Etiqueta | undefined; movimientos: MovEtiquetado[]; onAporteRegistrado: () => void
  asociarProps: any
  modalEditar: React.ReactNode
}) {
  const { data: aportes, refetch: refetchAportes } = useMetaAportes(meta.id)
  const { pct, meses, cuota, falta } = calcularMeta(meta.monto_objetivo, meta.monto_actual, meta.fecha_limite)
  const mon = meta.moneda as Moneda
  const [montoAporte, setMontoAporte] = useState('')
  const [savingAporte, setSavingAporte] = useState(false)
  const [showAsociarModal, setShowAsociarModal] = useState(false)
  const [editando, setEditando] = useState<MovimientoEditable | null>(null)
  const [editandoAjuste, setEditandoAjuste] = useState<AjusteEditable | null>(null)
  const [desasociando, setDesasociando] = useState<string | null>(null)
  const [recalculando, setRecalculando] = useState(false)
  const monedasPalette = useMonedasDisponibles()
  const aporteRealDerivado = Math.max(0, Math.min(meta.monto_objetivo, (aportes ?? []).reduce((s, a) => s + a.monto, 0)))

  const handleRecalcular = async () => {
    setRecalculando(true)
    try { await sincronizarMontoActualMeta(meta.id, meta.monto_objetivo); await onAporteRegistrado() } finally { setRecalculando(false) }
  }

  const handleGuardarAporteEditado = async (id: string, cambios: { nota: string; monto: number; fecha: string }) => {
    await updateMetaAporte(id, cambios)
    await sincronizarMontoActualMeta(meta.id, meta.monto_objetivo)
    await refetchAportes(); await onAporteRegistrado()
  }
  const handleEliminarAporte = async (id: string) => {
    await deleteMetaAporte(id)
    await sincronizarMontoActualMeta(meta.id, meta.monto_objetivo)
    await refetchAportes(); await onAporteRegistrado()
  }

  const handleAgregarAporte = async () => {
    const val = parseFloat(montoAporte||'0')
    if (!val) return
    setSavingAporte(true)
    try {
      await createMetaAporte({ meta_id: meta.id, monto: val, fecha: new Date().toISOString().slice(0,10), nota: 'Aporte manual' })
      await sincronizarMontoActualMeta(meta.id, meta.monto_objetivo)
      setMontoAporte(''); await refetchAportes(); await onAporteRegistrado()
    } finally { setSavingAporte(false) }
  }

  // Timeline unificado: aportes manuales + movimientos etiquetados, por fecha desc.
  // Mismo cuidado de conversión que en Ahorro (ver AhorroDetalle) — si el movimiento linkeado
  // está en otra moneda que la Meta, convertimos con la cotización guardada si existe; si no,
  // se muestra en su moneda original en vez de mostrar el número crudo con el símbolo de la Meta.
  const esCriptoMeta = ['BTC', 'ETH'].includes(mon)
  const timeline = useMemo(() => {
    const a = (aportes??[]).map(x => ({ origen:'manual' as const, id:x.id, fecha:x.fecha, monto:x.monto, moneda:mon, descripcion:x.nota||'Aporte manual' }))
    const m = movimientos.map(x => {
      const esCompraCriptoNoConvertible = esCriptoMeta && x.moneda === 'ARS'
      const convertible = x.moneda !== mon && !!x.cotizacion && x.cotizacion > 0 && !esCompraCriptoNoConvertible
      const montoEnMonedaPropia = x.tipo==='ingreso' ? -x.monto : x.monto
      const monto  = convertible ? montoEnMonedaPropia / (x.cotizacion as number) : montoEnMonedaPropia
      const moneda = convertible ? mon : x.moneda
      return { origen:x.tipo as 'egreso'|'ingreso'|'tarjeta', id:x.id, fecha:x.fecha, monto, moneda, descripcion:x.descripcion,
        original: { entidad: entidadDeMov(x.tipo), monto:x.monto, moneda:x.moneda } }
    })
    return [...a, ...m].sort((x,y)=>y.fecha.localeCompare(x.fecha))
  }, [aportes, movimientos, mon, esCriptoMeta])

  const etiquetasDelMov = (entidad: 'egreso'|'ingreso'|'tarjeta_transaccion', id: string): string[] => {
    if (entidad === 'egreso') return (asociarProps.egresoEtiquetas as any[]).filter(r => r.egreso_id === id).map(r => r.etiqueta_id)
    if (entidad === 'ingreso') return (asociarProps.ingresoEtiquetas as any[]).filter(r => r.ingreso_id === id).map(r => r.etiqueta_id)
    return (asociarProps.txnEtiquetas as any[]).filter(r => r.transaccion_id === id).map(r => r.etiqueta_id)
  }

  const handleDesasociar = async (t: (typeof timeline)[number]) => {
    if (!etiqueta || t.origen === 'manual' || !t.original) return
    if (!confirm('¿Desasociar este movimiento de la meta? El ingreso/egreso en sí no se borra.')) return
    setDesasociando(t.id)
    try {
      await desasociarMovimiento({
        entidad: t.original.entidad, id: t.id, etiquetaId: etiqueta.id,
        etiquetasActuales: etiquetasDelMov(t.original.entidad, t.id),
        etiquetas: asociarProps.etiquetas, ahorros: asociarProps.ahorros, metas: asociarProps.metas,
        tipo: 'meta', monto: t.original.monto, moneda: t.original.moneda, fecha: t.fecha, descripcion: t.descripcion,
      })
      asociarProps.onDone()
    } catch (e: any) { console.error(e); alert('No se pudo desasociar: ' + (e.message || e)) } finally { setDesasociando(null) }
  }

  return (
    <div>
      <button onClick={onVolver} className="text-sm text-slate-500 hover:text-slate-800 border-none bg-transparent cursor-pointer mb-4 px-0">‹ Volver a Ahorros</button>
      <PageHeader title={`${meta.icono} ${meta.nombre}`} subtitle={meta.descripcion || PERIODOS.find(p=>p.key===meta.tipo_periodo)?.label}
        action={
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onEditar}>✎ Editar</button>
            <button className="btn-ghost" onClick={onEliminar}>✕ Eliminar</button>
          </div>
        } />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-2">
        {[
          { l:'Ahorrado',  v:fmt(meta.monto_actual, mon),   c:meta.color },
          { l:'Objetivo',  v:fmt(meta.monto_objetivo, mon), c:'#1A5E9E' },
          { l:'Falta',     v:fmt(falta, mon),                c:'#F54927' },
          { l:'Fecha límite', v:meta.fecha_limite.slice(0,7), c:'#5B3FA6' },
        ].map(k=>(
          <div key={k.l} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card">
            <div className="label mb-1">{k.l}</div>
            <div className="text-xl font-bold font-mono" style={{color:k.c}}>{k.v}</div>
          </div>
        ))}
      </div>
      {aporteRealDerivado !== meta.monto_actual && (
        <div className="mb-6 flex items-center justify-between gap-2 bg-amber-50 rounded-lg px-3 py-2">
          <span className="text-xs text-amber-700">"Ahorrado" no coincide con el historial ({fmt(aporteRealDerivado, mon)})</span>
          <button onClick={handleRecalcular} disabled={recalculando}
            className="text-xs font-semibold text-amber-700 underline flex-shrink-0 border-none bg-transparent cursor-pointer disabled:opacity-50">
            {recalculando ? 'Corrigiendo...' : 'Corregir'}
          </button>
        </div>
      )}
      {aporteRealDerivado === meta.monto_actual && <div className="mb-6" />}

      <Card className="mb-5">
        <ProgressBar value={pct} color={meta.color} height={8} />
        <div className="flex justify-between mt-2">
          <span className="text-slate-400 text-xs">{meta.completada?'✓ Completada':`${pct}% alcanzado`}</span>
          {!meta.completada && meses>0 && <span className="text-slate-400 text-xs">{meses} meses restantes · {fmt(cuota,mon)}/mes sugerido</span>}
        </div>
      </Card>

      {!meta.completada && (
        <Card className="mb-5">
          <div className="text-slate-900 font-semibold text-sm mb-3">Agregar aporte</div>
          <div className="flex gap-2">
            <MontoInput value={montoAporte} onChange={setMontoAporte} placeholder={`Monto en ${mon}...`} className="flex-1 text-sm py-2" />
            <button onClick={handleAgregarAporte} disabled={savingAporte||!montoAporte} className="btn-primary py-2 px-4 text-sm flex-shrink-0 disabled:opacity-50" style={{background:meta.color}}>
              {savingAporte?'...':'+ Agregar'}
            </button>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="text-slate-900 font-semibold text-[15px]">Historial de aportes ({timeline.length})</div>
          <button className="btn-ghost text-sm" onClick={()=>setShowAsociarModal(true)}>+ Asociar movimiento</button>
        </div>
        {timeline.length===0 ? (
          <div className="text-center text-slate-400 text-sm py-6">Todavía no hay aportes registrados.</div>
        ) : (
          <div className="flex flex-col">
            {timeline.map(t=>(
              <div key={`${t.origen}-${t.id}`} className="flex justify-between items-center py-2.5 border-b border-slate-100 last:border-0 gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-slate-400 text-xs font-mono flex-shrink-0">{fmtDate(t.fecha)}</span>
                  <span className="text-slate-700 text-sm truncate">{t.descripcion}</span>
                  {t.origen!=='manual' && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full flex-shrink-0">{t.origen}</span>}
                  {t.moneda!==mon && <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full flex-shrink-0" title="Sin cotización guardada para convertir — se muestra en su moneda original">{t.moneda}</span>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`font-mono font-bold text-sm ${t.monto<0?'text-red-600':'text-emerald-700'}`}>{t.monto>=0?'+':''}{fmtFull(t.monto, t.moneda)}</span>
                  {t.origen!=='manual' && t.original && (
                    <>
                      <button onClick={()=>setEditando({ entidad:t.original!.entidad, id:t.id, descripcion:t.descripcion, monto:t.original!.monto, moneda:t.original!.moneda, fecha:t.fecha, contribuyeAAhorroOMeta:true })}
                        className="text-slate-300 hover:text-blue-600 border-none bg-transparent cursor-pointer text-xs" title="Editar">✎</button>
                      <button onClick={()=>handleDesasociar(t)} disabled={desasociando===t.id}
                        className="text-slate-300 hover:text-red-500 border-none bg-transparent cursor-pointer text-xs disabled:opacity-50" title="Desasociar">✕</button>
                    </>
                  )}
                  {t.origen==='manual' && (
                    <button onClick={()=>setEditandoAjuste({ tipo:'meta', id:t.id, nota:t.descripcion, monto:t.monto, fecha:t.fecha })}
                      className="text-slate-300 hover:text-blue-600 border-none bg-transparent cursor-pointer text-xs" title="Editar / eliminar">✎</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <AsociarMovimientoModal open={showAsociarModal} onClose={()=>setShowAsociarModal(false)}
        tipo="meta" etiquetaId={etiqueta?.id ?? ''} moneda={mon} {...asociarProps} />
      <EditarMovimientoRapidoModal open={!!editando} onClose={()=>setEditando(null)} movimiento={editando}
        monedasPalette={monedasPalette} onSaved={asociarProps.onDone} />
      <EditarAjusteModal open={!!editandoAjuste} onClose={()=>setEditandoAjuste(null)} ajuste={editandoAjuste}
        onGuardar={handleGuardarAporteEditado} onEliminar={handleEliminarAporte} />
      {modalEditar}
    </div>
  )
}

// ═══ Vista de detalle: Ahorro ═════════════════════════════════════════════════
function AhorroDetalle({ ahorro, onVolver, onEditar, onEliminar, archivado, onArchivar, automatico, movimientos, etiqueta, onAjusteRegistrado, asociarProps, modalEditar }: {
  ahorro: Ahorro; onVolver: () => void; onEditar: () => void; onEliminar: () => void
  archivado: boolean; onArchivar: () => void; automatico: number; movimientos: MovEtiquetado[]
  etiqueta: Etiqueta | undefined; onAjusteRegistrado: () => void
  asociarProps: any
  modalEditar: React.ReactNode
}) {
  const { data: ajustes, refetch: refetchAjustes } = useAhorroAjustes(ahorro.id)
  const mon = ahorro.moneda as Moneda
  const total = Math.max(0, automatico + ahorro.ajuste_manual)
  const [montoAjuste, setMontoAjuste] = useState('')
  const [showAsociarModal, setShowAsociarModal] = useState(false)
  const [savingAjuste, setSavingAjuste] = useState(false)
  const [editando, setEditando] = useState<MovimientoEditable | null>(null)
  const [editandoAjuste, setEditandoAjuste] = useState<AjusteEditable | null>(null)
  const [desasociando, setDesasociando] = useState<string | null>(null)
  const [recalculando, setRecalculando] = useState(false)
  const monedasPalette = useMonedasDisponibles()
  const ajusteRealDerivado = (ajustes ?? []).reduce((s, a) => s + a.monto, 0)

  const handleRecalcular = async () => {
    setRecalculando(true)
    try { await sincronizarAjusteManualAhorro(ahorro.id); await onAjusteRegistrado() } finally { setRecalculando(false) }
  }

  const handleGuardarAjuste = async (id: string, cambios: { nota: string; monto: number; fecha: string }) => {
    await updateAhorroAjuste(id, cambios)
    await sincronizarAjusteManualAhorro(ahorro.id)
    await refetchAjustes(); await onAjusteRegistrado()
  }
  const handleEliminarAjuste = async (id: string) => {
    await deleteAhorroAjuste(id)
    await sincronizarAjusteManualAhorro(ahorro.id)
    await refetchAjustes(); await onAjusteRegistrado()
  }

  const etiquetasDelMov = (entidad: 'egreso'|'ingreso'|'tarjeta_transaccion', id: string): string[] => {
    if (entidad === 'egreso') return (asociarProps.egresoEtiquetas as any[]).filter(r => r.egreso_id === id).map(r => r.etiqueta_id)
    if (entidad === 'ingreso') return (asociarProps.ingresoEtiquetas as any[]).filter(r => r.ingreso_id === id).map(r => r.etiqueta_id)
    return (asociarProps.txnEtiquetas as any[]).filter(r => r.transaccion_id === id).map(r => r.etiqueta_id)
  }

  const handleDesasociar = async (t: (typeof timeline)[number]) => {
    if (!etiqueta || t.origen === 'manual' || !t.original) return
    if (!confirm('¿Desasociar este movimiento del ahorro? El ingreso/egreso en sí no se borra.')) return
    setDesasociando(t.id)
    try {
      await desasociarMovimiento({
        entidad: t.original.entidad, id: t.id, etiquetaId: etiqueta.id,
        etiquetasActuales: etiquetasDelMov(t.original.entidad, t.id),
        etiquetas: asociarProps.etiquetas, ahorros: asociarProps.ahorros, metas: asociarProps.metas,
        tipo: 'ahorro', monto: t.original.monto, moneda: t.original.moneda, fecha: t.fecha, descripcion: t.descripcion,
      })
      asociarProps.onDone()
    } catch (e: any) { console.error(e); alert('No se pudo desasociar: ' + (e.message || e)) } finally { setDesasociando(null) }
  }

  const handleAjustar = async (signo: 1|-1) => {
    const val = parseFloat(montoAjuste||'0')
    if (!val) return
    setSavingAjuste(true)
    try {
      const delta = signo*val
      await createAhorroAjuste({ ahorro_id: ahorro.id, monto: delta, fecha: new Date().toISOString().slice(0,10), nota: 'Ajuste manual' })
      await sincronizarAjusteManualAhorro(ahorro.id)
      setMontoAjuste(''); await refetchAjustes(); await onAjusteRegistrado()
    } finally { setSavingAjuste(false) }
  }

  const esCriptoAhorro = ['BTC', 'ETH'].includes(mon)

  const timeline = useMemo(() => {
    const a = (ajustes??[]).map(x => ({ origen:'manual' as const, id:x.id, fecha:x.fecha, monto:x.monto, moneda:mon, descripcion:x.nota||'Ajuste manual' }))
    // Los movimientos linkeados por etiqueta pueden estar en otra moneda que el Ahorro (ej: un
    // Egreso en ARS para comprar un Ahorro en USD). Si tenemos la cotización guardada en el
    // movimiento (ARS por unidad de la moneda del Ahorro), la usamos para mostrar el monto ya
    // convertido — si no, mostramos el monto en SU moneda original en vez de mentir mostrándolo
    // con el símbolo del Ahorro. Excepción: compra de cripto guarda solo una cotización de
    // referencia del USD (no ARS por unidad de cripto), así que ahí tampoco se puede convertir.
    const m = movimientos.map(x => {
      const esCompraCriptoNoConvertible = esCriptoAhorro && x.moneda === 'ARS'
      const convertible = x.moneda !== mon && !!x.cotizacion && x.cotizacion > 0 && !esCompraCriptoNoConvertible
      const montoEnMonedaPropia = x.tipo==='ingreso' ? -x.monto : x.monto
      const monto  = convertible ? montoEnMonedaPropia / (x.cotizacion as number) : montoEnMonedaPropia
      const moneda = convertible ? mon : x.moneda
      return { origen:x.tipo as 'egreso'|'ingreso'|'tarjeta', id:x.id, fecha:x.fecha, monto, moneda, descripcion:x.descripcion,
        original: { entidad: entidadDeMov(x.tipo), monto:x.monto, moneda:x.moneda } }
    })
    return [...a, ...m].sort((x,y)=>y.fecha.localeCompare(x.fecha))
  }, [ajustes, movimientos, mon, esCriptoAhorro])

  return (
    <div>
      <button onClick={onVolver} className="text-sm text-slate-500 hover:text-slate-800 border-none bg-transparent cursor-pointer mb-4 px-0">‹ Volver a Ahorros</button>
      <PageHeader title={`${ahorro.icono} ${ahorro.nombre}`} subtitle={archivado ? 'Archivado' : `${ahorro.categoria} · ${ahorro.moneda}`}
        action={
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onEditar}>✎ Editar</button>
            <button className="btn-ghost" onClick={onArchivar}>{archivado?'↺ Reactivar':'🗄 Archivar'}</button>
            <button className="btn-ghost" onClick={onEliminar}>✕ Eliminar</button>
          </div>
        } />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card">
          <div className="label mb-1">Total</div>
          <div className="text-2xl font-bold font-mono" style={{color:ahorro.color}}>{fmt(total, mon)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card">
          <div className="label mb-1">Automático (por categoría)</div>
          <div className="text-xl font-bold font-mono text-slate-700">{fmt(automatico, mon)}</div>
        </div>
        {ahorro.cantidad != null && ahorro.cantidad > 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card">
            <div className="label mb-1">Cantidad · Precio promedio</div>
            <div className="text-xl font-bold font-mono text-slate-700">{ahorro.cantidad} · {fmt(total/ahorro.cantidad, mon)}</div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card">
            <div className="label mb-1">Ajustes + asociados</div>
            <div className="text-xl font-bold font-mono text-slate-700">{fmt(ahorro.ajuste_manual, mon)}</div>
            {ajusteRealDerivado !== ahorro.ajuste_manual && (
              <div className="mt-2 flex items-center justify-between gap-2 bg-amber-50 rounded-lg px-2 py-1.5">
                <span className="text-[11px] text-amber-700">No coincide con el historial ({fmt(ajusteRealDerivado, mon)})</span>
                <button onClick={handleRecalcular} disabled={recalculando}
                  className="text-[11px] font-semibold text-amber-700 underline flex-shrink-0 border-none bg-transparent cursor-pointer disabled:opacity-50">
                  {recalculando ? 'Corrigiendo...' : 'Corregir'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <Card className="mb-5">
        <div className="text-slate-900 font-semibold text-sm mb-3">Ajustar manualmente</div>
        <div className="flex gap-2">
          <MontoInput value={montoAjuste} onChange={setMontoAjuste} placeholder={`Monto en ${mon}...`} className="flex-1 text-sm py-2" />
          <button onClick={()=>handleAjustar(1)} disabled={savingAjuste||!montoAjuste} className="btn-primary py-2 px-3 text-sm flex-shrink-0 disabled:opacity-50" style={{background:'#40B046'}}>+</button>
          <button onClick={()=>handleAjustar(-1)} disabled={savingAjuste||!montoAjuste} className="btn-primary py-2 px-3 text-sm flex-shrink-0 disabled:opacity-50" style={{background:'#F54927'}}>−</button>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="text-slate-900 font-semibold text-[15px]">Historial ({timeline.length})</div>
          <button className="btn-ghost text-sm" onClick={()=>setShowAsociarModal(true)}>+ Asociar movimiento</button>
        </div>
        {timeline.length===0 ? (
          <div className="text-center text-slate-400 text-sm py-6">Todavía no hay ajustes ni movimientos asociados.</div>
        ) : (
          <div className="flex flex-col">
            {timeline.map(t=>(
              <div key={`${t.origen}-${t.id}`} className="flex justify-between items-center py-2.5 border-b border-slate-100 last:border-0 gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-slate-400 text-xs font-mono flex-shrink-0">{fmtDate(t.fecha)}</span>
                  <span className="text-slate-700 text-sm truncate">{t.descripcion}</span>
                  {t.origen!=='manual' && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full flex-shrink-0">{t.origen}</span>}
                  {t.moneda!==mon && <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full flex-shrink-0" title="Sin cotización guardada para convertir — se muestra en su moneda original">{t.moneda}</span>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`font-mono font-bold text-sm ${t.monto<0?'text-red-600':'text-emerald-700'}`}>{t.monto>=0?'+':''}{fmtFull(t.monto, t.moneda)}</span>
                  {t.origen!=='manual' && t.original && (
                    <>
                      <button onClick={()=>setEditando({ entidad:t.original!.entidad, id:t.id, descripcion:t.descripcion, monto:t.original!.monto, moneda:t.original!.moneda, fecha:t.fecha, contribuyeAAhorroOMeta:true })}
                        className="text-slate-300 hover:text-blue-600 border-none bg-transparent cursor-pointer text-xs" title="Editar">✎</button>
                      <button onClick={()=>handleDesasociar(t)} disabled={desasociando===t.id}
                        className="text-slate-300 hover:text-red-500 border-none bg-transparent cursor-pointer text-xs disabled:opacity-50" title="Desasociar">✕</button>
                    </>
                  )}
                  {t.origen==='manual' && (
                    <button onClick={()=>setEditandoAjuste({ tipo:'ahorro', id:t.id, nota:t.descripcion, monto:t.monto, fecha:t.fecha })}
                      className="text-slate-300 hover:text-blue-600 border-none bg-transparent cursor-pointer text-xs" title="Editar / eliminar">✎</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <AsociarMovimientoModal open={showAsociarModal} onClose={()=>setShowAsociarModal(false)}
        tipo="ahorro" etiquetaId={etiqueta?.id ?? ''} moneda={mon} {...asociarProps} />
      <EditarMovimientoRapidoModal open={!!editando} onClose={()=>setEditando(null)} movimiento={editando}
        monedasPalette={monedasPalette} onSaved={asociarProps.onDone} />
      <EditarAjusteModal open={!!editandoAjuste} onClose={()=>setEditandoAjuste(null)} ajuste={editandoAjuste}
        onGuardar={handleGuardarAjuste} onEliminar={handleEliminarAjuste} />
      {modalEditar}
    </div>
  )
}

// ═══ Modales ═══════════════════════════════════════════════════════════════
function MetaModal({ open, onClose, editId, form, setForm, selIcon, setSelIcon, selColor, setSelColor, saving, onSave, monedasPalette }: any) {
  return (
    <Modal open={open} onClose={onClose} title={editId?'Editar meta':'Nueva meta'}>
      <div className="flex flex-col gap-4">
        <div><FieldLabel>Nombre</FieldLabel><input value={form.nombre} onChange={(e:any)=>setForm((p:any)=>({...p,nombre:e.target.value}))} placeholder="Ej: Viaje a Europa" className="input-field" /></div>
        <div><FieldLabel>Descripción (opcional)</FieldLabel><input value={form.descripcion} onChange={(e:any)=>setForm((p:any)=>({...p,descripcion:e.target.value}))} placeholder="Para qué es este ahorro" className="input-field" /></div>
        <div>
          <FieldLabel>Tipo</FieldLabel>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {PERIODOS.map((p: typeof PERIODOS[number]) => (
              <button key={p.key} type="button" onClick={()=>setForm((f:any)=>({...f, tipo_periodo:p.key, fecha_limite: f.fecha_limite || sugerirFechaLimite(p.key)}))}
                className={`text-left px-3 py-2 rounded-lg border-2 transition-all ${form.tipo_periodo===p.key?'border-blue-700 bg-blue-50':'border-slate-200 bg-slate-50'}`}>
                <div className="text-sm font-medium text-slate-800">{p.label}</div>
                <div className="text-[11px] text-slate-400">{p.hint}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><FieldLabel>Monto objetivo</FieldLabel><MontoInput value={form.monto_objetivo} onChange={(raw:string)=>setForm((p:any)=>({...p,monto_objetivo:raw}))} placeholder="0" /></div>
          <div><FieldLabel>Moneda</FieldLabel>
            <select value={form.moneda} onChange={(e:any)=>setForm((p:any)=>({...p,moneda:e.target.value as Moneda}))} className="input-field">
              {monedasPalette.map((c:string)=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div><FieldLabel>Fecha límite</FieldLabel><FechaInput value={form.fecha_limite} onChange={(iso:string)=>setForm((p:any)=>({...p,fecha_limite:iso}))} /></div>
        <div><FieldLabel>Ícono</FieldLabel>
          <div className="flex flex-wrap gap-2 mt-1">
            {ICONOS_GENERALES.slice(0,16).map((ic:string)=>(
              <button key={ic} onClick={()=>setSelIcon(ic)} className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg cursor-pointer border-2 transition-all ${selIcon===ic?'border-blue-700 bg-blue-50':'border-slate-200 bg-slate-50'}`}>{ic}</button>
            ))}
          </div>
        </div>
        <div><FieldLabel>Color</FieldLabel>
          <div className="flex gap-2 mt-1">
            {META_COLORS.map((c:string)=>(
              <button key={c} onClick={()=>setSelColor(c)} className={`w-7 h-7 rounded-full border-2 cursor-pointer transition-all ${selColor===c?'border-slate-900 scale-110':'border-transparent'}`} style={{background:c}} />
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={onSave} disabled={saving||!form.nombre||!form.monto_objetivo||!form.fecha_limite} className="btn-primary flex-1 disabled:opacity-50">{saving?'Guardando...':'Guardar'}</button>
        </div>
      </div>
    </Modal>
  )
}

function AhorroModal({ open, onClose, editId, form, setForm, saving, onSave, monedasPalette, categoriasConocidas }: any) {
  return (
    <Modal open={open} onClose={onClose} title={editId?'Editar ahorro':'Nuevo ahorro'}>
      <div className="flex flex-col gap-4">
        <div><FieldLabel>Nombre</FieldLabel><input value={form.nombre} onChange={(e:any)=>setForm((p:any)=>({...p,nombre:e.target.value}))} placeholder="Ej: Inversiones en pesos" className="input-field" /></div>
        <div>
          <FieldLabel>Categoría (debe coincidir con la de Ingresos/Egresos)</FieldLabel>
          <input list="categorias-ahorro-datalist" value={form.categoria} onChange={(e:any)=>setForm((p:any)=>({...p,categoria:e.target.value}))} placeholder="Ej: inversion_pesos" className="input-field" />
          <datalist id="categorias-ahorro-datalist">
            {categoriasConocidas.map((c:string)=><option key={c} value={c} />)}
          </datalist>
        </div>
        <div><FieldLabel>Moneda</FieldLabel>
          <select value={form.moneda} onChange={(e:any)=>setForm((p:any)=>({...p,moneda:e.target.value as Moneda}))} className="input-field">
            {monedasPalette.map((c:string)=><option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div><FieldLabel>Cantidad <span className="text-slate-400 font-normal normal-case">(opcional — si esto es una cripto u otro activo con unidades propias, cuántas tenés)</span></FieldLabel>
          <input type="number" step="any" value={form.cantidad} onChange={(e:any)=>setForm((p:any)=>({...p,cantidad:e.target.value}))} placeholder="Ej: 0.0234" className="input-field font-mono" />
        </div>
        <div><FieldLabel>Ícono</FieldLabel>
          <div className="flex flex-wrap gap-2 mt-1">
            {ICONOS_GENERALES.slice(0,16).map((ic:string)=>(
              <button key={ic} onClick={()=>setForm((p:any)=>({...p,icono:ic}))} className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg cursor-pointer border-2 transition-all ${form.icono===ic?'border-blue-700 bg-blue-50':'border-slate-200 bg-slate-50'}`}>{ic}</button>
            ))}
          </div>
        </div>
        <div><FieldLabel>Color</FieldLabel>
          <div className="flex gap-2 mt-1">
            {META_COLORS.map((c:string)=>(
              <button key={c} onClick={()=>setForm((p:any)=>({...p,color:c}))} className={`w-7 h-7 rounded-full border-2 cursor-pointer transition-all ${form.color===c?'border-slate-900 scale-110':'border-transparent'}`} style={{background:c}} />
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={onSave} disabled={saving||!form.nombre||!form.categoria} className="btn-primary flex-1 disabled:opacity-50">{saving?'Guardando...':'Guardar'}</button>
        </div>
      </div>
    </Modal>
  )
}
