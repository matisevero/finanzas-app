'use client'
import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAppStore, useMonedasDisponibles } from '@/store/appStore'
import { useTarjetas, useTarjetaTransacciones, usePersonas, useIngresos, useEtiquetas, useProyectos, useAhorros, useMetas, useCategoriasCustom } from '@/hooks'
import { createTarjetaTransaccion, updateTarjetaTransaccion, deleteTarjetaTransaccion, createTarjeta, updateTarjeta, eliminarOArchivarTarjeta, createEvento, getTarjetaPeriodoTotales, getTarjetaPeriodoTotalesTodos, upsertTarjetaPeriodoTotal, getTarjetaTransaccionEtiquetas, setEtiquetasDeTarjetaTransaccion, createProyecto, createAhorro, getEtiquetas, getTarjetaTransacciones, aplicarContribucionPorEtiquetas, getTarjetasComercios, upsertTarjetaComercio, type TarjetaComercio } from '@/lib/queries'
import { fmt, fmtFull, fmtDate } from '@/lib/utils/formatters'
import { MESES, MESES_CORTOS, TIPOS_EGRESO } from '@/lib/utils/constants'
import { calcularTendencia } from '@/lib/utils/tendencia'
import { quienOpciones, colorQuien } from '@/lib/utils/quien'
import { PageHeader, Card, CardTitle, Modal, Table, Th, Td, LoadingSpinner, EmptyState, FieldLabel, ProgressBar, RowMenu } from '@/components/ui'
import { EtiquetaChips, EtiquetaPickerModal } from '@/components/ui/Etiquetas'
import CategoriaSelector from '@/components/ui/CategoriaSelector'
import MultiDropdown from '@/components/ui/MultiDropdown'
import FechaInput from '@/components/ui/FechaInput'
import MontoInput from '@/components/ui/MontoInput'
import type { Moneda, Quien, TarjetaTransaccion, TarjetaPeriodoTotal, CategoriaCustom } from '@/types'

const TT = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, color:'#0f172a' }
const FORM_INIT = { nombre:'', banco:'', limite:'', moneda:'ARS' as Moneda, color:'#1A5E9E', icono:'V', quien:'ambos' as Quien, dia_cierre:'1', dia_vencimiento:'10', ultimos_4:'' }
const CHART_COLORS = ['#1A5E9E','#F54927','#40B046','#5B3FA6','#E8A020','#D4537E','#1D9E75']

