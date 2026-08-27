'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getMovimientosUnificados, getTarjetaTransaccionesVista, getCategoriasUnificadasDistintas,
  getIdsMovimientosUnificados, getIdsTarjetaTransaccionesVista,
  getMovimientosUnificadosPorIds, getTarjetaTransaccionesVistaPorIds,
  getTodosMovimientosUnificados, getTodasTarjetaTransaccionesVista,
  updateEgreso, updateIngreso, updateTarjetaTransaccion,
  deleteEgreso, deleteIngreso, deleteTarjetaTransaccion,
  createEgreso, createIngreso, createTarjetaTransaccion,
  setEtiquetasDeEgreso, setEtiquetasDeIngreso, setEtiquetasDeTarjetaTransaccion,
  aplicarContribucionPorEtiquetas, getCalidadHallazgosPendientes,
} from '@/lib/queries'
import { useEtiquetas, useProyectos, useAhorros, useMetas } from '@/hooks'
import { fmtFull, fmtDate } from '@/lib/utils/formatters'
import { PageHeader, Card, RowMenu } from '@/components/ui'
import { EtiquetaPickerModal } from '@/components/ui/Etiquetas'
import type { MovimientoUnificado, TarjetaTransaccionVista, Moneda } from '@/types'

const PAGE_SIZE = 30
type EntidadTipo = 'ingreso' | 'egreso' | 'tarjeta_transaccion'
type Fila = MovimientoUnificado | TarjetaTransaccionVista

