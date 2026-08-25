'use client'
import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAppStore, useMonedasDisponibles } from '@/store/appStore'
import { useTarjetas, usePagosTarjeta, useTarjetaTransacciones, usePersonas, useIngresos, useEtiquetas, useProyectos, useAhorros } from '@/hooks'
import { createTarjetaTransaccion, updateTarjetaTransaccion, deleteTarjetaTransaccion, createTarjeta, updateTarjeta, eliminarOArchivarTarjeta, createEvento, conciliarResumen, createTarjetaResumen, generarDeudaDesdeTarjeta, getTarjetaResumenes, getTarjetaTransaccionEtiquetas, setEtiquetasDeTarjetaTransaccion, createProyecto, createAhorro, getEtiquetas, getDeudaDeTarjetaPeriodo, getTarjetaTransacciones } from '@/lib/queries'
import { fmt, fmtFull, fmtDate } from '@/lib/utils/formatters'
import { MESES_CORTOS } from '@/lib/utils/constants'
import { calcularTendencia } from '@/lib/utils/tendencia'
import { quienOpciones, colorQuien } from '@/lib/utils/quien'
import { PageHeader, Card, CardTitle, Modal, Table, Th, Td, LoadingSpinner, EmptyState, FieldLabel, ProgressBar, RowMenu } from '@/components/ui'
import { EtiquetaChips, EtiquetaPickerModal } from '@/components/ui/Etiquetas'
import FechaInput from '@/components/ui/FechaInput'
import MontoInput from '@/components/ui/MontoInput'
import type { Moneda, Quien, TarjetaTransaccion, TarjetaResumen, Deuda } from '@/types'

const TT = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, color:'#0f172a' }
const FORM_INIT = { nombre:'', banco:'', limite:'', moneda:'ARS' as Moneda, color:'#1A5E9E', icono:'V', quien:'ambos' as Quien, dia_cierre:'1', dia_vencimiento:'10', ultimos_4:'' }
const CHART_COLORS = ['#1A5E9E','#F54927','#40B046','#5B3FA6','#E8A020','#D4537E','#1D9E75']
const CAT_COLORS: Record<string,{bg:string,c:string}> = {
  'Alimentación':{bg:'#E9F6EA',c:'#3B6D11'},'Tecnología':{bg:'#E6F1FB',c:'#185FA5'},
  'Ropa':{bg:'#FBEAF0',c:'#72243E'},'Hogar':{bg:'#EEEDFE',c:'#3C3489'},
  'Viajes':{bg:'#E1F5EE',c:'#0F6E56'},'Entretenimiento':{bg:'#FAEEDA',c:'#854F0B'},
  'Salud':{bg:'#FEF0EE',c:'#D03E21'},'Otros':{bg:'#F1EFE8',c:'#5F5E5A'},
}