export default function TarjetasPage() {
  const { añoActivo, vistaTipo, mesActivo, monedaPrincipal: m } = useAppStore()
  const monedasPalette = useMonedasDisponibles()
  const esMensual = vistaTipo === 'mensual'
  const periodoLabel = esMensual ? `${MESES_CORTOS[mesActivo-1]} ${añoActivo}` : `${añoActivo}`
  const { data: tarjetas, loading: lt, refetch: refTarjetas } = useTarjetas()
  const { data: personas } = usePersonas()
  const quienOpts = useMemo(() => quienOpciones(personas), [personas])
  const { data: txnsRaw,  loading: lx, refetch: refTxns } = useTarjetaTransacciones()
  const { data: ingresosRaw } = useIngresos()
  const { data: etiquetas, refetch: refetchEtiquetas } = useEtiquetas()
  const { data: proyectos, refetch: refetchProyectos } = useProyectos()
  const { data: ahorros, refetch: refetchAhorros }     = useAhorros()
  const { data: metas, refetch: refetchMetas }         = useMetas()
  const handleCrearProyecto = async (nombre: string) => {
    const p = await createProyecto({ nombre, presupuesto: 0, moneda: m, icono: '📁', color: '#1A5E9E', activo: true, fecha_inicio: null, fecha_fin: null })
    const fresh = await getEtiquetas()
    refetchProyectos(); refetchEtiquetas()
    return fresh.find(e => e.proyecto_id === p.id)?.id ?? null
  }
  const handleCrearAhorro = async (nombre: string) => {
    const a = await createAhorro({ nombre, categoria: nombre, moneda: m, icono: '💰', color: '#1A5E9E', ajuste_manual: 0 })
    const fresh = await getEtiquetas()
    refetchAhorros(); refetchEtiquetas()
    return fresh.find(e => e.ahorro_id === a.id)?.id ?? null
  }
  const [txnEtiquetas, setTxnEtiquetas] = useState<{ transaccion_id: string; etiqueta_id: string }[]>([])
  useEffect(() => { getTarjetaTransaccionEtiquetas().then(setTxnEtiquetas).catch(()=>{}) }, [])
  const etiquetasDeTxn = (txnId: string) => txnEtiquetas.filter(x=>x.transaccion_id===txnId).map(x=>x.etiqueta_id)

  // Aprendizaje de comercios: la primera vez que ves "PAYU AR UBER" le ponés "Uber" a mano;
  // la próxima vez que aparece ese mismo texto crudo (al pegar bloque o cargar ítem por ítem),
  // se sugiere "Uber" solo. Se guarda por texto crudo exacto, no toca lo que ya está cargado.
  const [comercios, setComercios] = useState<TarjetaComercio[]>([])
  const refetchComercios = () => getTarjetasComercios().then(setComercios).catch(()=>{})
  useEffect(() => { refetchComercios() }, [])
  const comercioDe = (descripcionRaw: string): TarjetaComercio | undefined =>
    comercios.find(c => c.descripcion_raw.trim().toLowerCase() === descripcionRaw.trim().toLowerCase())

  // Mismas categorías que Egresos (mismo módulo 'egresos') — un gasto de tarjeta es, en el
  // fondo, un egreso más; usar la misma taxonomía evita tener dos sistemas de categorías
  // paralelos y te deja reusar las categorías propias que ya armaste ahí.
  const { data: rawCategoriasEgreso, refetch: refetchCategoriasEgreso } = useCategoriasCustom('egresos')
  const categoriasCustom = (rawCategoriasEgreso ?? []) as CategoriaCustom[]
  const tiposBaseEgreso = useMemo(() =>
    Object.entries(TIPOS_EGRESO).map(([key, cfg]) => ({ key, label: cfg.label, icon: cfg.icon, color: cfg.color }))
  , [])
  const allTiposCategoria = useMemo(() => {
    const flat: { key: string; label: string; icon: string; color: string }[] = []
    const traverse = (cats: CategoriaCustom[], prefix = '') => {
      cats.forEach(c => {
        flat.push({ key: c.id, label: prefix + c.nombre, icon: c.icono, color: c.color })
        if (c.children?.length) traverse(c.children, prefix + '  ')
      })
    }
    traverse(categoriasCustom)
    return [...tiposBaseEgreso, ...flat]
  }, [categoriasCustom, tiposBaseEgreso])
  const getTipoCategoria = (cat: string) =>
    allTiposCategoria.find(t => t.key === cat) ?? { key: cat, label: cat, icon: '', color: '#888780' }

  const [pickerTipo, setPickerTipo] = useState<'proyecto'|'ahorro'|'meta'|null>(null)
  const [pickerTxn, setPickerTxn]   = useState<string|null>(null)
  const handleConfirmEtiquetasTxn = async (ids: string[]) => {
    if (!pickerTxn) return
    const txn = (txnsRaw ?? []).find(t => t.id === pickerTxn)
    const idsAntes = etiquetasDeTxn(pickerTxn)
    await setEtiquetasDeTarjetaTransaccion(pickerTxn, ids)
    setTxnEtiquetas(prev => [...prev.filter(x=>x.transaccion_id!==pickerTxn), ...ids.map(etiqueta_id=>({transaccion_id:pickerTxn, etiqueta_id}))])
    // Una transacción de tarjeta etiquetada suma automático (es un gasto, como un egreso).
    if (txn) {
      await aplicarContribucionPorEtiquetas({
        idsAntes, idsDespues: ids, etiquetas: etiquetas ?? [], ahorros: ahorros ?? [], metas: metas ?? [],
        monto: txn.monto, moneda: txn.moneda as Moneda, fecha: txn.fecha, signo: 1,
        nota: `Tarjeta: ${txn.descripcion}`,
      })
      refetchAhorros(); refetchMetas()
    }
    setPickerTipo(null); setPickerTxn(null)
  }
  const [selTC, setSelTC]         = useState<string|null>(null)
  const [totalesDeclaradosActivos, setTotalesDeclaradosActivos] = useState<TarjetaPeriodoTotal[]>([])
  useEffect(() => {
    if (!selTC) { setTotalesDeclaradosActivos([]); return }
    getTarjetaPeriodoTotales(selTC, añoActivo, mesActivo).then(setTotalesDeclaradosActivos).catch(()=>setTotalesDeclaradosActivos([]))
  }, [selTC, añoActivo, mesActivo])

  // Todos los períodos declarados (de cualquier tarjeta) — para saber la fecha real de
  // vencimiento de cada una en el widget de Vencimientos, sin pedir tarjeta por tarjeta.
  const [periodoTotalesTodos, setPeriodoTotalesTodos] = useState<TarjetaPeriodoTotal[]>([])
  const refetchPeriodoTotalesTodos = () => getTarjetaPeriodoTotalesTodos().then(setPeriodoTotalesTodos).catch(()=>{})
  useEffect(() => { refetchPeriodoTotalesTodos() }, [])
  const vencimientoDeclarado = (tarjetaId: string, año: number, mes: number): string | null =>
    periodoTotalesTodos.find(p => p.tarjeta_id === tarjetaId && p.año === año && p.mes === mes && p.fecha_vencimiento)?.fecha_vencimiento ?? null

  const [filterCats, setFilterCats] = useState<string[]>([])
  const [search, setSearch]       = useState('')
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [eliminandoLote, setEliminandoLote] = useState(false)
  const [showModal, setShowModal]   = useState(false)
  const [showCargaModal, setShowCargaModal] = useState(false)
  const [cargaTarjetaId, setCargaTarjetaId] = useState<string|null>(null)
  const [cargaPeriodoAño, setCargaPeriodoAño] = useState(añoActivo)
  const [cargaPeriodoMes, setCargaPeriodoMes] = useState(mesActivo)
  const [cargaTotalesDeclarados, setCargaTotalesDeclarados] = useState<{ moneda: Moneda; monto: string }[]>([{ moneda: 'ARS', monto: '' }])
  const [cargaFechaVencimiento, setCargaFechaVencimiento] = useState('')
  const [cargaModo, setCargaModo] = useState<'total'|'item'|'bloque'>('total')
  const [cargaForm, setCargaForm] = useState({ descripcion:'', categoria:'otro', monto:'', moneda:'ARS' as Moneda, fecha: new Date().toISOString().split('T')[0] })
  const [cargaItems, setCargaItems] = useState<{ descripcion:string; descripcion_raw:string; categoria:string; monto:number; moneda:Moneda; fecha:string; cuota_actual?:number; cuota_total?:number }[]>([])
  const [cargaBloqueTexto, setCargaBloqueTexto] = useState('')
  const [cargaBloqueMoneda, setCargaBloqueMoneda] = useState<Moneda>('ARS')
  const [guardandoCarga, setGuardandoCarga] = useState(false)

  // Modal edición de transacción
  const [showTxnModal, setShowTxnModal] = useState(false)
  const [txnEditId, setTxnEditId]       = useState<string|null>(null)
  const [txnForm, setTxnForm]           = useState({ descripcion:'', descripcion_raw:'', categoria:'otro', fecha:'', periodo_año: añoActivo, periodo_mes: mesActivo, monto:'', moneda:'ARS' as Moneda, cuota_actual:'', cuota_total:'' })
  const [savingTxn, setSavingTxn]       = useState(false)

  const openEditTxnModal = (t: any) => {
    setTxnForm({
      descripcion: t.descripcion ?? '', descripcion_raw: t.descripcion_raw ?? '', categoria: t.categoria ?? 'otro',
      fecha: t.fecha ?? '', periodo_año: t.periodo_año ?? añoActivo, periodo_mes: t.periodo_mes ?? mesActivo,
      monto: String(t.monto ?? ''), moneda: (t.moneda ?? 'ARS') as Moneda,
      cuota_actual: t.cuota_actual ? String(t.cuota_actual) : '', cuota_total: t.cuota_total ? String(t.cuota_total) : '',
    })
    setTxnEditId(t.id)
    setShowTxnModal(true)
  }

  // Venir desde "Revisión" (Salud de los datos) con ?editar=<id> abre directo el modal
  // de esa transacción, sin importar si está fuera del período que tenés seleccionado.
  const searchParams = useSearchParams()
  useEffect(() => {
    const editarId = searchParams.get('editar')
    if (!editarId) return
    getTarjetaTransacciones().then(todas => {
      const item = todas.find(t => t.id === editarId)
      if (item) openEditTxnModal(item)
    }).catch(()=>{})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handleSaveTxn = async () => {
    if (!txnEditId || !txnForm.descripcion || !txnForm.monto || !txnForm.fecha) return
    setSavingTxn(true)
    try {
      // El guardado de la transacción en sí va primero y solo — si algo de lo que sigue
      // (aprendizaje de comercios, revisar parecidos) falla, el nombre/monto/fecha que
      // pediste guardar ya quedó guardado, y el modal se cierra igual.
      await updateTarjetaTransaccion(txnEditId, {
        descripcion: txnForm.descripcion, categoria: txnForm.categoria,
        fecha: txnForm.fecha, periodo_año: txnForm.periodo_año, periodo_mes: txnForm.periodo_mes,
        monto: parseFloat(txnForm.monto), moneda: txnForm.moneda,
        cuota_actual: txnForm.cuota_actual ? parseInt(txnForm.cuota_actual) : undefined,
        cuota_total: txnForm.cuota_total ? parseInt(txnForm.cuota_total) : undefined,
      })
      setShowTxnModal(false); setTxnEditId(null); refTxns()
    } catch (e:any) {
      console.error(e)
      alert('No se pudo guardar la transacción: ' + (e.message || e))
      return
    } finally { setSavingTxn(false) }

    // A partir de acá, todo es "mejor esfuerzo": aprender el nombre para la próxima carga,
    // y ofrecer aplicarlo a movimientos parecidos ya cargados. Si algo de esto falla, se
    // avisa aparte — nunca vuelve a tocar ni deshace el guardado de arriba.
    if (txnForm.descripcion_raw && txnForm.descripcion.trim() !== txnForm.descripcion_raw.trim()) {
      try {
        await upsertTarjetaComercio({ descripcion_raw: txnForm.descripcion_raw, descripcion_limpia: txnForm.descripcion, categoria: txnForm.categoria, tarjeta_id: null, ultimos_4: null, red: null, banco: null, quien: null })
        refetchComercios()

        const rawLower = txnForm.descripcion_raw.trim().toLowerCase()
        const idEditado = txnEditId
        const todas = await getTarjetaTransacciones()
        const parecidos = todas.filter(t =>
          t.id !== idEditado && t.descripcion_raw && t.descripcion_raw.trim().toLowerCase() === rawLower &&
          (t.descripcion.trim() !== txnForm.descripcion.trim() || t.categoria !== txnForm.categoria)
        )
        if (parecidos.length > 0) {
          const aplicar = confirm(`Encontré ${parecidos.length} movimiento${parecidos.length===1?'':'s'} más cargado${parecidos.length===1?'':'s'} con el mismo texto original ("${txnForm.descripcion_raw}"). ¿Le pongo el mismo nombre ("${txnForm.descripcion}") y categoría a todos?`)
          if (aplicar) {
            for (const t of parecidos) await updateTarjetaTransaccion(t.id, { descripcion: txnForm.descripcion, categoria: txnForm.categoria })
            refTxns()
          }
        }
      } catch (e:any) {
        console.error(e)
        alert('El nombre se guardó, pero no pude actualizar el aprendizaje de comercios / movimientos parecidos: ' + (e.message || e))
      }
    }
  }

  const handleDeleteTxn = async (id?: string) => {
    const targetId = id ?? txnEditId
    if (!targetId) return
    if (!confirm('¿Eliminar esta transacción?')) return
    setSavingTxn(true)
    try {
      await deleteTarjetaTransaccion(targetId)
      setShowTxnModal(false); setTxnEditId(null); refTxns()
    } catch (e:any) { console.error(e); alert('No se pudo eliminar: ' + (e.message || e)) } finally { setSavingTxn(false) }
  }

  const toggleSeleccionado = (id: string) => {
    setSeleccionados(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  const toggleSeleccionarTodos = (idsVisibles: string[]) => {
    setSeleccionados(prev => prev.size === idsVisibles.length ? new Set() : new Set(idsVisibles))
  }
  const handleEliminarSeleccionados = async () => {
    if (seleccionados.size === 0) return
    if (!confirm(`¿Eliminar ${seleccionados.size} transacción${seleccionados.size===1?'':'es'}? No se puede deshacer.`)) return
    setEliminandoLote(true)
    try {
      for (const id of seleccionados) await deleteTarjetaTransaccion(id)
      setSeleccionados(new Set()); refTxns()
    } catch (e:any) { alert('No se pudieron eliminar algunos ítems: '+(e.message||e)) } finally { setEliminandoLote(false) }
  }

  const [showMoverPeriodo, setShowMoverPeriodo] = useState(false)
  const [moverPeriodoAño, setMoverPeriodoAño] = useState(añoActivo)
  const [moverPeriodoMes, setMoverPeriodoMes] = useState(mesActivo)
  const [moviendoLote, setMoviendoLote] = useState(false)
  const handleMoverSeleccionados = async () => {
    if (seleccionados.size === 0) return
    setMoviendoLote(true)
    try {
      for (const id of seleccionados) await updateTarjetaTransaccion(id, { periodo_año: moverPeriodoAño, periodo_mes: moverPeriodoMes })
      setSeleccionados(new Set()); setShowMoverPeriodo(false); refTxns()
    } catch (e:any) { alert('No se pudieron mover algunos ítems: '+(e.message||e)) } finally { setMoviendoLote(false) }
  }

  // Parsea texto pegado línea por línea. Soporta dos formatos:
  // 1) Tabulado (export real del resumen: FECHA / DESCRIPCION / CUOTA / COMPROBANTE / MONTO / MONEDA,
  //    con "." como separador decimal y moneda explícita por fila) — se detecta por tener tabs.
  // 2) Texto libre "Descripción .... monto" al final, formato es-AR (puntos de miles, coma decimal),
  //    una sola moneda para todo el bloque — lo que había antes.
  // En ambos casos se ignoran silenciosamente las líneas que no matchean (encabezados, separadores
  // "===...===", fila de títulos de columna, etc.) — así se puede pegar el resumen completo tal cual,
  // sin tener que recortarlo a mano. Los pagos/abonos (monto negativo, ej. "SU PAGO EN PESOS") se
  // excluyen: ya se reflejan en Deudas vía el pago registrado, no son un gasto para categorizar acá.
  const MESES_ABR3: Record<string, number> = { ene:1, feb:2, mar:3, abr:4, may:5, jun:6, jul:7, ago:8, sep:9, set:9, oct:10, nov:11, dic:12 }

  const parsearFechaResumen = (s: string): string | null => {
    const m = s.trim().match(/^(\d{1,2})[-\/](\d{1,2}|[a-zA-Zñ]{3,})[-\/](\d{2,4})$/)
    if (!m) return null
    const dia = parseInt(m[1], 10)
    let mes: number
    if (/^\d+$/.test(m[2])) mes = parseInt(m[2], 10)
    else { mes = MESES_ABR3[m[2].toLowerCase().slice(0, 3)]; if (!mes) return null }
    let año = parseInt(m[3], 10)
    if (m[3].length === 2) año = 2000 + año
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
    return `${año}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  }

  // Busca "Vencimiento Actual: 01-Sep-26" (o similar) en el encabezado del resumen pegado —
  // el vencimiento real puede caer en el mes siguiente al período que estás cargando, así que
  // no se puede derivar del día fijo de la tarjeta + el mes activo, hay que leerlo del resumen.
  const detectarVencimientoEnTexto = (texto: string): string | null => {
    const m = texto.match(/vencimiento[^:\n]*:\s*([0-9]{1,2}[-\/][a-zA-Zñ0-9]{2,}[-\/][0-9]{2,4})/i)
    if (!m) return null
    return parsearFechaResumen(m[1])
  }

  // Detecta formato del número: si tiene coma, es es-AR (punto de miles, coma decimal); si no,
  // se parsea directo (el export tabulado usa "." como separador decimal, sin miles).
  const parsearMontoFlexible = (s: string): number | null => {
    const clean = s.trim().replace(/^\$?\s*/, '').replace(/^USD\s*/i, '')
    if (!clean) return null
    if (clean.includes(',')) {
      const n = parseFloat(clean.replace(/\./g, '').replace(',', '.'))
      return isNaN(n) ? null : n
    }
    const n = parseFloat(clean)
    return isNaN(n) ? null : n
  }

  const parsearBloque = (texto: string, monedaDefault: Moneda) => {
    const items: { descripcion:string; descripcion_raw:string; categoria:string; monto:number; moneda:Moneda; fecha:string; cuota_actual?:number; cuota_total?:number }[] = []
    let pagosOmitidos = 0
    const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean)
    // Si CUALQUIER línea tiene tab, tratamos todo el pegado como el export tabulado y NO usamos
    // el fallback de texto libre para las demás líneas — si no, encabezados como "Total a Pagar
    // Pesos: $ 353.540,24" (sin tab, pero con un número al final) se cuelan como si fueran un ítem.
    const esFormatoTabulado = lineas.some(l => l.includes('\t'))

    for (const linea of lineas) {
      if (esFormatoTabulado) {
        if (!linea.includes('\t')) continue // encabezado/título/separador del resumen — se ignora
        const cols = linea.split('\t').map(c => c.trim())
        if (cols.length < 5) continue
        const fecha = parsearFechaResumen(cols[0])
        const monto = parsearMontoFlexible(cols[4])
        if (!fecha || monto === null) continue // fila de título de columna u otra que no es un ítem real
        if (monto < 0) { pagosOmitidos++; continue }
        const descripcionRaw = cols[1] || 'Movimiento'
        const comercio = comercioDe(descripcionRaw)
        const monedaCol = cols[5]?.toUpperCase()
        const moneda = (monedaCol === 'USD' || monedaCol === 'ARS' || monedaCol === 'EUR') ? monedaCol as Moneda : monedaDefault
        const cuotaMatch = cols[2]?.match(/^(\d+)\/(\d+)$/)
        items.push({
          descripcion: comercio?.descripcion_limpia || descripcionRaw, descripcion_raw: descripcionRaw,
          categoria: comercio?.categoria || 'otro', monto, moneda, fecha,
          ...(cuotaMatch ? { cuota_actual: parseInt(cuotaMatch[1], 10), cuota_total: parseInt(cuotaMatch[2], 10) } : {}),
        })
        continue
      }

      const match = linea.match(/^(.*?)[\s:]*\$?\s*(-?[\d.,]+)\s*$/)
      if (!match) continue
      const descripcionRaw = match[1].trim()
      const montoStr = match[2].replace(/\./g, '').replace(',', '.')
      const monto = parseFloat(montoStr)
      if (!descripcionRaw || isNaN(monto)) continue
      const comercio = comercioDe(descripcionRaw)
      items.push({
        descripcion: comercio?.descripcion_limpia || descripcionRaw, descripcion_raw: descripcionRaw,
        categoria: comercio?.categoria || 'otro', monto: Math.abs(monto), moneda: monedaDefault, fecha: new Date().toISOString().split('T')[0],
      })
    }
    return { items, pagosOmitidos }
  }

  const abrirCargaModal = () => {
    setCargaTarjetaId(selTC ?? (tarjetas??[])[0]?.id ?? null)
    setCargaPeriodoAño(añoActivo); setCargaPeriodoMes(mesActivo)
    setCargaTotalesDeclarados([{ moneda: 'ARS', monto: '' }])
    setCargaFechaVencimiento('')
    setCargaModo('total')
    setCargaForm({ descripcion:'', categoria:'otro', monto:'', moneda:'ARS', fecha: new Date().toISOString().split('T')[0] })
    setCargaItems([])
    setCargaBloqueTexto('')
    setShowCargaModal(true)
  }

  const agregarItemALista = () => {
    if (!cargaForm.descripcion || !cargaForm.monto) return
    const comercio = comercioDe(cargaForm.descripcion)
    setCargaItems(prev => [...prev, {
      descripcion: comercio?.descripcion_limpia || cargaForm.descripcion, descripcion_raw: cargaForm.descripcion,
      categoria: comercio?.categoria || cargaForm.categoria, monto: parseFloat(cargaForm.monto), moneda: cargaForm.moneda, fecha: cargaForm.fecha,
    }])
    setCargaForm(p => ({ ...p, descripcion: '', monto: '' }))
  }

  // El "total declarado" (lo que decís que dice el resumen, por moneda) se guarda aparte y se
  // compara contra la suma real de lo cargado — reemplaza a la conciliación contra PDF, sin
  // necesitar el PDF en sí. No bloquea guardar si no coincide, solo avisa.
  const guardarTotalesDeclarados = async () => {
    if (!cargaTarjetaId) return
    for (const t of cargaTotalesDeclarados) {
      if (!t.monto) continue
      await upsertTarjetaPeriodoTotal({ tarjeta_id: cargaTarjetaId, año: cargaPeriodoAño, mes: cargaPeriodoMes, moneda: t.moneda, total_declarado: parseFloat(t.monto), fecha_vencimiento: cargaFechaVencimiento || null })
    }
    refetchPeriodoTotalesTodos()
  }

  const handleGuardarCargaTotal = async () => {
    if (!cargaTarjetaId || !cargaForm.monto) return
    setGuardandoCarga(true)
    try {
      await guardarTotalesDeclarados()
      await createTarjetaTransaccion({
        tarjeta_id: cargaTarjetaId, descripcion: cargaForm.descripcion || 'Saldo inicial', categoria: cargaForm.categoria,
        fecha: cargaForm.fecha, periodo_año: cargaPeriodoAño, periodo_mes: cargaPeriodoMes, monto: parseFloat(cargaForm.monto), moneda: cargaForm.moneda, tipo: 'debito',
      })
      setShowCargaModal(false); refTxns()
    } catch (e:any) { console.error(e); alert('No se pudo guardar el movimiento: '+(e.message||e)) } finally { setGuardandoCarga(false) }
  }

  const handleGuardarCargaItems = async (items: typeof cargaItems) => {
    if (!cargaTarjetaId || items.length === 0) return
    setGuardandoCarga(true)
    try {
      await guardarTotalesDeclarados()
      for (const it of items) {
        await createTarjetaTransaccion({
          tarjeta_id: cargaTarjetaId, descripcion: it.descripcion, descripcion_raw: it.descripcion_raw, categoria: it.categoria,
          fecha: it.fecha, periodo_año: cargaPeriodoAño, periodo_mes: cargaPeriodoMes, monto: it.monto, moneda: it.moneda, tipo: 'debito',
          cuota_actual: it.cuota_actual, cuota_total: it.cuota_total,
        })
      }
      setShowCargaModal(false); setCargaItems([]); refTxns()
    } catch (e:any) { console.error(e); alert('No se pudieron guardar los movimientos: '+(e.message||e)) } finally { setGuardandoCarga(false) }
  }

  const handleDuplicarTxn = async (t: TarjetaTransaccion) => {
    await createTarjetaTransaccion({
      tarjeta_id: t.tarjeta_id, descripcion: t.descripcion, descripcion_raw: t.descripcion_raw, categoria: t.categoria,
      fecha: t.fecha, periodo_año: t.periodo_año, periodo_mes: t.periodo_mes, monto: t.monto, moneda: t.moneda, cotizacion_ars: t.cotizacion_ars,
      cuota_actual: t.cuota_actual, cuota_total: t.cuota_total, tipo: t.tipo,
    })
    refTxns()
  }

  const [saving, setSaving]       = useState(false)
  const [form, setForm]           = useState(FORM_INIT)
  const [tarjetaEditId, setTarjetaEditId] = useState<string|null>(null)

  const openEditTarjetaModal = (t: any) => {
    setForm({
      nombre: t.nombre, banco: t.banco, limite: String(t.limite ?? ''), moneda: t.moneda,
      color: t.color, icono: t.icono, quien: t.quien,
      dia_cierre: String(t.dia_cierre ?? 1), dia_vencimiento: String(t.dia_vencimiento ?? 10),
      ultimos_4: t.ultimos_4 ?? '',
    })
    setTarjetaEditId(t.id)
    setShowModal(true)
  }

  const handleDeleteTarjeta = async (t: any) => {
    if (!confirm(`¿Eliminar "${t.nombre}"? Si tiene movimientos cargados se va a archivar en vez de borrarse, para no perder el historial.`)) return
    const resultado = await eliminarOArchivarTarjeta(t.id)
    if (selTC === t.id) setSelTC(null)
    refTarjetas()
    if (resultado === 'archivada') alert('La tarjeta tenía movimientos cargados, así que se archivó en vez de borrarse — el historial sigue intacto pero ya no aparece en la lista.')
  }

  const activaId   = selTC ?? 'todas'

  useEffect(() => { setSeleccionados(new Set()) }, [activaId, añoActivo, mesActivo])

  // Todo lo que sigue queda acotado al año activo (y, si esMensual, además al mes activo)
  // Consumo real por mes (lo que cargaste), no pagos registrados — un mes puede tener gastos
  // cargados sin que hayas usado "Registrar pago" todavía, y acá igual tiene que aparecer.
  const txnsDelAño = useMemo(() =>
    (txnsRaw ?? []).filter(t => t.periodo_año === añoActivo)
  , [txnsRaw, añoActivo])

  // El período de una transacción de tarjeta es el que elegiste al cargarla (periodo_año/mes),
  // NO la fecha del ítem — un resumen de agosto trae gastos de julio y agosto, lo que importa
  // acá es en qué carga entró, no cuándo pasó cada compra puntual.
  const txns = useMemo(() =>
    txnsDelAño.filter(t => !esMensual || t.periodo_mes === mesActivo)
  , [txnsDelAño, esMensual, mesActivo])

  const MESES_DISP = esMensual ? [MESES_CORTOS[mesActivo-1]] : MESES_CORTOS

  const consumoPorTC = useMemo(() => {
    const map: Record<string, Record<number,number>> = {}
    ;(txnsDelAño??[]).forEach(t => {
      const key = `${t.tarjeta_id}|${t.moneda}`
      if (!map[key]) map[key]={}
      map[key][t.periodo_mes] = (map[key][t.periodo_mes] ?? 0) + t.monto
    })
    return map
  }, [txnsDelAño])

  const consumoDe = (id: string, mes: number, moneda: string): number =>
    consumoPorTC[`${id}|${moneda}`]?.[mes] ?? 0

  // La columna de estadísticas (Evolución/KPIs/%) suma en UNA moneda a la vez — nunca ARS+USD
  // juntos, sería un número sin sentido. Si la tarjeta (o "Todas") tiene más de una moneda
  // cargada, se elige cuál mirar con el selector; si solo hay una, no hace falta elegir nada.
  const [monedaKPISel, setMonedaKPISel] = useState<Moneda | null>(null)
  const monedasKPIDisponibles = useMemo(() => {
    const prefijo = activaId === 'todas' ? '' : activaId + '|'
    return Array.from(new Set(Object.keys(consumoPorTC).filter(k => k.startsWith(prefijo)).map(k => k.split('|')[1]))) as Moneda[]
  }, [consumoPorTC, activaId])
  const monedaActiva: Moneda | null = monedaKPISel && monedasKPIDisponibles.includes(monedaKPISel) ? monedaKPISel : (monedasKPIDisponibles[0] ?? null)

  const chartData = useMemo(() => MESES_DISP.map((month) => {
    const mes = MESES_CORTOS.indexOf(month) + 1
    const point: Record<string,number|string> = { month }
    if (!monedaActiva) return point
    if (activaId==='todas') {
      ;(tarjetas??[]).forEach(t => { point[t.id] = consumoDe(t.id, mes, monedaActiva) })
    } else {
      point['pago'] = consumoDe(activaId, mes, monedaActiva)
    }
    return point
  }), [tarjetas, consumoPorTC, activaId, MESES_DISP, monedaActiva])

  const filteredTxns = useMemo(() => (txns??[])
    .filter(t => activaId === 'todas' || t.tarjeta_id === activaId)
    .filter(t => filterCats.length===0 || filterCats.includes(t.categoria))
    .filter(t => !search || t.descripcion.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>b.fecha.localeCompare(a.fecha))
  , [txns, activaId, filterCats, search])

  // Mismo cuidado de moneda que en consumoPorTC — comparar tarjetas entre sí solo tiene
  // sentido dentro de una misma moneda (se usa la moneda principal como default razonable
  // para esta comparación cruzada, ya que acá se listan TODAS las tarjetas juntas).
  const totalPorTC = useMemo(() => {
    const map: Record<string,number> = {}
    ;(txns??[]).filter(t => t.moneda === m).forEach(t => { map[t.tarjeta_id] = (map[t.tarjeta_id]||0)+t.monto })
    return map
  }, [txns, m])

  const compData = useMemo(() => (tarjetas??[]).map((t,i)=>({
    name: t.nombre+' '+t.banco.split(' · ').slice(-1)[0],
    value: totalPorTC[t.id]||0,
    color: CHART_COLORS[i%CHART_COLORS.length],
  })).filter(d=>d.value>0), [tarjetas, totalPorTC])


  // Una ficha por tarjeta (no una por moneda) — cada una lleva la lista de {moneda, total} del
  // período activo para mostrarse en líneas, no como tiles separados.
  const tarjetasConTotales = useMemo(() => {
    return (tarjetas??[]).map(t => {
      const txnsDeLaTarjeta = (txns??[]).filter(x=>x.tarjeta_id===t.id)
      const monedas = [...new Set(txnsDeLaTarjeta.map(x=>x.moneda))]
      const totales = monedas.map(mon => ({ moneda: mon, total: txnsDeLaTarjeta.filter(x=>x.moneda===mon).reduce((s,x)=>s+x.monto,0) }))
      return { tarjeta: t, totales: totales.length ? totales : [{ moneda: t.moneda, total: 0 }] }
    })
  }, [tarjetas, txns])

  const totalGlobal = tarjetasConTotales.reduce((s, { totales }) =>
    s + totales.filter(x=>x.moneda===m).reduce((ss,x)=>ss+x.total,0), 0)

  // Vencimientos del período activo — un ítem por (tarjeta, moneda) igual que las fichas.
  const vencimientosDelMes = useMemo(() => {
    const result: { tarjeta: NonNullable<typeof tarjetas>[number]; moneda: string; total: number; fechaVenc: string | null }[] = []
    ;(tarjetas??[]).forEach(t => {
      const txnsDelMes = (txnsRaw??[]).filter(x => x.tarjeta_id===t.id && x.periodo_año===añoActivo && x.periodo_mes===mesActivo)
      const monedas = [...new Set(txnsDelMes.map(x=>x.moneda))]
      const fechaVenc = vencimientoDeclarado(t.id, añoActivo, mesActivo)
      monedas.forEach(mon => {
        const total = txnsDelMes.filter(x=>x.moneda===mon).reduce((s,x)=>s+x.monto, 0)
        if (total > 0) result.push({ tarjeta: t, moneda: mon, total, fechaVenc })
      })
    })
    return result.sort((a,b) => (a.fechaVenc ?? '9999').localeCompare(b.fechaVenc ?? '9999') || a.tarjeta.dia_vencimiento - b.tarjeta.dia_vencimiento)
  }, [tarjetas, txnsRaw, añoActivo, mesActivo, periodoTotalesTodos])

  const [exportadoIds, setExportadoIds] = useState<Set<string>>(new Set())
  const handleExportarAVencimiento = async (t: NonNullable<typeof tarjetas>[number], moneda: string, total: number, fechaVenc: string | null) => {
    // Si declaraste la fecha real al cargar el resumen, se usa esa (puede caer en el mes
    // siguiente). Si no la declaraste, se cae al día fijo configurado en la tarjeta como
    // aproximación — mejor eso que nada, pero avisá si no coincide con la realidad.
    const [díaEv, mesEv, añoEv] = fechaVenc
      ? [parseInt(fechaVenc.slice(8,10)), parseInt(fechaVenc.slice(5,7)), parseInt(fechaVenc.slice(0,4))]
      : [Math.min(t.dia_vencimiento, new Date(añoActivo, mesActivo, 0).getDate()), mesActivo, añoActivo]
    await createEvento({
      dia: díaEv, mes: mesEv, año: añoEv, tipo: 'tarjeta',
      descripcion: `${t.nombre}${t.banco ? ' — ' + t.banco : ''}`,
      monto: total, moneda: moneda as Moneda, recurrente: false, pagado: false,
    })
    setExportadoIds(prev => new Set(prev).add(`${t.id}|${moneda}`))
  }

  if ((lt&&!tarjetas)||(lx&&!txnsRaw)) return <LoadingSpinner />

  const tcActiva = activaId==='todas' ? null : (tarjetas??[]).find(t=>t.id===activaId)

  const kpiPagos   = !monedaActiva ? MESES_DISP.map(()=>0) : activaId==='todas'
    ? MESES_DISP.map((month)=>(tarjetas??[]).reduce((s,t)=>s+consumoDe(t.id, MESES_CORTOS.indexOf(month)+1, monedaActiva),0))
    : MESES_DISP.map((month)=>consumoDe(activaId, MESES_CORTOS.indexOf(month)+1, monedaActiva))
  const kpiTotal   = kpiPagos.reduce((a,b)=>a+b,0)
  const kpiUlt     = kpiPagos[kpiPagos.length-1]
  const kpiPen     = kpiPagos[kpiPagos.length-2]
  const kpiTrend   = kpiPen>0 ? Math.round(((kpiUlt-kpiPen)/kpiPen)*100) : null
  const kpiMayor   = Math.max(...kpiPagos)
  const kpiMayorMes = MESES_DISP[kpiPagos.indexOf(kpiMayor)]

  // % sobre ingresos — comparado en la misma moneda que se está mostrando en el selector de
  // arriba (nunca "la principal por defecto" si la tarjeta es de otra moneda), con el mismo
  // alcance (mes activo o año activo según la vista).
  const monedaParaPct = (monedaActiva ?? m) as Moneda
  const ingresosPeriodo = (ingresosRaw ?? []).filter(i => i.moneda === monedaParaPct && (!esMensual || i.mes === mesActivo)).reduce((s,i)=>s+i.monto,0)
  const pctSobreIngresos = (monedaActiva && ingresosPeriodo > 0) ? Math.round(kpiTotal / ingresosPeriodo * 100) : null
  // Mes anterior, para la comparativa — mismo límite ya aceptado en otras pantallas: en enero no
  // hay diciembre del año en curso dentro de este mismo fetch (año-acotado), así que ese mes no
  // muestra comparativa.
  const tarjetaIdActiva  = activaId === 'todas' ? null : activaId
  const mesAnteriorNum = mesActivo === 1 ? null : mesActivo - 1
  const consumoMesAnt = mesAnteriorNum ? txnsDelAño.filter(t => t.periodo_mes === mesAnteriorNum && t.moneda === monedaParaPct && (tarjetaIdActiva === null || t.tarjeta_id === tarjetaIdActiva)).reduce((s,t)=>s+t.monto,0) : 0
  const ingresosMesAnt = mesAnteriorNum ? (ingresosRaw ?? []).filter(i => i.año === añoActivo && i.mes === mesAnteriorNum && i.moneda === monedaParaPct).reduce((s,i)=>s+i.monto,0) : 0
  const pctMesAnt = ingresosMesAnt > 0 ? Math.round(consumoMesAnt / ingresosMesAnt * 100) : null
  const trendPct = (esMensual && mesAnteriorNum && pctSobreIngresos !== null && pctMesAnt !== null && pctMesAnt > 0)
    ? Math.round(((pctSobreIngresos - pctMesAnt) / pctMesAnt) * 100) : null

  // Trend real de "Total pagado" (en realidad "Total consumido") — mes activo vs mes anterior,
  // o año activo vs año anterior según la vista.
  const consumoParaTrend = (txnsRaw ?? [])
    .filter(t => (tarjetaIdActiva === null || t.tarjeta_id === tarjetaIdActiva) && (monedaActiva === null || t.moneda === monedaActiva))
    .map(t => ({ mes: t.periodo_mes, año: t.periodo_año, monto: t.monto }))
  const trendTotalPagado = calcularTendencia(consumoParaTrend, vistaTipo, mesActivo, añoActivo)

  return (
    <div>
      <PageHeader title="Tarjetas de crédito" subtitle="Seguimiento de pagos y transacciones"
        action={<div className="flex gap-2 flex-wrap justify-end">
          <button className="btn-ghost text-sm" onClick={abrirCargaModal}>+ Cargar movimientos</button>
          <button className="btn-primary" onClick={()=>{setForm(FORM_INIT);setTarjetaEditId(null);setShowModal(true)}}>+ Nueva tarjeta</button>
        </div>} />

      {/* ── Selector de tarjetas — full width, una ficha por tarjeta con una línea por moneda ── */}
      <div className="flex gap-3 overflow-x-auto pb-2 mb-6">
        <div onClick={()=>setSelTC(null)}
          className={`flex-shrink-0 bg-white border-2 rounded-2xl p-4 cursor-pointer transition-all min-w-[140px] ${activaId==='todas'?'border-slate-400':'border-slate-100 hover:border-slate-200'}`}>
          <div className="text-2xl mb-2">★</div>
          <div className="text-sm font-semibold text-slate-900">Todas</div>
          <div className="text-xs text-slate-400 mt-1">total {periodoLabel}</div>
          <div className="text-lg font-bold font-mono text-slate-700 mt-1">{fmt(totalGlobal,m)}</div>
        </div>
        {tarjetasConTotales.map(({tarjeta: t, totales})=>{
          const isActive = activaId===t.id
          return (
            <div key={t.id} onClick={()=>setSelTC(t.id)}
              className="group relative flex-shrink-0 bg-white border-2 rounded-2xl p-4 cursor-pointer transition-all min-w-[155px]"
              style={{borderColor: isActive ? t.color : '#f1f5f9'}}>
              <button onClick={e=>{e.stopPropagation(); openEditTarjetaModal(t)}}
                className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-slate-50 border-none bg-transparent cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity text-xs">✎</button>
              <div className="flex justify-between items-start mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{background:t.color}}>{t.icono}</div>
                {t.quien!=='ambos' && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colorQuien(t.quien).bg} ${colorQuien(t.quien).text}`}>{t.quien}</span>
                )}
              </div>
              <div className="text-sm font-semibold text-slate-900">{t.nombre}</div>
              <div className="text-xs text-slate-400">{t.banco}{t.ultimos_4 && <span className="font-mono"> ····{t.ultimos_4}</span>}</div>
              <div className="mt-1 flex flex-col gap-0.5">
                {totales.map(({moneda: mon, total}) => (
                  <div key={mon} className="text-base font-bold font-mono leading-tight" style={{color:t.color}}>
                    {mon==='USD'?'US$':mon==='EUR'?'€':'$'}{total.toLocaleString('es-AR',{maximumFractionDigits:0})}
                    <span className="text-[10px] font-normal text-slate-400 ml-1">{mon}</span>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">{periodoLabel}</div>
            </div>
          )
        })}
      </div>

      {/* ── Layout principal: Transacciones 2/3 | Widgets 1/3 ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">

        {/* ── Columna izquierda: Transacciones ── */}
        <div className="md:col-span-2">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="text-slate-900 font-semibold text-[15px]">Transacciones</div>
              {seleccionados.size > 0 ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{seleccionados.size} seleccionado{seleccionados.size===1?'':'s'}</span>
                  <button onClick={() => setShowMoverPeriodo(true)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 border-none bg-transparent cursor-pointer">
                    Mover a otro período
                  </button>
                  <button onClick={handleEliminarSeleccionados} disabled={eliminandoLote}
                    className="text-xs font-semibold text-red-600 hover:text-red-700 border-none bg-transparent cursor-pointer disabled:opacity-50">
                    {eliminandoLote ? 'Eliminando...' : 'Eliminar'}
                  </button>
                  <button onClick={() => setSeleccionados(new Set())} className="text-xs text-slate-400 hover:text-slate-600 border-none bg-transparent cursor-pointer">Cancelar</button>
                </div>
              ) : (
                <span className="text-slate-400 text-xs">{filteredTxns.length} registros</span>
              )}
            </div>
            <div className="flex gap-2 flex-wrap mb-4 items-center">
              <div className="relative flex-1 min-w-[140px] max-w-[220px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">⌕</span>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar..." className="input-field pl-8 py-1.5 text-xs" />
              </div>
              <MultiDropdown label="Categoría" options={allTiposCategoria.map(t => ({ key: t.key, label: t.label }))} selected={filterCats} onChange={setFilterCats} />
              {filterCats.length > 0 && (
                <button onClick={() => setFilterCats([])} className="text-xs text-slate-400 hover:text-slate-600 border-none bg-transparent cursor-pointer underline">
                  Limpiar
                </button>
              )}
            </div>

            {filteredTxns.length===0 ? (
              <EmptyState icon="💳" title="Sin transacciones" description="Las transacciones de tarjeta aparecerán acá." />
            ) : (
              <Table>
                <thead><tr>
                  <Th>
                    <input type="checkbox" checked={seleccionados.size>0 && seleccionados.size===filteredTxns.length}
                      onChange={()=>toggleSeleccionarTodos(filteredTxns.map(t=>t.id))} />
                  </Th>
                  <Th>Fecha</Th><Th>Descripción</Th><Th>Categoría</Th><Th>Cuotas</Th><Th right>Importe</Th><Th right> </Th>
                </tr></thead>
                <tbody>
                  {filteredTxns.map(t=>{
                    const cc = getTipoCategoria(t.categoria)
                    const isUSD = t.moneda==='USD'
                    const tc = (tarjetas??[]).find(x=>x.id===t.tarjeta_id)
                    return (
                      <tr key={t.id} className="group">
                        <Td>
                          <input type="checkbox" checked={seleccionados.has(t.id)} onChange={()=>toggleSeleccionado(t.id)} />
                        </Td>
                        <Td className="text-slate-400 text-xs font-mono">{fmtDate(t.fecha)}</Td>
                        <Td>
                          <div onClick={() => openEditTxnModal(t)} className="text-slate-700 font-medium cursor-pointer hover:underline hover:font-bold">{t.descripcion}</div>
                          {t.descripcion_raw && t.descripcion_raw.trim() !== t.descripcion.trim() && (
                            <div className="text-slate-400 text-xs">{t.descripcion_raw}</div>
                          )}
                          {tc && <div className="text-slate-400 text-xs">{tc.nombre} · {tc.banco}</div>}
                          <EtiquetaChips etiquetaIds={etiquetasDeTxn(t.id)} etiquetas={etiquetas ?? []} proyectos={proyectos ?? []} ahorros={ahorros ?? []} />
                        </Td>
                        <Td>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{background:cc.color+'18',color:cc.color}}>{cc.icon} {cc.label}</span>
                        </Td>
                        <Td className="text-slate-400 text-xs font-mono text-center">{t.cuota_actual&&t.cuota_total?`${t.cuota_actual}/${t.cuota_total}`:'—'}</Td>
                        <Td right>
                          <div className={`font-mono font-bold text-sm ${isUSD?'text-blue-700':'text-red-600'}`}>
                            {isUSD?'US$':'$'}{t.monto.toLocaleString('es-AR')}
                          </div>
                          {isUSD&&t.cotizacion_ars&&<div className="text-slate-400 text-xs">≈ {fmt(t.monto*t.cotizacion_ars)}</div>}
                        </Td>
                        <Td right className="select-none">
                          <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <RowMenu items={[
                              { label: 'Editar', onClick: () => openEditTxnModal(t) },
                              { label: 'Asociar a proyecto', onClick: () => { setPickerTxn(t.id); setPickerTipo('proyecto') } },
                              { label: 'Asociar a ahorro', onClick: () => { setPickerTxn(t.id); setPickerTipo('ahorro') } },
                              { label: 'Asociar a meta', onClick: () => { setPickerTxn(t.id); setPickerTipo('meta') } },
                              { label: 'Duplicar', onClick: () => handleDuplicarTxn(t) },
                              { label: 'Eliminar', onClick: () => handleDeleteTxn(t.id), danger: true },
                            ]} />
                          </div>
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

          {/* Total del período vs. lo declarado — reemplaza a la conciliación contra PDF */}
          {tcActiva && (() => {
            const t = tcActiva
            const txnsTarjeta = (txns??[]).filter(x=>x.tarjeta_id===t.id)
            const monedas = [...new Set([...txnsTarjeta.map(x=>x.moneda), ...totalesDeclaradosActivos.map(x=>x.moneda)])]
            return (
              <Card>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-slate-900 font-semibold text-[13px]">{t.nombre} — {periodoLabel}</div>
                </div>
                {monedas.length === 0 ? (
                  <div className="text-slate-400 text-xs">Todavía no cargaste movimientos de este período.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {monedas.map(mon => {
                      const cargado = txnsTarjeta.filter(x=>x.moneda===mon).reduce((s,x)=>s+x.monto,0)
                      const declarado = totalesDeclaradosActivos.find(x=>x.moneda===mon)?.total_declarado
                      const diferencia = declarado !== undefined ? Math.round((cargado - declarado) * 100) / 100 : null
                      return (
                        <div key={mon} className="bg-slate-50 rounded-lg p-2.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">Cargado ({mon})</span>
                            <span className="font-mono font-bold text-slate-700">{fmtFull(cargado, mon as Moneda)}</span>
                          </div>
                          {declarado !== undefined && (
                            <div className="flex items-center justify-between text-xs mt-1">
                              <span className="text-slate-400">Declarado</span>
                              <span className="font-mono text-slate-500">{fmtFull(declarado, mon as Moneda)}</span>
                            </div>
                          )}
                          {diferencia !== null && (
                            diferencia === 0
                              ? <div className="text-[11px] text-emerald-600 mt-1">Coincide con lo declarado</div>
                              : <div className="text-[11px] text-amber-600 mt-1">Diferencia de {fmtFull(Math.abs(diferencia), mon as Moneda)} {diferencia > 0 ? '(cargaste de más)' : '(falta cargar)'}</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            )
          })()}

          {/* Vencimientos del mes */}
          {vencimientosDelMes.length > 0 && (
            <Card>
              <div className="text-slate-900 font-semibold text-[13px] mb-0.5">Vencimientos — {MESES_CORTOS[mesActivo-1]} {añoActivo}</div>
              <div className="text-slate-400 text-xs mb-3">Cuándo y cuánto hay que pagar</div>
              <div className="flex flex-col">
                {vencimientosDelMes.map(({tarjeta: t, moneda: mon, total, fechaVenc}) => {
                  const key = `${t.id}|${mon}`
                  const yaExportado = exportadoIds.has(key)
                  const diaMostrado = fechaVenc ? parseInt(fechaVenc.slice(8,10)) : t.dia_vencimiento
                  const mesDistinto = fechaVenc && parseInt(fechaVenc.slice(5,7)) !== mesActivo
                  return (
                    <div key={key} className="group flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg flex flex-col items-center justify-center flex-shrink-0" style={{background:t.color+'18'}}>
                          <span className="text-xs font-bold font-mono leading-none" style={{color:t.color}}>{diaMostrado}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-700 truncate">{t.nombre}</div>
                          <div className="text-[11px] text-slate-400">
                            {fechaVenc ? `vence ${fmtDate(fechaVenc)}${mesDistinto ? ' (mes siguiente)' : ''}` : `vence el ${t.dia_vencimiento} (aprox., sin declarar)`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className={`font-mono font-bold text-xs ${yaExportado?'text-emerald-600':'text-red-600'}`}>{fmtFull(total, mon as Moneda)}</span>
                        <RowMenu items={[
                          { label: yaExportado ? 'Ya exportado al calendario' : 'Exportar a Vencimiento', onClick: () => !yaExportado && handleExportarAVencimiento(t, mon, total, fechaVenc), disabled: yaExportado },
                        ]} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Evolución de pagos */}
          <Card>
            <div className="flex items-center justify-between mb-1">
              <CardTitle>
                Evolución de consumo
                <span className="text-slate-400 text-xs font-normal ml-2">{activaId==='todas'?'Todas las tarjetas':tcActiva?.nombre}</span>
              </CardTitle>
              {monedasKPIDisponibles.length > 1 && (
                <div className="flex gap-1 flex-shrink-0">
                  {monedasKPIDisponibles.map(mon => (
                    <button key={mon} onClick={()=>setMonedaKPISel(mon)}
                      className={`chip text-xs py-0.5 px-2 ${monedaActiva===mon?'chip-on':''}`}>{mon}</button>
                  ))}
                </div>
              )}
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} barCategoryGap="30%" barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{fill:'#94a3b8',fontSize:10}} axisLine={false} tickLine={false} />
                <YAxis tick={{fill:'#94a3b8',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>v===0?'':fmt(v,(monedaActiva ?? m) as Moneda)} />
                <Tooltip contentStyle={TT} formatter={(v:number)=>[fmt(v,(monedaActiva ?? m) as Moneda)]} />
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
                {l:`Total consumido ${periodoLabel}`, v:fmt(kpiTotal,(monedaActiva ?? m) as Moneda), s:trendTotalPagado.trend!==undefined?(trendTotalPagado.trend>=0?'▲':'▼')+' '+Math.abs(trendTotalPagado.trend)+'% '+trendTotalPagado.label:(activaId==='todas'?'Todas las tarjetas':tcActiva?.banco||'')},
                {l:`Último mes (${MESES_DISP[MESES_DISP.length-1]})`, v:fmt(kpiUlt,(monedaActiva ?? m) as Moneda), s:kpiTrend!==null?(kpiTrend>=0?'▲':'▼')+' '+Math.abs(kpiTrend)+'% vs anterior':'', c:kpiTrend!==null&&kpiTrend>=0?'#F54927':'#40B046'},
                {l:'Mes más caro', v:fmt(kpiMayor,(monedaActiva ?? m) as Moneda), s:kpiMayorMes},
                {l:`% sobre ingresos en ${monedaParaPct}`, v:pctSobreIngresos!==null?`${pctSobreIngresos}%`:'—', s:trendPct!==null?(trendPct>=0?'▲':'▼')+' '+Math.abs(trendPct)+'% vs mes anterior':(pctSobreIngresos===null?`Sin ingresos en ${monedaParaPct} este período`:''), c:pctSobreIngresos!==null?(pctSobreIngresos>40?'#F54927':pctSobreIngresos>25?'#E8A020':'#40B046'):undefined},
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

      {/* Modal nueva/editar tarjeta */}
      <Modal open={showModal} onClose={()=>{setShowModal(false);setForm(FORM_INIT);setTarjetaEditId(null)}} title={tarjetaEditId ? 'Editar tarjeta' : 'Nueva tarjeta'}>
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Nombre</FieldLabel><input value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Ej: VISA Galicia" className="input-field" /></div>
          <div><FieldLabel>Banco / titular</FieldLabel><input value={form.banco} onChange={e=>setForm(p=>({...p,banco:e.target.value}))} placeholder="Ej: Galicia · Mati" className="input-field" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Titular</FieldLabel><select value={form.quien} onChange={e=>setForm(p=>({...p,quien:e.target.value as Quien}))} className="input-field">{quienOpts.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}</select></div>
            <div><FieldLabel>Ícono</FieldLabel><input value={form.icono} onChange={e=>setForm(p=>({...p,icono:e.target.value}))} placeholder="V" maxLength={3} className="input-field" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><FieldLabel>Últimos 4 dígitos</FieldLabel><input value={form.ultimos_4} onChange={e=>setForm(p=>({...p,ultimos_4:e.target.value.replace(/\D/g,'').slice(0,4)}))} placeholder="1234" maxLength={4} className="input-field font-mono" /></div>
            <div><FieldLabel>Día de cierre</FieldLabel><input type="number" min="1" max="31" value={form.dia_cierre} onChange={e=>setForm(p=>({...p,dia_cierre:e.target.value}))} className="input-field" /></div>
            <div><FieldLabel>Día de vencimiento</FieldLabel><input type="number" min="1" max="31" value={form.dia_vencimiento} onChange={e=>setForm(p=>({...p,dia_vencimiento:e.target.value}))} className="input-field" /></div>
          </div>
          <div><FieldLabel>Color</FieldLabel>
            <div className="flex gap-2 mt-1">
              {['#1A5E9E','#F54927','#7F77DD','#EF9F27','#D4537E','#1D9E75','#639922'].map(c=>(
                <button key={c} onClick={()=>setForm(p=>({...p,color:c}))} className={`w-7 h-7 rounded-full border-2 cursor-pointer ${form.color===c?'border-slate-900 scale-110':'border-transparent'}`} style={{background:c}} />
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            {tarjetaEditId && (
              <button onClick={() => { const t=(tarjetas??[]).find(x=>x.id===tarjetaEditId); if(t) { handleDeleteTarjeta(t); setShowModal(false); setForm(FORM_INIT); setTarjetaEditId(null) } }}
                className="text-red-500 hover:text-red-600 border-none bg-transparent cursor-pointer text-sm px-2">Eliminar</button>
            )}
            <div className="flex-1" />
            <button onClick={()=>{setShowModal(false);setForm(FORM_INIT);setTarjetaEditId(null)}} className="btn-ghost">Cancelar</button>
            <button onClick={async()=>{
              if(!form.nombre) return; setSaving(true)
              try {
                const payload = {
                  nombre: form.nombre, banco: form.banco, moneda: form.moneda, color: form.color, icono: form.icono, quien: form.quien,
                  limite: parseFloat(form.limite)||0, dia_cierre: parseInt(form.dia_cierre), dia_vencimiento: parseInt(form.dia_vencimiento),
                  ultimos_4: form.ultimos_4 || null,
                }
                if (tarjetaEditId) await updateTarjeta(tarjetaEditId, payload)
                else await createTarjeta(payload)
                setShowModal(false); setForm(FORM_INIT); setTarjetaEditId(null); refTarjetas()
              } catch(e){console.error(e)} finally{setSaving(false)}
            }} disabled={saving||!form.nombre} className="btn-primary disabled:opacity-50">{saving?'Guardando...':tarjetaEditId?'Guardar cambios':'Guardar'}</button>
          </div>
        </div>
      </Modal>
      {/* ── Modal cargar movimientos (para que una tarjeta no arranque en cero) ── */}
      <Modal open={showCargaModal} onClose={() => setShowCargaModal(false)} title="Cargar movimientos">
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Tarjeta</FieldLabel>
            <select value={cargaTarjetaId ?? ''} onChange={e => setCargaTarjetaId(e.target.value)} className="input-field">
              <option value="">Seleccioná una tarjeta</option>
              {(tarjetas??[]).map(t => <option key={t.id} value={t.id}>{t.nombre} · {t.banco}{t.quien!=='ambos' ? ` · ${t.quien}` : ''}</option>)}
            </select>
          </div>

          <div><FieldLabel>Período que estás cargando</FieldLabel>
            <div className="grid grid-cols-2 gap-3">
              <select value={cargaPeriodoMes} onChange={e => setCargaPeriodoMes(parseInt(e.target.value))} className="input-field">
                {MESES.map((mn, i) => <option key={mn} value={i+1}>{mn}</option>)}
              </select>
              <select value={cargaPeriodoAño} onChange={e => setCargaPeriodoAño(parseInt(e.target.value))} className="input-field">
                {[añoActivo-1, añoActivo, añoActivo+1].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <p className="text-slate-400 text-xs mt-1">Todo lo que cargues acá queda en este período, sin importar la fecha de cada ítem — un resumen trae gastos de más de un mes, pero lo que importa es a qué período le corresponde pagarlo.</p>
          </div>

          <div><FieldLabel>Fecha de vencimiento <span className="text-slate-400 font-normal normal-case">(la real del resumen — puede caer en el mes siguiente)</span></FieldLabel>
            <FechaInput value={cargaFechaVencimiento} onChange={setCargaFechaVencimiento} />
            <p className="text-slate-400 text-xs mt-1">Se completa sola si el texto que pegás en "Pegar bloque" trae el encabezado con la fecha — si no, poné la que corresponda. Se usa para el widget de Vencimientos y para exportarlo al calendario.</p>
          </div>

          <div><FieldLabel>Total declarado <span className="text-slate-400 font-normal normal-case">(el que dice el resumen, por moneda — opcional pero recomendado)</span></FieldLabel>
            <div className="flex flex-col gap-2">
              {cargaTotalesDeclarados.map((td, i) => (
                <div key={i} className="flex gap-2">
                  <select value={td.moneda} onChange={e => setCargaTotalesDeclarados(prev => prev.map((x,j) => j===i ? {...x, moneda: e.target.value as Moneda} : x))} className="input-field w-24 flex-shrink-0">
                    {monedasPalette.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <MontoInput value={td.monto} onChange={raw => setCargaTotalesDeclarados(prev => prev.map((x,j) => j===i ? {...x, monto: raw} : x))} placeholder="0" className="flex-1" />
                  {cargaTotalesDeclarados.length > 1 && (
                    <button onClick={() => setCargaTotalesDeclarados(prev => prev.filter((_,j) => j!==i))} className="text-slate-300 hover:text-red-500 border-none bg-transparent cursor-pointer text-xs flex-shrink-0">✕</button>
                  )}
                </div>
              ))}
              <button onClick={() => setCargaTotalesDeclarados(prev => [...prev, { moneda: 'USD', monto: '' }])} className="text-xs text-slate-500 hover:text-slate-800 border-none bg-transparent cursor-pointer self-start">+ agregar moneda</button>
            </div>
          </div>

          <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
            {[{k:'total',l:'Monto total'},{k:'item',l:'Item por item'},{k:'bloque',l:'Pegar bloque'}].map(o => (
              <button key={o.k} onClick={() => setCargaModo(o.k as any)}
                className={`flex-1 py-1.5 rounded-md text-xs font-semibold border-none cursor-pointer transition-all ${cargaModo===o.k ? 'bg-white text-slate-900 shadow-sm' : 'bg-transparent text-slate-400'}`}>
                {o.l}
              </button>
            ))}
          </div>

          {cargaModo === 'total' && (
            <>
              <p className="text-slate-400 text-xs -mt-2">Un solo movimiento con el total que ya tenías acumulado (ej: "Saldo previo a la app").</p>
              <div><FieldLabel>Descripción</FieldLabel>
                <input value={cargaForm.descripcion} onChange={e => setCargaForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Ej: Saldo inicial" className="input-field" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><FieldLabel>Monto</FieldLabel><MontoInput value={cargaForm.monto} onChange={raw => setCargaForm(p => ({ ...p, monto: raw }))} placeholder="0" /></div>
                <div><FieldLabel>Moneda</FieldLabel>
                  <select value={cargaForm.moneda} onChange={e => setCargaForm(p => ({ ...p, moneda: e.target.value as Moneda }))} className="input-field">
                    {monedasPalette.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div><FieldLabel>Fecha</FieldLabel><FechaInput value={cargaForm.fecha} onChange={iso => setCargaForm(p => ({ ...p, fecha: iso }))} /></div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCargaModal(false)} className="btn-ghost flex-1">Cancelar</button>
                <button onClick={handleGuardarCargaTotal} disabled={guardandoCarga || !cargaTarjetaId || !cargaForm.monto}
                  className="btn-primary flex-1 disabled:opacity-50">{guardandoCarga ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </>
          )}

          {cargaModo === 'item' && (
            <>
              <p className="text-slate-400 text-xs -mt-2">Cargá de a uno — cada "Agregar" lo suma a la lista de abajo, y "Guardar todos" los crea juntos al final.</p>
              <div><FieldLabel>Descripción</FieldLabel>
                <input value={cargaForm.descripcion} onChange={e => setCargaForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Ej: Supermercado Coto" className="input-field" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><FieldLabel>Categoría</FieldLabel>
                  <CategoriaSelector modulo="egresos" value={cargaForm.categoria} onChange={v => setCargaForm(p => ({ ...p, categoria: v }))}
                    categorias={categoriasCustom} categoriasBase={tiposBaseEgreso} onCategoriasChange={refetchCategoriasEgreso} />
                </div>
                <div><FieldLabel>Monto</FieldLabel><MontoInput value={cargaForm.monto} onChange={raw => setCargaForm(p => ({ ...p, monto: raw }))} placeholder="0" /></div>
                <div><FieldLabel>Moneda</FieldLabel>
                  <select value={cargaForm.moneda} onChange={e => setCargaForm(p => ({ ...p, moneda: e.target.value as Moneda }))} className="input-field">
                    {monedasPalette.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1"><FieldLabel>Fecha</FieldLabel><FechaInput value={cargaForm.fecha} onChange={iso => setCargaForm(p => ({ ...p, fecha: iso }))} /></div>
                <button onClick={agregarItemALista} disabled={!cargaForm.descripcion || !cargaForm.monto} className="btn-ghost disabled:opacity-50">+ Agregar</button>
              </div>
              {cargaItems.length > 0 && (
                <div className="max-h-48 overflow-auto flex flex-col gap-1 border-t border-slate-100 pt-2">
                  {cargaItems.map((it, i) => (
                    <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-slate-50">
                      <span className="text-xs text-slate-600 truncate">{it.descripcion}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="font-mono text-xs font-bold text-slate-900">{fmtFull(it.monto, it.moneda)}</span>
                        <button onClick={() => setCargaItems(prev => prev.filter((_,j) => j!==i))} className="text-slate-300 hover:text-red-500 border-none bg-transparent cursor-pointer text-xs">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <ComparacionDeclarado declarados={cargaTotalesDeclarados} items={cargaItems} />
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCargaModal(false)} className="btn-ghost flex-1">Cancelar</button>
                <button onClick={() => handleGuardarCargaItems(cargaItems)} disabled={guardandoCarga || !cargaTarjetaId || cargaItems.length===0}
                  className="btn-primary flex-1 disabled:opacity-50">{guardandoCarga ? 'Guardando...' : `Guardar ${cargaItems.length || ''} item${cargaItems.length===1?'':'s'}`}</button>
              </div>
            </>
          )}

          {cargaModo === 'bloque' && (
            <>
              <p className="text-slate-400 text-xs -mt-2">Pegá el detalle del resumen tal cual (funciona con filas tabuladas fecha/descripción/cuota/comprobante/monto/moneda, o con líneas sueltas tipo "Supermercado Coto 15.230"). Los encabezados del resumen y las líneas de pago se descartan solos. Se arma la lista abajo para revisar antes de guardar.</p>
              <div><FieldLabel>Moneda por defecto <span className="text-slate-400 font-normal normal-case">(si una fila no trae moneda propia)</span></FieldLabel>
                <select value={cargaBloqueMoneda} onChange={e => setCargaBloqueMoneda(e.target.value as Moneda)} className="input-field">
                  {monedasPalette.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <textarea value={cargaBloqueTexto} onChange={e => {
                setCargaBloqueTexto(e.target.value)
                if (!cargaFechaVencimiento) {
                  const detectado = detectarVencimientoEnTexto(e.target.value)
                  if (detectado) setCargaFechaVencimiento(detectado)
                }
              }} rows={6}
                placeholder={'Supermercado Coto 15.230\nNetflix 3.500\nUber 890'} className="input-field font-mono text-xs" />
              {(() => {
                const { items: parseados, pagosOmitidos } = parsearBloque(cargaBloqueTexto, cargaBloqueMoneda)
                return (
                  <>
                    {(parseados.length > 0 || pagosOmitidos > 0) && (
                      <div className="max-h-48 overflow-auto flex flex-col gap-1 border-t border-slate-100 pt-2">
                        <div className="text-xs text-slate-400">
                          {parseados.length} movimiento{parseados.length===1?'':'s'} detectado{parseados.length===1?'':'s'}
                          {pagosOmitidos > 0 && ` · ${pagosOmitidos} pago${pagosOmitidos===1?'':'s'} omitido${pagosOmitidos===1?'':'s'} (ya se refleja en Deudas)`}
                        </div>
                        {parseados.map((it, i) => (
                          <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-slate-50">
                            <span className="text-xs text-slate-600 truncate">{it.descripcion}{it.cuota_actual && it.cuota_total ? ` (${it.cuota_actual}/${it.cuota_total})` : ''}</span>
                            <span className="font-mono text-xs font-bold text-slate-900 flex-shrink-0">{fmtFull(it.monto, it.moneda)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <ComparacionDeclarado declarados={cargaTotalesDeclarados} items={parseados} />
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setShowCargaModal(false)} className="btn-ghost flex-1">Cancelar</button>
                      <button onClick={() => handleGuardarCargaItems(parseados)} disabled={guardandoCarga || !cargaTarjetaId || parseados.length===0}
                        className="btn-primary flex-1 disabled:opacity-50">{guardandoCarga ? 'Guardando...' : `Guardar ${parseados.length || ''} item${parseados.length===1?'':'s'}`}</button>
                    </div>
                  </>
                )
              })()}
            </>
          )}
        </div>
      </Modal>

      <Modal open={showMoverPeriodo} onClose={() => setShowMoverPeriodo(false)} title={`Mover ${seleccionados.size} transacción${seleccionados.size===1?'':'es'}`}>
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Período destino</FieldLabel>
            <div className="grid grid-cols-2 gap-3">
              <select value={moverPeriodoMes} onChange={e => setMoverPeriodoMes(parseInt(e.target.value))} className="input-field">
                {MESES.map((mn, i) => <option key={mn} value={i+1}>{mn}</option>)}
              </select>
              <select value={moverPeriodoAño} onChange={e => setMoverPeriodoAño(parseInt(e.target.value))} className="input-field">
                {[añoActivo-1, añoActivo, añoActivo+1].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowMoverPeriodo(false)} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={handleMoverSeleccionados} disabled={moviendoLote} className="btn-primary flex-1 disabled:opacity-50">
              {moviendoLote ? 'Moviendo...' : 'Mover'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={showTxnModal} onClose={() => { setShowTxnModal(false); setTxnEditId(null) }} title="Editar transacción">
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Descripción</FieldLabel>
            <input value={txnForm.descripcion} onChange={e => setTxnForm(p => ({ ...p, descripcion: e.target.value }))} className="input-field" />
            {txnForm.descripcion_raw && txnForm.descripcion_raw.trim() !== txnForm.descripcion.trim() && (
              <p className="text-slate-400 text-xs mt-1">Tal como aparece en el resumen: {txnForm.descripcion_raw}</p>
            )}
          </div>
          <div><FieldLabel>Categoría</FieldLabel>
            <CategoriaSelector modulo="egresos" value={txnForm.categoria} onChange={v => setTxnForm(p => ({ ...p, categoria: v }))}
              categorias={categoriasCustom} categoriasBase={tiposBaseEgreso} onCategoriasChange={refetchCategoriasEgreso} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Monto</FieldLabel>
              <MontoInput value={txnForm.monto} onChange={raw => setTxnForm(p => ({ ...p, monto: raw }))} />
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
          <div>
            <FieldLabel>Período <span className="text-slate-400 font-normal normal-case">(a qué mes de pago pertenece, no tiene que ser el mismo que la fecha)</span></FieldLabel>
            <div className="grid grid-cols-2 gap-3">
              <select value={txnForm.periodo_mes} onChange={e => setTxnForm(p => ({ ...p, periodo_mes: parseInt(e.target.value) }))} className="input-field">
                {MESES.map((mn, i) => <option key={mn} value={i+1}>{mn}</option>)}
              </select>
              <select value={txnForm.periodo_año} onChange={e => setTxnForm(p => ({ ...p, periodo_año: parseInt(e.target.value) }))} className="input-field">
                {[txnForm.periodo_año-1, txnForm.periodo_año, txnForm.periodo_año+1].filter((a,i,arr)=>arr.indexOf(a)===i).map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => handleDeleteTxn()} disabled={savingTxn} className="text-red-500 hover:text-red-600 border-none bg-transparent cursor-pointer text-sm px-2 disabled:opacity-50">Eliminar</button>
            <div className="flex-1" />
            <button onClick={() => { setShowTxnModal(false); setTxnEditId(null) }} className="btn-ghost">Cancelar</button>
            <button onClick={handleSaveTxn} disabled={savingTxn || !txnForm.descripcion || !txnForm.monto || !txnForm.fecha} className="btn-primary disabled:opacity-50">{savingTxn ? 'Guardando...' : 'Guardar cambios'}</button>
          </div>
        </div>
      </Modal>

      {pickerTipo && pickerTxn && (
        <EtiquetaPickerModal
          open={!!pickerTipo}
          onClose={() => { setPickerTipo(null); setPickerTxn(null) }}
          tipo={pickerTipo}
          etiquetas={etiquetas ?? []}
          proyectos={proyectos ?? []}
          ahorros={ahorros ?? []}
          metas={metas ?? []}
          seleccionadas={etiquetasDeTxn(pickerTxn).filter(id => (etiquetas ?? []).find(e => e.id === id)?.tipo === pickerTipo)}
          onConfirm={async (ids) => {
            const otras = etiquetasDeTxn(pickerTxn).filter(id => (etiquetas ?? []).find(e => e.id === id)?.tipo !== pickerTipo)
            await handleConfirmEtiquetasTxn([...otras, ...ids])
          }}
          onCrear={pickerTipo === 'proyecto' ? handleCrearProyecto : pickerTipo === 'ahorro' ? handleCrearAhorro : undefined}
        />
      )}

    </div>
  )
}

/** Compara lo cargado hasta ahora (items en construcción, todavía sin guardar) contra el total
 *  declarado por moneda — el reemplazo liviano de la conciliación contra PDF: dos números que
 *  el usuario ya tiene a mano, sin necesitar el PDF en sí. Nunca bloquea, solo informa. */
function ComparacionDeclarado({ declarados, items }: {
  declarados: { moneda: Moneda; monto: string }[]
  items: { monto: number; moneda: Moneda }[]
}) {
  const filas = declarados.filter(d => d.monto).map(d => {
    const declarado = parseFloat(d.monto)
    const cargado = items.filter(it => it.moneda === d.moneda).reduce((s, it) => s + it.monto, 0)
    const diferencia = Math.round((cargado - declarado) * 100) / 100
    return { moneda: d.moneda, declarado, cargado, diferencia }
  })
  if (filas.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-2">
      {filas.map(f => (
        <div key={f.moneda} className={`flex items-center justify-between text-xs rounded-lg px-2.5 py-1.5 ${f.diferencia===0 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
          <span className={f.diferencia===0 ? 'text-emerald-700' : 'text-amber-700'}>
            {f.diferencia===0 ? 'Coincide con lo declarado' : `Diferencia de ${fmtFull(Math.abs(f.diferencia), f.moneda)} ${f.diferencia > 0 ? '(cargaste de más)' : '(falta cargar)'}`}
          </span>
          <span className={`font-mono font-bold ${f.diferencia===0 ? 'text-emerald-700' : 'text-amber-700'}`}>{fmtFull(f.cargado, f.moneda)}</span>
        </div>
      ))}
    </div>
  )
}