export default function MovimientosPage() {
  const [tab, setTab] = useState<'general' | 'tarjetas'>('general')
  const { data: etiquetas } = useEtiquetas()
  const { data: proyectos } = useProyectos()
  const { data: ahorros } = useAhorros()
  const { data: metas } = useMetas()

  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [searchAplicado, setSearchAplicado] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'ingreso' | 'egreso'>('todos')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroEtiqueta, setFiltroEtiqueta] = useState('')
  const [ordenCampo, setOrdenCampo] = useState<'fecha' | 'monto'>('fecha')
  const [ordenAsc, setOrdenAsc] = useState(false)

  const [filas, setFilas] = useState<Fila[]>([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [categorias, setCategorias] = useState<string[]>([])
  const [hallazgosSet, setHallazgosSet] = useState<Set<string>>(new Set())

  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [entidadPorId, setEntidadPorId] = useState<Record<string, EntidadTipo>>({})
  const [todosMatchingSeleccionados, setTodosMatchingSeleccionados] = useState(false)
  const [accionLote, setAccionLote] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [catLoteAbierto, setCatLoteAbierto] = useState(false)
  const [catLoteValor, setCatLoteValor] = useState('')
  const [renombrarAbierto, setRenombrarAbierto] = useState(false)
  const [renombrarValor, setRenombrarValor] = useState('')
  const [etiquetarPickerAbierto, setEtiquetarPickerAbierto] = useState(false)
  const [etiquetarTipoElegido, setEtiquetarTipoElegido] = useState<'proyecto'|'ahorro'|'meta'|null>(null)
  const [exportando, setExportando] = useState(false)

  const [deshacer, setDeshacer] = useState<{ label: string; accion: () => Promise<void> } | null>(null)
  const deshacerTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mostrarDeshacer = (label: string, accion: () => Promise<void>) => {
    if (deshacerTimeout.current) clearTimeout(deshacerTimeout.current)
    setDeshacer({ label, accion })
    deshacerTimeout.current = setTimeout(() => setDeshacer(null), 8000)
  }

  const entidadDe = (row: Fila): EntidadTipo => 'tipo_movimiento' in row ? row.tipo_movimiento : 'tarjeta_transaccion'

  const filtrosActuales = { tipo: filtroTipo, categoria: filtroCategoria || undefined, etiquetaId: filtroEtiqueta || undefined, search: searchAplicado || undefined }

  const cargar = async () => {
    setCargando(true)
    try {
      if (tab === 'general') {
        const { rows, total } = await getMovimientosUnificados({ page, pageSize: PAGE_SIZE, ordenCampo, ordenAsc, ...filtrosActuales })
        setFilas(rows); setTotal(total)
        setEntidadPorId(prev => { const n = { ...prev }; rows.forEach(r => n[r.id] = entidadDe(r)); return n })
      } else {
        const { rows, total } = await getTarjetaTransaccionesVista({ page, pageSize: PAGE_SIZE, ordenCampo, ordenAsc, categoria: filtroCategoria || undefined, etiquetaId: filtroEtiqueta || undefined, search: searchAplicado || undefined })
        setFilas(rows); setTotal(total)
        setEntidadPorId(prev => { const n = { ...prev }; rows.forEach(r => n[r.id] = 'tarjeta_transaccion'); return n })
      }
    } finally { setCargando(false) }
  }

  useEffect(() => { cargar() }, [tab, page, filtroTipo, filtroCategoria, filtroEtiqueta, searchAplicado, ordenCampo, ordenAsc])
  useEffect(() => { setPage(0); setSeleccionados(new Set()); setTodosMatchingSeleccionados(false) }, [tab, filtroTipo, filtroCategoria, filtroEtiqueta, searchAplicado])
  useEffect(() => { getCategoriasUnificadasDistintas().then(setCategorias).catch(()=>{}) }, [])
  useEffect(() => {
    getCalidadHallazgosPendientes().then(hs => setHallazgosSet(new Set(hs.map(h => `${h.entidad}|${h.entidad_id}`)))).catch(()=>{})
  }, [])

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const tieneHallazgo = (row: Fila) => hallazgosSet.has(`${entidadDe(row)}|${row.id}`)

  const toggleSel = (id: string) => { setTodosMatchingSeleccionados(false); setSeleccionados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const toggleSelPagina = () => { setTodosMatchingSeleccionados(false); setSeleccionados(prev => prev.size === filas.length ? new Set() : new Set(filas.map(f => f.id))) }

  const seleccionarTodosMatching = async () => {
    setProcesando(true)
    try {
      if (tab === 'general') {
        const ids = await getIdsMovimientosUnificados(filtrosActuales)
        setEntidadPorId(prev => { const n = { ...prev }; ids.forEach(r => n[r.id] = r.tipo_movimiento); return n })
        setSeleccionados(new Set(ids.map(r => r.id)))
      } else {
        const ids = await getIdsTarjetaTransaccionesVista({ categoria: filtroCategoria || undefined, etiquetaId: filtroEtiqueta || undefined, search: searchAplicado || undefined })
        setEntidadPorId(prev => { const n = { ...prev }; ids.forEach(r => n[r.id] = 'tarjeta_transaccion'); return n })
        setSeleccionados(new Set(ids.map(r => r.id)))
      }
      setTodosMatchingSeleccionados(true)
    } finally { setProcesando(false) }
  }

  const actualizarCategoria = (entidad: EntidadTipo, id: string, categoria: string) => {
    if (entidad === 'ingreso') return updateIngreso(id, { categoria } as any)
    if (entidad === 'egreso') return updateEgreso(id, { categoria })
    return updateTarjetaTransaccion(id, { categoria })
  }
  const actualizarDescripcion = (entidad: EntidadTipo, id: string, descripcion: string) => {
    if (entidad === 'ingreso') return updateIngreso(id, { descripcion })
    if (entidad === 'egreso') return updateEgreso(id, { descripcion })
    return updateTarjetaTransaccion(id, { descripcion })
  }
  const etiquetarMovimiento = (entidad: EntidadTipo, id: string, ids: string[]) => {
    if (entidad === 'ingreso') return setEtiquetasDeIngreso(id, ids)
    if (entidad === 'egreso') return setEtiquetasDeEgreso(id, ids)
    return setEtiquetasDeTarjetaTransaccion(id, ids)
  }
  const eliminarMovimiento = (entidad: EntidadTipo, id: string) => {
    if (entidad === 'ingreso') return deleteIngreso(id)
    if (entidad === 'egreso') return deleteEgreso(id)
    return deleteTarjetaTransaccion(id)
  }
  const recrearMovimiento = async (entidad: EntidadTipo, snap: Fila) => {
    let nuevoId: string
    if (entidad === 'ingreso') { const r = snap as MovimientoUnificado; nuevoId = (await createIngreso({ tipo: r.categoria, monto: r.monto, moneda: r.moneda, descripcion: r.descripcion, fecha: r.fecha, quien: r.quien, recurrente: false } as any)).id }
    else if (entidad === 'egreso') { const r = snap as MovimientoUnificado; nuevoId = (await createEgreso({ categoria: r.categoria, monto: r.monto, moneda: r.moneda, descripcion: r.descripcion, fecha: r.fecha, quien: r.quien, recurrente: false } as any)).id }
    else { const r = snap as TarjetaTransaccionVista; nuevoId = (await createTarjetaTransaccion({ tarjeta_id: r.tarjeta_id, categoria: r.categoria, monto: r.monto, moneda: r.moneda, descripcion: r.descripcion, fecha: r.fecha, tipo: (r.tipo as any) || 'credito', origen: 'manual', estado_conciliacion: 'cargado' } as any)).id }
    if (snap.etiqueta_ids.length > 0) await etiquetarMovimiento(entidad, nuevoId, snap.etiqueta_ids)
  }
  const duplicarMovimiento = async (row: Fila) => { await recrearMovimiento(entidadDe(row), row); cargar() }

  const rutaEditar: Record<EntidadTipo, string> = { ingreso: '/dashboard/ingresos', egreso: '/dashboard/egresos', tarjeta_transaccion: '/dashboard/tarjetas' }

  // ── Acciones en lote (con snapshot para poder deshacer) ──────────────────────
  const handleAplicarCategoriaLote = async () => {
    if (!catLoteValor.trim()) return
    setProcesando(true)
    try {
      const ids = [...seleccionados]
      const snapshots: { entidad: EntidadTipo; id: string; antes: string }[] = []
      for (const id of ids) {
        const entidad = entidadPorId[id]; if (!entidad) continue
        const rowActual = filas.find(f => f.id === id)
        snapshots.push({ entidad, id, antes: rowActual?.categoria ?? '' })
        await actualizarCategoria(entidad, id, catLoteValor.trim())
      }
      setCatLoteAbierto(false); setCatLoteValor(''); setSeleccionados(new Set()); setTodosMatchingSeleccionados(false); cargar()
      mostrarDeshacer(`Cambiaste la categoría de ${snapshots.length} movimientos.`, async () => {
        for (const s of snapshots) if (s.antes) await actualizarCategoria(s.entidad, s.id, s.antes)
        cargar()
      })
    } finally { setProcesando(false) }
  }

  const handleAplicarRenombrarLote = async () => {
    if (!renombrarValor.trim()) return
    setProcesando(true)
    try {
      const ids = [...seleccionados]
      const snapshots: { entidad: EntidadTipo; id: string; antes: string }[] = []
      for (const id of ids) {
        const entidad = entidadPorId[id]; if (!entidad) continue
        const rowActual = filas.find(f => f.id === id)
        snapshots.push({ entidad, id, antes: rowActual?.descripcion ?? '' })
        await actualizarDescripcion(entidad, id, renombrarValor.trim())
      }
      setRenombrarAbierto(false); setRenombrarValor(''); setSeleccionados(new Set()); setTodosMatchingSeleccionados(false); cargar()
      mostrarDeshacer(`Renombraste ${snapshots.length} movimientos.`, async () => {
        for (const s of snapshots) if (s.antes) await actualizarDescripcion(s.entidad, s.id, s.antes)
        cargar()
      })
    } finally { setProcesando(false) }
  }

  const handleEliminarLote = async () => {
    if (!confirm(`¿Eliminar ${seleccionados.size} movimientos?`)) return
    setProcesando(true)
    try {
      const ids = [...seleccionados]
      const idsGeneral = ids.filter(id => entidadPorId[id] === 'ingreso' || entidadPorId[id] === 'egreso')
      const idsTarjeta = ids.filter(id => entidadPorId[id] === 'tarjeta_transaccion')
      const snapsGeneral = idsGeneral.length ? await getMovimientosUnificadosPorIds(idsGeneral) : []
      const snapsTarjeta = idsTarjeta.length ? await getTarjetaTransaccionesVistaPorIds(idsTarjeta) : []
      const snapshots: { entidad: EntidadTipo; row: Fila }[] = [
        ...snapsGeneral.map(r => ({ entidad: entidadDe(r), row: r as Fila })),
        ...snapsTarjeta.map(r => ({ entidad: 'tarjeta_transaccion' as EntidadTipo, row: r as Fila })),
      ]
      for (const id of ids) { const entidad = entidadPorId[id]; if (entidad) await eliminarMovimiento(entidad, id) }
      setSeleccionados(new Set()); setTodosMatchingSeleccionados(false); cargar()
      mostrarDeshacer(`Eliminaste ${snapshots.length} movimientos.`, async () => {
        for (const s of snapshots) await recrearMovimiento(s.entidad, s.row)
        cargar()
      })
    } finally { setProcesando(false) }
  }

  const handleAplicarLote = () => {
    if (seleccionados.size === 0 || !accionLote) return
    if (accionLote === 'categoria') setCatLoteAbierto(true)
    else if (accionLote === 'renombrar') setRenombrarAbierto(true)
    else if (accionLote === 'eliminar') handleEliminarLote()
    else if (accionLote === 'etiqueta') setEtiquetarPickerAbierto(true)
  }

  // ── Asociar etiqueta en lote: agrega los ids elegidos a lo que cada movimiento
  //    ya tenía de ese mismo tipo (no reemplaza), y si es ahorro/meta también
  //    aplica el aporte automático por cada movimiento, igual que de a uno. ──────
  const handleConfirmEtiquetaLote = async (idsElegidos: string[]) => {
    if (!etiquetarTipoElegido) return
    setProcesando(true)
    try {
      const ids = [...seleccionados]
      const idsGeneral = ids.filter(id => entidadPorId[id] === 'ingreso' || entidadPorId[id] === 'egreso')
      const idsTarjeta = ids.filter(id => entidadPorId[id] === 'tarjeta_transaccion')
      const filasCompletas: Fila[] = [
        ...(idsGeneral.length ? await getMovimientosUnificadosPorIds(idsGeneral) : []),
        ...(idsTarjeta.length ? await getTarjetaTransaccionesVistaPorIds(idsTarjeta) : []),
      ]
      for (const row of filasCompletas) {
        const entidad = entidadDe(row)
        const idsAntes = row.etiqueta_ids
        const idsDelTipo = new Set((etiquetas ?? []).filter(e => e.tipo === etiquetarTipoElegido).map(e => e.id))
        const idsOtrosTipos = idsAntes.filter(id => !idsDelTipo.has(id))
        const idsDespues = [...new Set([...idsOtrosTipos, ...idsAntes.filter(id => idsDelTipo.has(id)), ...idsElegidos])]
        await etiquetarMovimiento(entidad, row.id, idsDespues)
        if (etiquetarTipoElegido === 'ahorro' || etiquetarTipoElegido === 'meta') {
          await aplicarContribucionPorEtiquetas({
            idsAntes, idsDespues, etiquetas: etiquetas ?? [], ahorros: ahorros ?? [], metas: metas ?? [],
            monto: row.monto, moneda: row.moneda, fecha: row.fecha,
            signo: entidad === 'ingreso' ? -1 : 1,
            nota: `Lote: ${row.descripcion}`,
          })
        }
      }
      setEtiquetarTipoElegido(null); setSeleccionados(new Set()); setTodosMatchingSeleccionados(false); cargar()
    } finally { setProcesando(false) }
  }

  // ── Exportar a CSV lo que matchea el filtro actual (sin paginar) ─────────────
  const exportarCSV = async () => {
    setExportando(true)
    try {
      const rows: Fila[] = tab === 'general'
        ? await getTodosMovimientosUnificados(filtrosActuales)
        : await getTodasTarjetaTransaccionesVista({ categoria: filtroCategoria || undefined, etiquetaId: filtroEtiqueta || undefined, search: searchAplicado || undefined })
      const headers = tab === 'general' ? ['Descripción','Categoría','Tipo','Monto','Moneda','Fecha'] : ['Descripción','Categoría','Monto','Moneda','Fecha']
      const lineas = rows.map(r => {
        const base = [r.descripcion, r.categoria]
        if (tab === 'general') base.push(entidadDe(r))
        base.push(String(r.monto), r.moneda, r.fecha)
        return base.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')
      })
      const csv = [headers.join(','), ...lineas].join('\n')
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `movimientos_${tab}_${new Date().toISOString().slice(0,10)}.csv`
      a.click(); URL.revokeObjectURL(url)
    } finally { setExportando(false) }
  }

  const etiquetaNombre = (id: string) => (etiquetas ?? []).find(e => e.id === id)?.nombre ?? id
  const toggleOrden = (campo: 'fecha'|'monto') => { if (ordenCampo===campo) setOrdenAsc(a=>!a); else { setOrdenCampo(campo); setOrdenAsc(false) } }
  const flechaOrden = (campo: 'fecha'|'monto') => ordenCampo===campo ? (ordenAsc?'▲':'▼') : ''

  return (
    <div>
      <PageHeader title="Todos los movimientos" subtitle="Buscá, filtrá y hacé cambios masivos en Ingresos, Egresos y Tarjetas"
        action={<button onClick={exportarCSV} disabled={exportando} className="btn-ghost text-sm disabled:opacity-50">{exportando?'Exportando...':'Exportar CSV'}</button>} />

      <div className="flex gap-1 border-b border-slate-200 mb-4">
        {(['general','tarjetas'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setAccionLote('') }}
            className={`px-3.5 py-2 text-sm border-none bg-transparent cursor-pointer -mb-px ${tab === t ? 'border-b-2 border-blue-700 text-slate-900 font-medium' : 'text-slate-500'}`}>
            {t === 'general' ? 'Ingresos y Egresos' : 'Tarjetas'}
          </button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap items-center mb-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==='Enter' && setSearchAplicado(search)}
            placeholder="Buscar descripción..." className="input-field text-xs py-1.5" />
        </div>
        <button onClick={()=>setSearchAplicado(search)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 cursor-pointer">Buscar</button>
        {tab === 'general' && (
          <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value as any)} className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600">
            <option value="todos">Todos</option>
            <option value="ingreso">Solo ingresos</option>
            <option value="egreso">Solo egresos</option>
          </select>
        )}
        <select value={filtroCategoria} onChange={e=>setFiltroCategoria(e.target.value)} className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600">
          <option value="">Toda categoría</option>
          {categorias.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filtroEtiqueta} onChange={e=>setFiltroEtiqueta(e.target.value)} className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600">
          <option value="">Toda etiqueta</option>
          {(etiquetas ?? []).map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        <span className="text-xs text-slate-400 ml-auto">{total} en total</span>
      </div>

      <Card padding="sm">
        <div className="flex items-center gap-2 mb-2 px-1 flex-wrap">
          <select value={accionLote} onChange={e=>setAccionLote(e.target.value)} className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600">
            <option value="">Acciones en lote</option>
            <option value="categoria">Cambiar categoría</option>
            <option value="etiqueta">Asociar etiqueta</option>
            <option value="renombrar">Renombrar</option>
            <option value="eliminar">Eliminar</option>
          </select>
          <button onClick={handleAplicarLote} disabled={!accionLote || seleccionados.size === 0 || procesando}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-40">Aplicar</button>
          {seleccionados.size > 0 && (
            <span className="text-xs text-slate-400">
              {seleccionados.size} seleccionados
              {!todosMatchingSeleccionados && total > filas.length && (
                <button onClick={seleccionarTodosMatching} disabled={procesando} className="text-blue-700 underline ml-2 border-none bg-transparent cursor-pointer">seleccionar los {total} que matchean el filtro</button>
              )}
            </span>
          )}
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className={`grid ${tab==='general'?'grid-cols-[28px_1fr_120px_100px_100px_100px_40px]':'grid-cols-[28px_1fr_120px_100px_100px_40px]'} items-center px-3 py-2 bg-slate-50 text-[11px] text-slate-400 font-medium`}>
            <input type="checkbox" checked={filas.length>0 && seleccionados.size === filas.length} onChange={toggleSelPagina} />
            <span>Descripción</span>
            <span>Categoría</span>
            {tab==='general' && <span>Tipo</span>}
            <button onClick={()=>toggleOrden('monto')} className="text-left border-none bg-transparent cursor-pointer text-[11px] text-slate-400 font-medium p-0">Monto {flechaOrden('monto')}</button>
            <button onClick={()=>toggleOrden('fecha')} className="text-left border-none bg-transparent cursor-pointer text-[11px] text-slate-400 font-medium p-0">Fecha {flechaOrden('fecha')}</button>
            <span></span>
          </div>
          {cargando ? (
            <div className="text-center text-slate-400 text-sm py-8">Cargando...</div>
          ) : filas.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-8">Sin resultados.</div>
          ) : filas.map(row => {
            const entidad = entidadDe(row)
            return (
              <div key={row.id} className={`grid ${tab==='general'?'grid-cols-[28px_1fr_120px_100px_100px_100px_40px]':'grid-cols-[28px_1fr_120px_100px_100px_40px]'} items-center px-3 py-2.5 border-t border-slate-100`}>
                <input type="checkbox" checked={seleccionados.has(row.id)} onChange={()=>toggleSel(row.id)} />
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    {tieneHallazgo(row) && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" title="Aparece en Salud de los datos" />}
                    <div className="text-sm text-slate-700 truncate">{row.descripcion}</div>
                  </div>
                  {row.etiqueta_ids.length > 0 && (
                    <div className="flex gap-1 flex-wrap mt-0.5">
                      {row.etiqueta_ids.slice(0,3).map(id => <span key={id} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{etiquetaNombre(id)}</span>)}
                    </div>
                  )}
                </div>
                <span className="text-xs text-slate-600 truncate">{row.categoria}</span>
                {tab==='general' && <span className={`text-xs ${entidad==='ingreso'?'text-emerald-600':'text-slate-500'}`}>{entidad}</span>}
                <span className="text-xs font-mono text-slate-600">{fmtFull(row.monto, row.moneda)}</span>
                <span className="text-xs text-slate-500">{fmtDate(row.fecha)}</span>
                <RowMenu items={[
                  { label: 'Editar', onClick: () => window.open(`${rutaEditar[entidad]}?editar=${row.id}`, '_self') },
                  { label: 'Duplicar', onClick: () => duplicarMovimiento(row) },
                  { label: 'Eliminar', onClick: async () => {
                      if (!confirm('¿Eliminar este movimiento?')) return
                      await eliminarMovimiento(entidad, row.id)
                      cargar()
                      mostrarDeshacer('Eliminaste 1 movimiento.', async () => { await recrearMovimiento(entidad, row); cargar() })
                    }, danger: true },
                ]} />
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between mt-3 px-1">
          <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 cursor-pointer">‹ Anterior</button>
          <span className="text-xs text-slate-400">Página {page+1} de {totalPaginas}</span>
          <button onClick={()=>setPage(p=>Math.min(totalPaginas-1,p+1))} disabled={page>=totalPaginas-1} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 cursor-pointer">Siguiente ›</button>
        </div>
      </Card>

      {catLoteAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={()=>setCatLoteAbierto(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={e=>e.stopPropagation()}>
            <div className="text-slate-900 font-semibold text-sm mb-3">Cambiar categoría — {seleccionados.size} movimientos</div>
            <input value={catLoteValor} onChange={e=>setCatLoteValor(e.target.value)} placeholder="Nombre de la categoría" className="input-field mb-4" autoFocus />
            <div className="flex gap-2">
              <button onClick={()=>setCatLoteAbierto(false)} className="btn-ghost flex-1">Cancelar</button>
              <button onClick={handleAplicarCategoriaLote} disabled={!catLoteValor.trim()||procesando} className="btn-primary flex-1 disabled:opacity-50">Aplicar</button>
            </div>
          </div>
        </div>
      )}

      {renombrarAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={()=>setRenombrarAbierto(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={e=>e.stopPropagation()}>
            <div className="text-slate-900 font-semibold text-sm mb-1">Renombrar — {seleccionados.size} movimientos</div>
            <div className="text-slate-400 text-xs mb-3">Todos los seleccionados van a quedar con esta misma descripción.</div>
            <input value={renombrarValor} onChange={e=>setRenombrarValor(e.target.value)} placeholder="Nueva descripción" className="input-field mb-4" autoFocus />
            <div className="flex gap-2">
              <button onClick={()=>setRenombrarAbierto(false)} className="btn-ghost flex-1">Cancelar</button>
              <button onClick={handleAplicarRenombrarLote} disabled={!renombrarValor.trim()||procesando} className="btn-primary flex-1 disabled:opacity-50">Aplicar</button>
            </div>
          </div>
        </div>
      )}

      {etiquetarPickerAbierto && (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 pt-24" onClick={()=>setEtiquetarPickerAbierto(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={e=>e.stopPropagation()}>
            <div className="text-slate-900 font-semibold text-sm mb-3">Asociar etiqueta — {seleccionados.size} movimientos</div>
            <div className="text-slate-400 text-xs mb-3">Elegí a qué tipo de etiqueta asociar:</div>
            <div className="flex gap-2 mb-1">
              {(['proyecto','ahorro','meta'] as const).map(t => (
                <button key={t} onClick={()=>{ setEtiquetarTipoElegido(t); setEtiquetarPickerAbierto(false) }}
                  className="flex-1 text-xs py-2 rounded-lg border border-slate-200 text-slate-600 hover:border-blue-700 hover:text-blue-700 cursor-pointer capitalize">{t}</button>
              ))}
            </div>
          </div>
        </div>
      )}
      {etiquetarTipoElegido && (
        <EtiquetaPickerModal open={!!etiquetarTipoElegido} onClose={()=>setEtiquetarTipoElegido(null)}
          tipo={etiquetarTipoElegido} etiquetas={etiquetas ?? []} proyectos={proyectos ?? []} ahorros={ahorros ?? []} metas={metas ?? []}
          seleccionadas={[]} onConfirm={handleConfirmEtiquetaLote} />
      )}

      {deshacer && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white rounded-xl px-4 py-3 shadow-lg flex items-center gap-4">
          <span className="text-sm">{deshacer.label}</span>
          <button onClick={async()=>{ const a = deshacer.accion; setDeshacer(null); await a() }} className="text-sm font-semibold text-blue-300 border-none bg-transparent cursor-pointer">Deshacer</button>
        </div>
      )}
    </div>
  )
}