export default function TarjetasPage() {
  const { añoActivo, vistaTipo, mesActivo, monedaPrincipal: m } = useAppStore()
  const monedasPalette = useMonedasDisponibles()
  const esMensual = vistaTipo === 'mensual'
  const periodoLabel = esMensual ? `${MESES_CORTOS[mesActivo-1]} ${añoActivo}` : `${añoActivo}`
  const { data: tarjetas, loading: lt, refetch: refTarjetas } = useTarjetas()
  const { data: personas } = usePersonas()
  const quienOpts = useMemo(() => quienOpciones(personas), [personas])
  const { data: pagosRaw, loading: lp } = usePagosTarjeta()
  const { data: txnsRaw,  loading: lx, refetch: refTxns } = useTarjetaTransacciones()
  const { data: ingresosRaw } = useIngresos()
  const { data: etiquetas, refetch: refetchEtiquetas } = useEtiquetas()
  const { data: proyectos, refetch: refetchProyectos } = useProyectos()
  const { data: ahorros, refetch: refetchAhorros }     = useAhorros()
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
  const [pickerTipo, setPickerTipo] = useState<'proyecto'|'ahorro'|null>(null)
  const [pickerTxn, setPickerTxn]   = useState<string|null>(null)
  const handleConfirmEtiquetasTxn = async (ids: string[]) => {
    if (!pickerTxn) return
    await setEtiquetasDeTarjetaTransaccion(pickerTxn, ids)
    setTxnEtiquetas(prev => [...prev.filter(x=>x.transaccion_id!==pickerTxn), ...ids.map(etiqueta_id=>({transaccion_id:pickerTxn, etiqueta_id}))])
    setPickerTipo(null); setPickerTxn(null)
  }
  const [resumenes, setResumenes] = useState<TarjetaResumen[]>([])
  useEffect(() => { getTarjetaResumenes().then(setResumenes).catch(()=>{}) }, [])
  const [cerrandoMes, setCerrandoMes] = useState(false)
  const [deudaDelPeriodo, setDeudaDelPeriodo] = useState<Deuda | null>(null)
  const [selTC, setSelTC]         = useState<string|null>(null)
  useEffect(() => {
    if (!selTC) { setDeudaDelPeriodo(null); return }
    getDeudaDeTarjetaPeriodo(selTC, añoActivo, mesActivo).then(setDeudaDelPeriodo).catch(()=>setDeudaDelPeriodo(null))
  }, [selTC, añoActivo, mesActivo])
  const [filterCat, setFilterCat] = useState('Todos')
  const [search, setSearch]       = useState('')
  const [showModal, setShowModal]   = useState(false)
  const [showPDFModal, setShowPDFModal] = useState(false)
  const [showCargaModal, setShowCargaModal] = useState(false)
  const [cargaTarjetaId, setCargaTarjetaId] = useState<string|null>(null)
  const [cargaModo, setCargaModo] = useState<'total'|'item'|'bloque'>('total')
  const [cargaForm, setCargaForm] = useState({ descripcion:'', categoria:'Otros', monto:'', moneda:'ARS' as Moneda, fecha: new Date().toISOString().split('T')[0] })
  const [cargaItems, setCargaItems] = useState<{ descripcion:string; categoria:string; monto:number; moneda:Moneda; fecha:string }[]>([])
  const [cargaBloqueTexto, setCargaBloqueTexto] = useState('')
  const [cargaBloqueMoneda, setCargaBloqueMoneda] = useState<Moneda>('ARS')
  const [guardandoCarga, setGuardandoCarga] = useState(false)
  const [pdfTarjetaId, setPdfTarjetaId] = useState<string|null>(null)
  const [pdfLoading, setPdfLoading]   = useState(false)
  const [pdfError, setPdfError]       = useState('')
  const [pdfTxns, setPdfTxns]         = useState<any[]>([])
  const [pdfResumenInfo, setPdfResumenInfo] = useState<{ fecha_cierre:string; fecha_vencimiento:string; fecha_cierre_proximo?:string; fecha_vencimiento_proximo?:string; total_resumen:number; moneda:Moneda } | null>(null)
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
      await updateTarjetaTransaccion(txnEditId, {
        descripcion: txnForm.descripcion, categoria: txnForm.categoria,
        fecha: txnForm.fecha, monto: parseFloat(txnForm.monto), moneda: txnForm.moneda,
        cuota_actual: txnForm.cuota_actual ? parseInt(txnForm.cuota_actual) : undefined,
        cuota_total: txnForm.cuota_total ? parseInt(txnForm.cuota_total) : undefined,
      })
      setShowTxnModal(false); setTxnEditId(null); refTxns()
    } catch (e) { console.error(e) } finally { setSavingTxn(false) }
  }

  const handleDeleteTxn = async (id?: string) => {
    const targetId = id ?? txnEditId
    if (!targetId) return
    if (!confirm('¿Eliminar esta transacción?')) return
    setSavingTxn(true)
    try {
      await deleteTarjetaTransaccion(targetId)
      setShowTxnModal(false); setTxnEditId(null); refTxns()
    } catch (e) { console.error(e) } finally { setSavingTxn(false) }
  }

  // Parsea texto pegado línea por línea: "Descripción .... monto" al final de cada línea.
  // Acepta formato es-AR (puntos de miles, coma decimal) y un "$" opcional antes del número.
  const parsearBloque = (texto: string, moneda: Moneda) => {
    return texto.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      const match = line.match(/^(.*?)[\s:]*\$?\s*(-?[\d.,]+)\s*$/)
      if (!match) return null
      const descripcion = match[1].trim()
      const montoStr = match[2].replace(/\./g, '').replace(',', '.')
      const monto = parseFloat(montoStr)
      if (!descripcion || isNaN(monto)) return null
      return { descripcion, categoria: 'Otros', monto: Math.abs(monto), moneda, fecha: new Date().toISOString().split('T')[0] }
    }).filter((x): x is { descripcion:string; categoria:string; monto:number; moneda:Moneda; fecha:string } => x !== null)
  }

  const abrirCargaModal = () => {
    setCargaTarjetaId(selTC && !selTC.includes('|') ? selTC : (tarjetas??[])[0]?.id ?? null)
    setCargaModo('total')
    setCargaForm({ descripcion:'', categoria:'Otros', monto:'', moneda:'ARS', fecha: new Date().toISOString().split('T')[0] })
    setCargaItems([])
    setCargaBloqueTexto('')
    setShowCargaModal(true)
  }

  const agregarItemALista = () => {
    if (!cargaForm.descripcion || !cargaForm.monto) return
    setCargaItems(prev => [...prev, { descripcion: cargaForm.descripcion, categoria: cargaForm.categoria, monto: parseFloat(cargaForm.monto), moneda: cargaForm.moneda, fecha: cargaForm.fecha }])
    setCargaForm(p => ({ ...p, descripcion: '', monto: '' }))
  }

  const handleGuardarCargaTotal = async () => {
    if (!cargaTarjetaId || !cargaForm.monto) return
    setGuardandoCarga(true)
    try {
      await createTarjetaTransaccion({
        tarjeta_id: cargaTarjetaId, descripcion: cargaForm.descripcion || 'Saldo inicial', categoria: cargaForm.categoria,
        fecha: cargaForm.fecha, monto: parseFloat(cargaForm.monto), moneda: cargaForm.moneda, tipo: 'credito', etiqueta: null,
      })
      setShowCargaModal(false); refTxns()
    } catch (e) { console.error(e) } finally { setGuardandoCarga(false) }
  }

  const handleGuardarCargaItems = async (items: typeof cargaItems) => {
    if (!cargaTarjetaId || items.length === 0) return
    setGuardandoCarga(true)
    try {
      for (const it of items) {
        await createTarjetaTransaccion({
          tarjeta_id: cargaTarjetaId, descripcion: it.descripcion, categoria: it.categoria,
          fecha: it.fecha, monto: it.monto, moneda: it.moneda, tipo: 'credito', etiqueta: null,
        })
      }
      setShowCargaModal(false); setCargaItems([]); refTxns()
    } catch (e) { console.error(e) } finally { setGuardandoCarga(false) }
  }

  const handleDuplicarTxn = async (t: TarjetaTransaccion) => {
    await createTarjetaTransaccion({
      tarjeta_id: t.tarjeta_id, descripcion: t.descripcion, categoria: t.categoria,
      fecha: t.fecha, monto: t.monto, moneda: t.moneda, cotizacion_ars: t.cotizacion_ars,
      cuota_actual: t.cuota_actual, cuota_total: t.cuota_total, tipo: t.tipo, etiqueta: t.etiqueta,
    })
    refTxns()
  }

  // Cargar historial de comercios al montar
  useEffect(() => {
    import('@/lib/queries').then(q => q.getTarjetasComercios()).then(setComercios).catch(()=>{})
  }, [])
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

  // Clave compuesta tarjeta+moneda — así una tarjeta con pagos en ARS y USD no los mezcla en
  // un solo número sin sentido, y al elegir el chip de una moneda específica se ve solo esa.
  const pagosPorTC = useMemo(() => {
    const map: Record<string, Record<number,number>> = {}
    ;(pagos??[]).forEach(p => {
      const key = `${p.tarjeta_id}|${p.moneda}`
      if (!map[key]) map[key]={}
      map[key][p.mes] = (map[key][p.mes] ?? 0) + p.monto
    })
    return map
  }, [pagos])

  // "id" puede venir como tarjetaId solo (tarjeta de una única moneda) o "tarjetaId|MONEDA"
  // (chip específico de una tarjeta multi-moneda). Si viene solo el id, suma todas sus monedas
  // — aceptable ahí porque en la práctica esa tarjeta ya tiene una sola moneda de todos modos.
  const pagosDe = (id: string, mes: number): number => {
    if (id.includes('|')) return pagosPorTC[id]?.[mes] ?? 0
    return Object.keys(pagosPorTC).filter(k => k.startsWith(id+'|')).reduce((s,k) => s + (pagosPorTC[k][mes] ?? 0), 0)
  }

  const chartData = useMemo(() => MESES_DISP.map((month) => {
    const mes = MESES_CORTOS.indexOf(month) + 1
    const point: Record<string,number|string> = { month }
    if (activaId==='todas') {
      ;(tarjetas??[]).forEach(t => { point[t.id] = pagosDe(t.id, mes) })
    } else {
      point['pago'] = pagosDe(activaId, mes)
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

  // Antes usaba totalPorTC (tabla pagos_tarjeta, que puede estar vacía si solo hay
  // transacciones cargadas/importadas) — ahora suma lo mismo que ya muestra cada card
  // individual (transacciones reales), para que "Todas" no quede en $0 por las dudas.
  // (totalGlobal se calcula más abajo, una vez que existe tarjetasConMoneda)

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

  // Antes usaba totalPorTC (tabla pagos_tarjeta, que puede estar vacía si solo hay
  // transacciones cargadas/importadas) — ahora suma lo mismo que ya muestra cada card
  // individual (transacciones reales), para que "Todas" no quede en $0 por las dudas.
  const totalGlobal = tarjetasConMoneda.filter(x=>x.moneda===m).reduce((s,{tarjeta:t, moneda:mon})=>{
    const txnsMon = (txns??[]).filter(x=>x.tarjeta_id===t.id && x.moneda===mon)
    const totalMon = txnsMon.reduce((ss,x)=>ss+x.monto,0)
    const ultMes = txnsMon.filter(x=>Number(x.fecha.slice(5,7))===new Date().getMonth()+1).reduce((ss,x)=>ss+x.monto,0)
    return s + (ultMes||totalMon)
  }, 0)

  // Vencimientos del mes activo — independiente de si estás en vista mensual o anual, porque un
  // vencimiento siempre es un concepto mensual. Un ítem por (tarjeta, moneda) igual que las cards.
  const vencimientosDelMes = useMemo(() => {
    const result: { tarjeta: NonNullable<typeof tarjetas>[number]; moneda: string; total: number }[] = []
    ;(tarjetas??[]).forEach(t => {
      const txnsDelMes = (txnsRaw??[]).filter(x => x.tarjeta_id===t.id && Number(x.fecha.slice(0,4))===añoActivo && Number(x.fecha.slice(5,7))===mesActivo)
      const monedas = [...new Set(txnsDelMes.map(x=>x.moneda))]
      if (monedas.length === 0) return
      monedas.forEach(mon => {
        const total = txnsDelMes.filter(x=>x.moneda===mon).reduce((s,x)=>s+x.monto, 0)
        if (total > 0) result.push({ tarjeta: t, moneda: mon, total })
      })
    })
    return result.sort((a,b) => a.tarjeta.dia_vencimiento - b.tarjeta.dia_vencimiento)
  }, [tarjetas, txnsRaw, añoActivo, mesActivo])

  const [exportadoIds, setExportadoIds] = useState<Set<string>>(new Set())
  const handleExportarADeuda = async (t: NonNullable<typeof tarjetas>[number], moneda: string, total: number) => {
    const diaClamp = Math.min(t.dia_vencimiento, new Date(añoActivo, mesActivo, 0).getDate())
    await createEvento({
      dia: diaClamp, mes: mesActivo, año: añoActivo, tipo: 'tarjeta',
      descripcion: `${t.nombre}${t.banco ? ' — ' + t.banco : ''}`,
      monto: total, moneda: moneda as Moneda, recurrente: false, pagado: false,
    })
    setExportadoIds(prev => new Set(prev).add(`${t.id}|${moneda}`))
  }

  // "Cerrar mes" a mano — para meses sin resumen del banco. Suma lo cargado (validado o
  // todavía cargado) del período activo y genera/actualiza el ítem de Deuda, sin pasar
  // por conciliación (no hay nada del banco contra qué matchear todavía).
  const handleCerrarMes = async (t: NonNullable<typeof tarjetas>[number], moneda: string) => {
    const txnsDelMes = (txnsRaw??[]).filter(x =>
      x.tarjeta_id===t.id && x.moneda===moneda &&
      Number(x.fecha.slice(0,4))===añoActivo && Number(x.fecha.slice(5,7))===mesActivo &&
      x.estado_conciliacion !== 'revisar'
    )
    const total = txnsDelMes.reduce((s,x)=>s+x.monto, 0)
    if (total <= 0) { alert('No hay gastos cargados para este período todavía.'); return }
    const diaClamp = Math.min(t.dia_vencimiento, new Date(añoActivo, mesActivo, 0).getDate())
    const fechaVenc = `${añoActivo}-${String(mesActivo).padStart(2,'0')}-${String(diaClamp).padStart(2,'0')}`
    setCerrandoMes(true)
    try {
      await generarDeudaDesdeTarjeta(t, añoActivo, mesActivo, total, moneda as Moneda, fechaVenc)
      const deudaActualizada = await getDeudaDeTarjetaPeriodo(t.id, añoActivo, mesActivo)
      setDeudaDelPeriodo(deudaActualizada)
      alert(deudaDelPeriodo
        ? `Recalculado: ${fmtFull(total, moneda)}. Ya lo vas a ver actualizado en Deudas.`
        : `Deuda del período generada: ${fmtFull(total, moneda)}. Si falta algo, cargalo acá y volvé a apretar este botón para recalcular.`)
    } catch (e:any) { alert('Error generando la deuda: '+(e.message||'')) }
    finally { setCerrandoMes(false) }
  }

  if ((lt&&!tarjetas)||(lp&&!pagosRaw)||(lx&&!txnsRaw)) return <LoadingSpinner />

  const tcActiva = activaId==='todas' ? null : (tarjetas??[]).find(t=>t.id===activaId.split('|')[0])
  const monedaActiva = activaId==='todas' ? null : activaId.includes('|') ? activaId.split('|')[1] : null

  const kpiPagos   = activaId==='todas'
    ? MESES_DISP.map((_,i)=>(tarjetas??[]).reduce((s,t)=>s+pagosDe(t.id, i+1),0))
    : MESES_DISP.map((_,i)=>pagosDe(activaId, i+1))
  const kpiTotal   = kpiPagos.reduce((a,b)=>a+b,0)
  const kpiUlt     = kpiPagos[kpiPagos.length-1]
  const kpiPen     = kpiPagos[kpiPagos.length-2]
  const kpiTrend   = kpiPen>0 ? Math.round(((kpiUlt-kpiPen)/kpiPen)*100) : null
  const kpiMayor   = Math.max(...kpiPagos)
  const kpiMayorMes = MESES_DISP[kpiPagos.indexOf(kpiMayor)]

  // % sobre ingresos (mismo criterio que el Dashboard) — comparado en la misma moneda que se
  // está mostrando (la del chip elegido, o la principal en "Todas"), con el mismo alcance
  // (mes activo o año activo según la vista).
  const monedaParaPct = ((monedaActiva ?? m) as Moneda)
  const ingresosPeriodo = (ingresosRaw ?? []).filter(i => i.moneda === monedaParaPct && (!esMensual || i.mes === mesActivo)).reduce((s,i)=>s+i.monto,0)
  const pctSobreIngresos = ingresosPeriodo > 0 ? Math.round(kpiTotal / ingresosPeriodo * 100) : null
  // Mes anterior, para la comparativa — mismo límite ya aceptado en otras pantallas: en enero no
  // hay diciembre del año en curso dentro de este mismo fetch (año-acotado), así que ese mes no
  // muestra comparativa.
  const mesAnteriorNum = mesActivo === 1 ? null : mesActivo - 1
  const pagosMesAnt = mesAnteriorNum ? (pagosRaw ?? []).filter(p => p.año === añoActivo && p.mes === mesAnteriorNum && p.moneda === monedaParaPct && (tarjetaIdActiva === null || p.tarjeta_id === tarjetaIdActiva)).reduce((s,p)=>s+p.monto,0) : 0
  const ingresosMesAnt = mesAnteriorNum ? (ingresosRaw ?? []).filter(i => i.año === añoActivo && i.mes === mesAnteriorNum && i.moneda === monedaParaPct).reduce((s,i)=>s+i.monto,0) : 0
  const pctMesAnt = ingresosMesAnt > 0 ? Math.round(pagosMesAnt / ingresosMesAnt * 100) : null
  const trendPct = (esMensual && mesAnteriorNum && pctSobreIngresos !== null && pctMesAnt !== null && pctMesAnt > 0)
    ? Math.round(((pctSobreIngresos - pctMesAnt) / pctMesAnt) * 100) : null

  // Trend real de "Total pagado" — mes activo vs mes anterior, o año activo vs año anterior según la vista.
  const tarjetaIdActiva  = activaId === 'todas' ? null : activaId.split('|')[0]
  const pagosParaTrend   = (pagosRaw ?? []).filter(p =>
    (tarjetaIdActiva === null || p.tarjeta_id === tarjetaIdActiva) &&
    (monedaActiva === null || p.moneda === monedaActiva))
  const trendTotalPagado = calcularTendencia(pagosParaTrend, vistaTipo, mesActivo, añoActivo)

  return (
    <div>
      <PageHeader title="Tarjetas de crédito" subtitle="Seguimiento de pagos y transacciones"
        action={<div className="flex gap-2 flex-wrap justify-end">
          <button className="btn-ghost text-sm" onClick={abrirCargaModal}>+ Cargar movimientos</button>
          <button className="btn-ghost text-sm" onClick={()=>{ setPdfTarjetaId(selTC); setShowPDFModal(true); setPdfStep('upload'); setPdfTxns([]); setPdfResumenInfo(null); setPdfError('') }}>Importar PDF</button>
          <button className="btn-primary" onClick={()=>{setForm(FORM_INIT);setTarjetaEditId(null);setShowModal(true)}}>+ Nueva tarjeta</button>
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
          const ultMes   = (txns??[]).filter(x=>x.tarjeta_id===t.id && x.moneda===mon && Number(x.fecha.slice(5,7))===new Date().getMonth()+1).reduce((s,x)=>s+x.monto,0)
          const multiMoneda = tarjetasConMoneda.filter(x=>x.tarjeta.id===t.id).length > 1
          return (
            <div key={cardId} onClick={()=>setSelTC(cardId)}
              className="group relative flex-shrink-0 bg-white border-2 rounded-2xl p-4 cursor-pointer transition-all min-w-[155px]"
              style={{borderColor: isActive ? t.color : '#f1f5f9'}}>
              <button onClick={e=>{e.stopPropagation(); openEditTarjetaModal(t)}}
                className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-slate-50 border-none bg-transparent cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity text-xs">✎</button>
              <div className="flex justify-between items-start mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{background:t.color}}>{t.icono}</div>
                <div className="flex flex-col items-end gap-1">
                  {t.quien!=='ambos' && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colorQuien(t.quien).bg} ${colorQuien(t.quien).text}`}>{t.quien}</span>
                  )}
                  {multiMoneda && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{mon}</span>
                  )}
                </div>
              </div>
              <div className="text-sm font-semibold text-slate-900">{t.nombre}</div>
              <div className="text-xs text-slate-400">{t.banco}{t.ultimos_4 && <span className="font-mono"> ····{t.ultimos_4}</span>}</div>
              <div className="text-lg font-bold font-mono mt-1" style={{color:t.color}}>
                {mon==='USD'?'US$':mon==='EUR'?'€':'$'}{(ultMes||totalMon).toLocaleString('es-AR',{maximumFractionDigits:0})}
              </div>
              <div className="text-[10px] text-slate-400">{ultMes?`últ. mes · ${mon}`:`total · ${mon}`}</div>
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
                  <Th>Fecha</Th><Th>Descripción</Th><Th>Categoría</Th><Th>Cuotas</Th><Th right>Importe</Th><Th right> </Th>
                </tr></thead>
                <tbody>
                  {filteredTxns.map(t=>{
                    const cc = CAT_COLORS[t.categoria]||{bg:'#F1EFE8',c:'#5F5E5A'}
                    const isUSD = t.moneda==='USD'
                    const tc = (tarjetas??[]).find(x=>x.id===t.tarjeta_id)
                    return (
                      <tr key={t.id} className="group">
                        <Td className="text-slate-400 text-xs font-mono">{fmtDate(t.fecha)}</Td>
                        <Td>
                          <div onClick={() => openEditTxnModal(t)} className="text-slate-700 font-medium cursor-pointer hover:underline hover:font-bold">{t.descripcion}</div>
                          {tc && <div className="text-slate-400 text-xs">{tc.nombre} · {tc.banco}</div>}
                          <EtiquetaChips etiquetaIds={etiquetasDeTxn(t.id)} etiquetas={etiquetas ?? []} proyectos={proyectos ?? []} ahorros={ahorros ?? []} />
                        </Td>
                        <Td>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{background:cc.bg,color:cc.c}}>{t.categoria}</span>
                          {t.estado_conciliacion==='revisar' && <div className="text-[10px] text-amber-600 font-medium mt-1">A revisar</div>}
                          {t.estado_conciliacion==='cargado' && <div className="text-[10px] text-slate-400 mt-1">Sin resumen</div>}
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

          {/* Estado de conciliación — solo con una tarjeta puntual seleccionada */}
          {tcActiva && (() => {
            const t = tcActiva
            const txnsTarjeta = (txns??[]).filter(x=>x.tarjeta_id===t.id && (!monedaActiva || x.moneda===monedaActiva))
            const confirmado = txnsTarjeta.filter(x=>x.estado_conciliacion==='validado').reduce((s,x)=>s+x.monto,0)
            const cargado    = txnsTarjeta.filter(x=>x.estado_conciliacion==='cargado').reduce((s,x)=>s+x.monto,0)
            const revisarTxns = txnsTarjeta.filter(x=>x.estado_conciliacion==='revisar')
            const revisar    = revisarTxns.reduce((s,x)=>s+x.monto,0)
            const monedaMostrar = monedaActiva ?? t.moneda
            const cierre = t.fecha_cierre_actual ?? null
            const vencimiento = t.fecha_vencimiento_actual ?? null
            const ultimoResumen = resumenes.filter(r=>r.tarjeta_id===t.id).sort((a,b)=>b.año-a.año||b.mes-a.mes)[0]
            return (
              <Card>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-slate-900 font-semibold text-[13px]">Conciliación — {t.nombre}</div>
                  <button onClick={()=>handleCerrarMes(t, monedaMostrar)} disabled={cerrandoMes} className="text-xs text-slate-500 hover:text-slate-800 border-none bg-transparent cursor-pointer disabled:opacity-50 flex-shrink-0">
                    {cerrandoMes ? '...' : deudaDelPeriodo ? 'Recalcular' : 'Cerrar mes'}
                  </button>
                </div>
                {deudaDelPeriodo && (
                  <div className="text-[11px] text-emerald-600 mb-2">Mes cerrado — deuda generada por {fmtFull(deudaDelPeriodo.total_original, deudaDelPeriodo.moneda)}. Si falta un gasto, cargalo y volvé a apretar "Recalcular".</div>
                )}
                <div className="text-slate-400 text-xs mb-3">
                  {cierre ? `Cierre ${fmtDate(cierre)}` : `Cierre est. día ${t.dia_cierre}`}
                  {vencimiento ? ` · Vence ${fmtDate(vencimiento)}` : ` · Vence est. día ${t.dia_vencimiento}`}
                </div>
                <div className="flex flex-col gap-1.5 mb-2">
                  <div className="flex items-center justify-between text-xs"><span className="text-slate-400">Confirmado</span><span className="font-mono font-bold text-emerald-600">{fmtFull(confirmado, monedaMostrar)}</span></div>
                  <div className="flex items-center justify-between text-xs"><span className="text-slate-400">Cargado, sin resumen</span><span className="font-mono font-bold text-slate-700">{fmtFull(cargado, monedaMostrar)}</span></div>
                  <div className="flex items-center justify-between text-xs"><span className="text-slate-400">A revisar</span><span className="font-mono font-bold text-amber-600">{fmtFull(revisar, monedaMostrar)}</span></div>
                </div>
                {revisarTxns.length > 0 && (
                  <div className="border border-amber-200 rounded-lg overflow-hidden mt-2">
                    {revisarTxns.map(x => (
                      <div key={x.id} onClick={()=>openEditTxnModal(x)} className="flex items-center justify-between px-2.5 py-1.5 border-b border-amber-100 last:border-0 bg-amber-50 cursor-pointer hover:bg-amber-100">
                        <div className="min-w-0 text-xs text-slate-700 truncate">{x.descripcion}</div>
                        <span className="text-xs font-mono text-slate-500 flex-shrink-0 ml-2">{fmtFull(x.monto, x.moneda)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {ultimoResumen && (
                  <div className="text-[11px] text-slate-400 mt-2">
                    Último resumen: {fmtFull(ultimoResumen.total_resumen, ultimoResumen.moneda)} ({MESES_CORTOS[ultimoResumen.mes-1]} {ultimoResumen.año})
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
                {vencimientosDelMes.map(({tarjeta: t, moneda: mon, total}) => {
                  const key = `${t.id}|${mon}`
                  const yaExportado = exportadoIds.has(key)
                  return (
                    <div key={key} className="group flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg flex flex-col items-center justify-center flex-shrink-0" style={{background:t.color+'18'}}>
                          <span className="text-xs font-bold font-mono leading-none" style={{color:t.color}}>{t.dia_vencimiento}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-700 truncate">{t.nombre}</div>
                          <div className="text-[11px] text-slate-400">vence el {t.dia_vencimiento}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className={`font-mono font-bold text-xs ${yaExportado?'text-emerald-600':'text-red-600'}`}>{fmtFull(total, mon as Moneda)}</span>
                        <RowMenu items={[
                          { label: yaExportado ? 'Ya exportado a Deuda' : 'Exportar a Deuda', onClick: () => !yaExportado && handleExportarADeuda(t, mon, total), disabled: yaExportado },
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
            <CardTitle>
              Evolución de pagos
              <span className="text-slate-400 text-xs font-normal ml-2">{activaId==='todas'?'Todas las tarjetas':tcActiva?.nombre}</span>
            </CardTitle>
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
                {l:`Total pagado ${periodoLabel}`, v:fmt(kpiTotal,(monedaActiva ?? m) as Moneda), s:trendTotalPagado.trend!==undefined?(trendTotalPagado.trend>=0?'▲':'▼')+' '+Math.abs(trendTotalPagado.trend)+'% '+trendTotalPagado.label:(activaId==='todas'?'Todas las tarjetas':tcActiva?.banco||'')},
                {l:`Último pago (${MESES_DISP[MESES_DISP.length-1]})`, v:fmt(kpiUlt,(monedaActiva ?? m) as Moneda), s:kpiTrend!==null?(kpiTrend>=0?'▲':'▼')+' '+Math.abs(kpiTrend)+'% vs anterior':'', c:kpiTrend!==null&&kpiTrend>=0?'#F54927':'#40B046'},
                {l:'Mes más caro', v:fmt(kpiMayor,(monedaActiva ?? m) as Moneda), s:kpiMayorMes},
                {l:'% sobre ingresos', v:pctSobreIngresos!==null?`${pctSobreIngresos}%`:'—', s:trendPct!==null?(trendPct>=0?'▲':'▼')+' '+Math.abs(trendPct)+'% vs mes anterior':(pctSobreIngresos===null?`Sin ingresos en ${monedaParaPct} este período`:''), c:pctSobreIngresos!==null?(pctSobreIngresos>40?'#F54927':pctSobreIngresos>25?'#E8A020':'#40B046'):undefined},
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
                        prompt: `Extraé la información de este resumen de tarjeta de crédito.${tarjetaCtx}${comerciosCtx}

Respondé SOLO con un JSON object, sin texto extra, sin backticks, sin markdown, con esta forma exacta:
{
  "resumen": {
    "fecha_cierre": "YYYY-MM-DD (fecha de cierre de ESTE resumen)",
    "fecha_vencimiento": "YYYY-MM-DD (fecha de vencimiento de ESTE resumen)",
    "fecha_cierre_proximo": "YYYY-MM-DD o null (próximo cierre, si el PDF lo indica)",
    "fecha_vencimiento_proximo": "YYYY-MM-DD o null (próximo vencimiento, si el PDF lo indica)",
    "total_resumen": número positivo (total a pagar de este resumen),
    "moneda": "ARS" o "USD"
  },
  "transacciones": [
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
  ]
}
En "transacciones" solo incluí gastos/compras, no pagos ni resúmenes de cuenta.
Para el campo descripcion, usá el nombre real del negocio, no el código técnico del extracto.`
                      })
                    })
                    const data = await resp.json()
                    if (!resp.ok) throw new Error(data?.error || 'Error analizando el PDF')
                    const clean = (data.text||'').replace(/\`\`\`json|\`\`\`/g,'').trim()
                    const parsed = JSON.parse(clean)
                    setPdfResumenInfo(parsed.resumen ?? null)
                    setPdfTxns((parsed.transacciones ?? []).map((t:any,i:number)=>({...t,id:i,selected:true,tarjeta_id:pdfTarjetaId})))
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
                  const tarjetaActual = (tarjetas??[]).find(t=>t.id===pdfTarjetaId)
                  const seleccionadas = pdfTxns.filter(t=>t.selected)
                  const itemsParaConciliar = seleccionadas.map(t => ({
                    descripcion: t.descripcion, categoria: t.categoria, fecha: t.fecha,
                    monto: t.monto, moneda: t.moneda as Moneda,
                    cuota_actual: t.cuota_actual ?? undefined, cuota_total: t.cuota_total ?? undefined,
                  }))

                  if (pdfResumenInfo && pdfTarjetaId && tarjetaActual) {
                    const año = Number(pdfResumenInfo.fecha_cierre.slice(0,4))
                    const mes = Number(pdfResumenInfo.fecha_cierre.slice(5,7))
                    const resumen = await createTarjetaResumen({
                      tarjeta_id: pdfTarjetaId, año, mes,
                      fecha_cierre: pdfResumenInfo.fecha_cierre, fecha_vencimiento: pdfResumenInfo.fecha_vencimiento,
                      fecha_cierre_proximo: pdfResumenInfo.fecha_cierre_proximo ?? null,
                      fecha_vencimiento_proximo: pdfResumenInfo.fecha_vencimiento_proximo ?? null,
                      total_resumen: pdfResumenInfo.total_resumen, moneda: pdfResumenInfo.moneda,
                    })
                    await conciliarResumen(pdfTarjetaId, resumen.id, itemsParaConciliar)
                    await generarDeudaDesdeTarjeta(tarjetaActual, año, mes, pdfResumenInfo.total_resumen, pdfResumenInfo.moneda, pdfResumenInfo.fecha_vencimiento)
                    await updateTarjeta(pdfTarjetaId, {
                      fecha_cierre_actual: pdfResumenInfo.fecha_cierre, fecha_vencimiento_actual: pdfResumenInfo.fecha_vencimiento,
                      fecha_cierre_proximo: pdfResumenInfo.fecha_cierre_proximo ?? null,
                      fecha_vencimiento_proximo: pdfResumenInfo.fecha_vencimiento_proximo ?? null,
                    })
                    setResumenes(await getTarjetaResumenes())
                    refTarjetas()
                  } else {
                    // El PDF no devolvió fechas de resumen (formato inesperado) — se insertan
                    // las transacciones igual, sin conciliar, para no perder la carga.
                    for (const it of itemsParaConciliar) {
                      await createTarjetaTransaccion({
                        tarjeta_id: pdfTarjetaId!, descripcion: it.descripcion, categoria: it.categoria,
                        fecha: it.fecha, monto: it.monto, moneda: it.moneda,
                        cuota_actual: it.cuota_actual, cuota_total: it.cuota_total,
                        tipo: 'credito', origen: 'pdf', estado_conciliacion: 'validado',
                      })
                    }
                  }
                  refTxns()

                  // Guardar aprendizaje: cada transacción corregida
                  const { upsertTarjetaComercios } = await import('@/lib/queries')
                  const aprendizaje = seleccionadas.filter(t=>t.descripcion_raw).map(t=>({
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

      {/* ── Modal cargar movimientos (para que una tarjeta no arranque en cero) ── */}
      <Modal open={showCargaModal} onClose={() => setShowCargaModal(false)} title="Cargar movimientos">
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Tarjeta</FieldLabel>
            <select value={cargaTarjetaId ?? ''} onChange={e => setCargaTarjetaId(e.target.value)} className="input-field">
              <option value="">Seleccioná una tarjeta</option>
              {(tarjetas??[]).map(t => <option key={t.id} value={t.id}>{t.nombre} · {t.banco}</option>)}
            </select>
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
                  <select value={cargaForm.categoria} onChange={e => setCargaForm(p => ({ ...p, categoria: e.target.value }))} className="input-field">
                    {['Alimentación','Tecnología','Ropa','Hogar','Viajes','Entretenimiento','Salud','Otros'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
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
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCargaModal(false)} className="btn-ghost flex-1">Cancelar</button>
                <button onClick={() => handleGuardarCargaItems(cargaItems)} disabled={guardandoCarga || !cargaTarjetaId || cargaItems.length===0}
                  className="btn-primary flex-1 disabled:opacity-50">{guardandoCarga ? 'Guardando...' : `Guardar ${cargaItems.length || ''} item${cargaItems.length===1?'':'s'}`}</button>
              </div>
            </>
          )}

          {cargaModo === 'bloque' && (
            <>
              <p className="text-slate-400 text-xs -mt-2">Pegá una línea por movimiento, con el monto al final (ej: "Supermercado Coto 15.230"). Se arma la lista abajo para revisar antes de guardar.</p>
              <div><FieldLabel>Moneda de todo el bloque</FieldLabel>
                <select value={cargaBloqueMoneda} onChange={e => setCargaBloqueMoneda(e.target.value as Moneda)} className="input-field">
                  {monedasPalette.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <textarea value={cargaBloqueTexto} onChange={e => setCargaBloqueTexto(e.target.value)} rows={6}
                placeholder={'Supermercado Coto 15.230\nNetflix 3.500\nUber 890'} className="input-field font-mono text-xs" />
              {(() => {
                const parseados = parsearBloque(cargaBloqueTexto, cargaBloqueMoneda)
                return (
                  <>
                    {parseados.length > 0 && (
                      <div className="max-h-48 overflow-auto flex flex-col gap-1 border-t border-slate-100 pt-2">
                        <div className="text-xs text-slate-400">{parseados.length} movimiento{parseados.length===1?'':'s'} detectado{parseados.length===1?'':'s'}</div>
                        {parseados.map((it, i) => (
                          <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-slate-50">
                            <span className="text-xs text-slate-600 truncate">{it.descripcion}</span>
                            <span className="font-mono text-xs font-bold text-slate-900 flex-shrink-0">{fmtFull(it.monto, it.moneda)}</span>
                          </div>
                        ))}
                      </div>
                    )}
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
          seleccionadas={etiquetasDeTxn(pickerTxn).filter(id => (etiquetas ?? []).find(e => e.id === id)?.tipo === pickerTipo)}
          onConfirm={async (ids) => {
            const otras = etiquetasDeTxn(pickerTxn).filter(id => (etiquetas ?? []).find(e => e.id === id)?.tipo !== pickerTipo)
            await handleConfirmEtiquetasTxn([...otras, ...ids])
          }}
          onCrear={pickerTipo === 'proyecto' ? handleCrearProyecto : handleCrearAhorro}
        />
      )}

    </div>
  )
}
