'use client'
import { useState, useMemo, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAppStore } from '@/store/appStore'
import { usePrecioItems, useAllEgresos } from '@/hooks'
import { createClient } from '@/lib/supabase/client'
import { updatePrecioItem, deletePrecioItem, archivarPrecioItem } from '@/lib/queries'
import { fmt, fmtDate } from '@/lib/utils/formatters'
import { CATS_PRECIO, COLORES_PRECIO } from '@/lib/utils/constants'
import { PageHeader, Card, Modal, LoadingSpinner, EmptyState, FieldLabel, RowMenu } from '@/components/ui'
import MontoInput from '@/components/ui/MontoInput'
import type { PrecioItem, PrecioHistorial, Egreso } from '@/types'

const TT = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, color:'#0f172a' }
const CHART_COLORS = ['#1A5E9E','#F54927','#40B046','#5B3FA6','#E8A020','#D4537E','#1D9E75','#888780']
const ICONOS = ['💧','🏠','⚡','🔥','🌐','🚗','🛒','💊','📺','🎵','📦','💳','📱','✈️','🏋️','📚','👔','👩','🌿','🏢']

export default function PreciosPage() {
  const { monedaPrincipal: m } = useAppStore()
  const { data: items, loading, refetch } = usePrecioItems()
  const { data: egresos } = useAllEgresos()
  const [historial, setHistorial] = useState<Record<string, PrecioHistorial[]>>({})
  const [loadingHist, setLoadingHist] = useState(false)
  // La selección vive en el store global (persistida) así no se pierde al navegar a otra
  // página ni entre sesiones — antes era useState local y se perdía apenas cambiabas de vista.
  const seleccionadosIds = useAppStore(s => s.preciosSeleccionados)
  const setPreciosSeleccionados = useAppStore(s => s.setPreciosSeleccionados)
  const togglePrecioSeleccionado = useAppStore(s => s.togglePrecioSeleccionado)
  const selected = useMemo(() => new Set(seleccionadosIds), [seleccionadosIds])
  const [filterCat, setFilterCat] = useState('Todos')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string|null>(null)
  const [mostrarArchivados, setMostrarArchivados] = useState(false)
  const [showValModal, setShowValModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selIcon, setSelIcon] = useState('📦')
  const [form, setForm] = useState({ nombre:'', categoria:'Servicios', icono:'📦' })
  const [valForm, setValForm] = useState({ item_id:'', mes:new Date().toISOString().slice(0,7), valor:'' })
  const [buscarEgreso, setBuscarEgreso] = useState('')

  const sb = createClient()

  const loadHistorial = async (itemIds: string[]) => {
    setLoadingHist(true)
    try {
      const { data } = await sb.from('precio_historial').select('*').in('item_id', itemIds).order('mes')
      if (data) {
        const map: Record<string,PrecioHistorial[]> = {}
        data.forEach(h => { if(!map[h.item_id]) map[h.item_id]=[]; map[h.item_id].push(h) })
        setHistorial(p=>({...p,...map}))
      }
    } finally { setLoadingHist(false) }
  }

  // Al entrar (o volver de otra página), recargar el historial de lo que ya estaba
  // seleccionado — la selección persiste, el historial en memoria no hace falta.
  useEffect(() => {
    if (seleccionadosIds.length > 0) loadHistorial(seleccionadosIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // El modal "Agregar valor" necesita el historial del ítem elegido para saber qué
  // Egresos ya están vinculados (y marcarlos en azul) — puede no estar cargado si el
  // ítem no está en la comparación activa.
  useEffect(() => {
    if (showValModal && valForm.item_id && !historial[valForm.item_id]) loadHistorial([valForm.item_id])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showValModal, valForm.item_id])

  const toggleSelect = async (id: string) => {
    if (!selected.has(id) && !historial[id]) await loadHistorial([id])
    togglePrecioSeleccionado(id)
  }

  const filtered = useMemo(()=>(items??[])
    .filter(i=>mostrarArchivados ? i.archivado : !i.archivado)
    .filter(i=>filterCat==='Todos'||i.categoria===filterCat)
    .filter(i=>!search||i.nombre.toLowerCase().includes(search.toLowerCase()))
  , [items, filterCat, search, mostrarArchivados])

  // Último valor y variación de cada item
  const itemStats = useMemo(()=>{
    const map: Record<string,{last:number,prev:number,pct:number|null,meses:number}> = {}
    Object.entries(historial).forEach(([id,hist])=>{
      const sorted = [...hist].sort((a,b)=>a.mes.localeCompare(b.mes))
      const last = sorted[sorted.length-1]?.valor ?? 0
      const prev = sorted[sorted.length-2]?.valor ?? 0
      const pct  = prev>0 ? ((last-prev)/prev)*100 : null
      map[id] = { last, prev, pct, meses:sorted.length }
    })
    return map
  }, [historial])

  // Datos para el gráfico de líneas
  const chartData = useMemo(()=>{
    const selItems = [...selected].map(id=>(items??[]).find(i=>i.id===id)).filter(Boolean) as PrecioItem[]
    if (selItems.length===0) return []
    const allMeses = [...new Set(selItems.flatMap(i=>(historial[i.id]??[]).map(h=>h.mes)))].sort()
    return allMeses.map(mes=>({
      mes: mes.slice(5), // solo MM
      ...Object.fromEntries(selItems.map(i=>[i.id,(historial[i.id]??[]).find(h=>h.mes===mes)?.valor??null]))
    }))
  }, [selected, historial, items])

  const openNewItem = () => { setEditId(null); setForm({nombre:'',categoria:'Servicios',icono:'📦'}); setSelIcon('📦'); setShowModal(true) }
  const openEditItem = (item: PrecioItem) => {
    setEditId(item.id); setForm({ nombre:item.nombre, categoria:item.categoria, icono:item.icono }); setSelIcon(item.icono); setShowModal(true)
  }

  const saveItem = async () => {
    if (!form.nombre) return
    setSaving(true)
    try {
      if (editId) {
        await updatePrecioItem(editId, { nombre:form.nombre, categoria:form.categoria, icono:selIcon })
      } else {
        const { data: { user } } = await sb.auth.getUser()
        if (!user) return
        await sb.from('precio_items').insert({ nombre:form.nombre, categoria:form.categoria, icono:selIcon, user_id:user.id })
      }
      setShowModal(false); setEditId(null); setForm({nombre:'',categoria:'Servicios',icono:'📦'}); refetch()
    } finally { setSaving(false) }
  }

  const handleArchivar = async (item: PrecioItem, archivar: boolean) => {
    await archivarPrecioItem(item.id, archivar)
    if (selected.has(item.id)) togglePrecioSeleccionado(item.id)
    refetch()
  }

  const handleEliminar = async (item: PrecioItem) => {
    if (!confirm(`¿Eliminar "${item.nombre}" y todo su historial de precios? No se puede deshacer.`)) return
    await deletePrecioItem(item.id)
    if (selected.has(item.id)) togglePrecioSeleccionado(item.id)
    refetch()
  }

  const saveValor = async () => {
    if (!valForm.valor||!valForm.item_id) return
    setSaving(true)
    try {
      await sb.from('precio_historial').upsert({ item_id:valForm.item_id, mes:valForm.mes, valor:parseFloat(valForm.valor), moneda:'ARS', egreso_id:null }, { onConflict:'item_id,mes' })
      await loadHistorial([valForm.item_id])
      setShowValModal(false)
    } finally { setSaving(false) }
  }

  // Egresos que podrían corresponder al ítem seleccionado — para no tipear el monto a mano
  // cuando ya existe el gasto real cargado en Egresos.
  const egresosSugeridos = useMemo(() => {
    const itemNombre = (items??[]).find(i=>i.id===valForm.item_id)?.nombre?.toLowerCase() ?? ''
    const q = (buscarEgreso || itemNombre).toLowerCase()
    if (!q) return []
    return (egresos??[])
      .filter(e => e.descripcion.toLowerCase().includes(q))
      .sort((a,b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 6)
  }, [egresos, buscarEgreso, valForm.item_id, items])

  // Egresos que ya están cargados como valor de este ítem (se ven en azul en la lista) —
  // tocar uno ya vinculado lo saca de la comparación, tocar uno suelto lo agrega.
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const egresoIdsVinculados = new Set((historial[valForm.item_id] ?? []).map(h => h.egreso_id).filter(Boolean))

  const toggleEgresoVinculado = async (e: Egreso) => {
    setLinkingId(e.id)
    try {
      if (egresoIdsVinculados.has(e.id)) {
        await sb.from('precio_historial').delete().eq('item_id', valForm.item_id).eq('egreso_id', e.id)
      } else {
        await sb.from('precio_historial').upsert(
          { item_id: valForm.item_id, mes: e.fecha.slice(0,7), valor: e.monto, moneda: 'ARS', egreso_id: e.id },
          { onConflict: 'item_id,mes' }
        )
      }
      await loadHistorial([valForm.item_id])
    } finally { setLinkingId(null) }
  }

  if (loading && !items) return <LoadingSpinner />

  const selItems = [...selected].map(id=>(items??[]).find(i=>i.id===id)).filter(Boolean) as PrecioItem[]

  return (
    <div>
      <PageHeader title="Precios recurrentes" subtitle="Seguimiento de variación mensual en ítems fijos"
        action={<button className="btn-primary" onClick={openNewItem}>+ Nuevo ítem</button>} />

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap mb-5 items-center">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">⌕</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar ítem..." className="input-field pl-8 py-1.5 text-xs" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {['Todos',...CATS_PRECIO].map(c=>(
            <button key={c} onClick={()=>setFilterCat(c)} className={`chip text-xs py-1 px-3 ${filterCat===c?'chip-on':''}`}>{c}</button>
          ))}
        </div>
        <button onClick={()=>setMostrarArchivados(a=>!a)} className={`chip text-xs py-1 px-3 ml-auto ${mostrarArchivados?'chip-on':''}`}>
          {mostrarArchivados ? '✓ ' : ''}Archivados
        </button>
      </div>

      {/* Grid de items */}
      {filtered.length===0 ? (
        <EmptyState icon="📊" title="Sin ítems registrados" description="Agregá ítems para hacer seguimiento de precios." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {filtered.map((item,idx)=>{
            const stats = itemStats[item.id]
            const hist  = historial[item.id]??[]
            const color = COLORES_PRECIO[item.categoria]||'#888780'
            const on    = selected.has(item.id)
            const isSal = item.categoria==='Salarios'
            const pctGood = stats?.pct!=null ? (isSal ? stats.pct>=0 : stats.pct<=0) : null

            // Sparkline data
            const sparkVals = [...hist].sort((a,b)=>a.mes.localeCompare(b.mes)).map(h=>h.valor)
            const sparkMax  = Math.max(...sparkVals,1)
            const sparkMin  = Math.min(...sparkVals,0)

            return (
              <div key={item.id} onClick={()=>toggleSelect(item.id)}
                className={`bg-white border-2 rounded-2xl p-5 cursor-pointer transition-all shadow-card hover:shadow-card-hover`}
                style={on?{borderColor:'#40B046', background:'#F3FBF3'}:{borderColor:'#f1f5f9'}}>
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{item.icono}</span>
                    <div>
                      <div className="text-slate-900 font-semibold text-sm">{item.nombre}</div>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{background:color+'18',color}}>{item.categoria}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all`}
                      style={on?{background:'#40B046',borderColor:'#40B046'}:{borderColor:'#cbd5e1'}}>
                      {on&&<span className="text-white text-[9px] font-bold">✓</span>}
                    </div>
                    <div onClick={e=>e.stopPropagation()}>
                      <RowMenu items={[
                        { label: 'Editar', onClick: () => openEditItem(item) },
                        { label: item.archivado ? 'Reactivar' : 'Archivar', onClick: () => handleArchivar(item, !item.archivado) },
                        { label: 'Eliminar', onClick: () => handleEliminar(item), danger: true },
                      ]} />
                    </div>
                  </div>
                </div>

                {stats ? (
                  <>
                    <div className="text-2xl font-bold font-mono mb-1" style={{color}}>{fmt(stats.last,m)}</div>
                    {stats.pct!=null && (
                      <div className={`text-xs font-bold mb-3 ${pctGood?'text-emerald-600':'text-red-600'}`}>
                        {stats.pct>=0?'▲':'▼'} {Math.abs(stats.pct).toFixed(1)}% vs anterior
                      </div>
                    )}
                    {sparkVals.length>1 && (
                      <div className="flex items-end gap-0.5 h-8 mb-3">
                        {sparkVals.map((v,i)=>{
                          const h = sparkMax>sparkMin ? Math.max(20,Math.round(((v-sparkMin)/(sparkMax-sparkMin))*100)) : 50
                          const isLast = i===sparkVals.length-1
                          return <div key={i} className="flex-1 rounded-sm transition-all" style={{height:`${h}%`,background:isLast?color:color+'55'}} />
                        })}
                      </div>
                    )}
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Total: {stats.meses} registros</span>
                      <span>Inicial: {fmt(sparkVals[0]??0,m)}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-slate-300 text-xs py-2">Click para cargar historial</div>
                )}

                <button onClick={e=>{e.stopPropagation();setValForm(p=>({...p,item_id:item.id}));setBuscarEgreso('');setShowValModal(true)}}
                  className="mt-3 w-full text-xs text-slate-400 hover:text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg py-1.5 bg-transparent cursor-pointer transition-all">
                  + Agregar valor
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Gráfico comparativo */}
      {selItems.length>0 && chartData.length>0 && (
        <Card className="mb-5">
          <div className="text-slate-900 font-semibold text-[15px] mb-1">Evolución comparativa</div>
          <div className="text-slate-400 text-xs mb-4">{selItems.length} ítem{selItems.length>1?'s':''} seleccionado{selItems.length>1?'s':''}</div>
          <div className="flex gap-3 flex-wrap mb-3">
            {selItems.map((item,i)=>(
              <div key={item.id} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{background:CHART_COLORS[i%CHART_COLORS.length]}} />
                <span className="text-slate-500 text-xs">{item.nombre}</span>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mes" tick={{fill:'#94a3b8',fontSize:11}} axisLine={false} tickLine={false} />
              <YAxis tick={{fill:'#94a3b8',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>fmt(v,m)} />
              <Tooltip contentStyle={TT} formatter={(v:number,n:string)=>[fmt(v,m),(items??[]).find(i=>i.id===n)?.nombre||n]} />
              {selItems.map((item,i)=>(
                <Line key={item.id} dataKey={item.id} stroke={CHART_COLORS[i%CHART_COLORS.length]}
                  strokeWidth={2.5} dot={{r:3}} type="monotone" connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Tabla variaciones */}
      {selItems.length>0 && (
        <Card>
          <div className="text-slate-900 font-semibold text-[15px] mb-4">Detalle de variaciones</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-slate-400 text-[11px] font-bold uppercase tracking-widest pb-3 border-b border-slate-100">Ítem</th>
                  {[...new Set(selItems.flatMap(i=>(historial[i.id]??[]).map(h=>h.mes)))].sort().map(mes=>(
                    <th key={mes} className="text-right text-slate-400 text-[11px] font-bold uppercase tracking-widest pb-3 border-b border-slate-100 px-2">{mes.slice(5)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selItems.map((item,idx)=>{
                  const hist = [...(historial[item.id]??[])].sort((a,b)=>a.mes.localeCompare(b.mes))
                  const color = CHART_COLORS[idx%CHART_COLORS.length]
                  const allMeses = [...new Set(selItems.flatMap(i=>(historial[i.id]??[]).map(h=>h.mes)))].sort()
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="py-3 border-b border-slate-50">
                        <div className="flex items-center gap-2">
                          <span>{item.icono}</span>
                          <div>
                            <div className="text-sm font-medium text-slate-700">{item.nombre}</div>
                            <div className="text-xs text-slate-400">{item.categoria}</div>
                          </div>
                        </div>
                      </td>
                      {allMeses.map((mes,i)=>{
                        const h    = hist.find(x=>x.mes===mes)
                        const prev = i>0 ? hist.find(x=>x.mes===allMeses[i-1]) : null
                        const pct  = h&&prev&&prev.valor>0 ? ((h.valor-prev.valor)/prev.valor)*100 : null
                        const isSal = item.categoria==='Salarios'
                        return (
                          <td key={mes} className="py-3 px-2 text-right border-b border-slate-50">
                            <div className="font-mono text-sm font-bold" style={{color}}>{h?fmt(h.valor,m):'—'}</div>
                            {pct!=null&&<div className={`text-[10px] font-bold ${(isSal?pct>=0:pct<=0)?'text-emerald-600':'text-red-600'}`}>{pct>=0?'▲':'▼'}{Math.abs(pct).toFixed(1)}%</div>}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal nuevo/editar ítem */}
      <Modal open={showModal} onClose={()=>{setShowModal(false); setEditId(null)}} title={editId ? 'Editar ítem' : 'Nuevo ítem'}>
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Nombre</FieldLabel><input value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Ej: Luz departamento" className="input-field" /></div>
          <div><FieldLabel>Categoría</FieldLabel>
            <select value={form.categoria} onChange={e=>setForm(p=>({...p,categoria:e.target.value}))} className="input-field">
              {CATS_PRECIO.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><FieldLabel>Ícono</FieldLabel>
            <div className="flex flex-wrap gap-2 mt-1">
              {ICONOS.map(ic=>(
                <button key={ic} onClick={()=>setSelIcon(ic)}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg cursor-pointer border-2 transition-all ${selIcon===ic?'border-blue-700 bg-blue-50':'border-slate-200 bg-slate-50'}`}>
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={()=>{setShowModal(false); setEditId(null)}} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={saveItem} disabled={saving||!form.nombre} className="btn-primary flex-1 disabled:opacity-50">{saving?'Guardando...':'Guardar'}</button>
          </div>
        </div>
      </Modal>

      {/* Modal agregar valor */}
      <Modal open={showValModal} onClose={()=>{setShowValModal(false); setBuscarEgreso('')}} title="Agregar valor">
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Ítem</FieldLabel>
            <select value={valForm.item_id} onChange={e=>setValForm(p=>({...p,item_id:e.target.value}))} className="input-field">
              <option value="">Seleccioná un ítem</option>
              {(items??[]).map(i=><option key={i.id} value={i.id}>{i.icono} {i.nombre}</option>)}
            </select>
          </div>

          {valForm.item_id && (
            <div>
              <FieldLabel>Gastos ya cargados — tocá para sumarlos o sacarlos de la comparación</FieldLabel>
              <input value={buscarEgreso} onChange={e=>setBuscarEgreso(e.target.value)} placeholder="Buscar en Egresos..." className="input-field text-sm mb-1.5" />
              {egresosSugeridos.length > 0 && (
                <div className="flex flex-col gap-1 max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-1">
                  {egresosSugeridos.map(e => {
                    const vinculado = egresoIdsVinculados.has(e.id)
                    return (
                      <button key={e.id} onClick={()=>toggleEgresoVinculado(e)} type="button" disabled={linkingId===e.id}
                        className="flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer text-left transition-all disabled:opacity-50"
                        style={vinculado ? { background:'#EFF4FE', border:'1.5px solid #1A5E9E' } : { background:'transparent', border:'1.5px solid transparent' }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-2"
                            style={vinculado ? { background:'#1A5E9E', borderColor:'#1A5E9E' } : { borderColor:'#cbd5e1' }}>
                            {vinculado && <span className="text-white text-[9px] font-bold">✓</span>}
                          </div>
                          <span className="text-xs text-slate-600 truncate">{e.descripcion} · {fmtDate(e.fecha)}</span>
                        </div>
                        <span className="text-xs font-mono text-slate-500 flex-shrink-0 ml-2">{fmt(e.monto, e.moneda as any)}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <div className="text-[11px] text-slate-400 -mt-1">O cargá un valor a mano, sin vincular a ningún gasto:</div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Mes</FieldLabel><input type="month" value={valForm.mes} onChange={e=>setValForm(p=>({...p,mes:e.target.value}))} className="input-field" /></div>
            <div><FieldLabel>Valor ($)</FieldLabel><MontoInput value={valForm.valor} onChange={raw=>setValForm(p=>({...p,valor:raw}))} placeholder="0" /></div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={()=>{setShowValModal(false); setBuscarEgreso('')}} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={saveValor} disabled={saving||!valForm.valor||!valForm.item_id} className="btn-primary flex-1 disabled:opacity-50">{saving?'Guardando...':'Guardar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
