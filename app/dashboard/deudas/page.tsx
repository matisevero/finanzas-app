'use client'
import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAppStore, useMonedasDisponibles } from '@/store/appStore'
import { useDeudas, useEventosMes, useEventosAño, useIngresos, useDescripcionesDistintas, useEtiquetasDistintas, useCategoriasCustom, useAhorros, useAllIngresos, useAllEgresos, useEtiquetas, useEgresoEtiquetas, useIngresoEtiquetas } from '@/hooks'
import { createDeuda, updateDeuda, deleteDeuda, pagarEvento, despagarEvento, updateEvento, deleteEvento, createEvento, createEgreso, updateEgreso, deleteEgreso, recibirDevolucion, descartarDevolucion, agregarEtiquetaAEgreso } from '@/lib/queries'
import { fmt, fmtFull, fmtDate, ocultarValor } from '@/lib/utils/formatters'
import { MESES, MESES_CORTOS, TIPOS_EVENTO } from '@/lib/utils/constants'
import { PageHeader, Card, Modal, LoadingSpinner, FieldLabel, ProgressBar, Tabs, StatCard } from '@/components/ui'
import FechaInput from '@/components/ui/FechaInput'
import MontoInput from '@/components/ui/MontoInput'
import AutocompleteInput from '@/components/ui/AutocompleteInput'
import CategoriaSelector from '@/components/ui/CategoriaSelector'
import type { Moneda, Egreso, Quien } from '@/types'

const HOY     = new Date()
const HOY_DIA = HOY.getDate()
const HOY_MES = HOY.getMonth()
const HOY_AÑO = HOY.getFullYear()

const CATEGORIAS_EVENTO = [
  { key: 'tarjeta',    label: 'Tarjeta',     color: '#1A5E9E', icon: '' },
  { key: 'casa',       label: 'Casa',        color: '#40B046', icon: '' },
  { key: 'servicio',   label: 'Servicios',   color: '#E8A020', icon: '' },
  { key: 'expensa',    label: 'Expensas',    color: '#5B3FA6', icon: '' },
  { key: 'edu',        label: 'Educación',   color: '#D4537E', icon: '' },
  { key: 'devolucion', label: 'Devolución',  color: '#1D9E75', icon: '' },
  { key: 'egreso',     label: 'Otro egreso', color: '#888780', icon: '' },
]

// ─── Widgets personalizables ────────────────────────────────────────────────
const WIDGET_OPTIONS_DEU = [
  { id: 'vence_mes',       label: 'Vence este mes',    icon: '📅' },
  { id: 'pagado_mes',      label: 'Pagado este mes',   icon: '✅' },
  { id: 'pct_ingresos',    label: '% sobre ingresos',  icon: '📊' },
  { id: 'deudas_activas',  label: 'Deudas LP activas', icon: '📋' },
  { id: 'total_pendiente', label: 'Total pendiente',   icon: '💸' },
  { id: 'cuota_mensual',   label: 'Cuota mensual fija',icon: '🔁' },
]
const DEFAULT_WIDGETS_DEU = ['vence_mes', 'pagado_mes', 'pct_ingresos', 'deudas_activas']

// ─── Widgets personalizables — Largo Plazo ─────────────────────────────────
const WIDGET_OPTIONS_LP = [
  { id: 'deuda_total_lp',       label: 'Deuda total LP',              icon: '💰' },
  { id: 'pct_deuda_ahorros_usd',label: '% deuda / ahorros en USD',    icon: '💵' },
  { id: 'plazo_estimado',       label: 'Plazo estimado de pago',      icon: '⏳' },
  { id: 'cuota_mensual_lp',     label: 'Cuota mensual comprometida',  icon: '🔁' },
]
const DEFAULT_WIDGETS_LP = ['deuda_total_lp', 'pct_deuda_ahorros_usd', 'plazo_estimado']

/** Resuelve label/color de una categoría de vencimiento, sea base (CATEGORIAS_EVENTO) o custom. */
function getCatInfo(tipoId: string, categoriasCustom: { id: string; nombre: string; color: string }[] | undefined) {
  const base = CATEGORIAS_EVENTO.find(c => c.key === tipoId)
  if (base) return base
  const custom = (categoriasCustom ?? []).find(c => c.id === tipoId)
  if (custom) return { key: custom.id, label: custom.nombre, color: custom.color, icon: '' }
  return CATEGORIAS_EVENTO[CATEGORIAS_EVENTO.length - 1]
}


// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DeudasPage() {
  const { añoActivo, monedaPrincipal: m, saldosOcultos } = useAppStore()
  const oc = (s: string) => saldosOcultos ? ocultarValor(s) : s
  const monedasPalette = useMonedasDisponibles()
  const { data: deudas, loading: ld, refetch: refDeudas } = useDeudas()
  const descripcionesEventosQ = useDescripcionesDistintas('eventos_calendario')
  const etiquetasQ = useEtiquetasDistintas()
  const { data: categoriasEventoCustom, refetch: refetchCatsEvento } = useCategoriasCustom('eventos')
  const { data: ingresos } = useIngresos()
  const { data: ahorros } = useAhorros()
  const { data: etiquetas, refetch: refetchEtiquetas } = useEtiquetas()
  const { data: egresoEtiquetas, refetch: refetchEgresoEtiquetas } = useEgresoEtiquetas()
  const { data: ingresoEtiquetas } = useIngresoEtiquetas()
  const [detalleDeudaId, setDetalleDeudaId] = useState<string | null>(null)
  const [vinculando, setVinculando] = useState(false)
  const [buscarVincular, setBuscarVincular] = useState('')
  const [editandoMovId, setEditandoMovId] = useState<string | null>(null)
  const [movForm, setMovForm] = useState({ descripcion: '', monto: '', fecha: '' })
  const { data: allIngresos } = useAllIngresos()
  const { data: allEgresos } = useAllEgresos()
  const [tab, setTab] = useState<'calendario'|'largo'>('calendario')
  const [calMes, setCalMes] = useState(HOY_MES)
  const [calAño, setCalAño] = useState(HOY_AÑO)
  const { data: eventos, loading: le, refetch: refEventos } = useEventosMes(calAño, calMes + 1)
  const { data: eventosAño } = useEventosAño(calAño)
  const [expanded, setExpanded] = useState<Record<string,boolean>>({})
  const [mostrarPagados, setMostrarPagados] = useState(false)
  const [mostrarArchivadas, setMostrarArchivadas] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pagandoCuotaId, setPagandoCuotaId] = useState<string|null>(null)

  // Modal nuevo/editar evento (calendario)
  const [showEvModal, setShowEvModal] = useState(false)
  const [modalEditEventoId, setModalEditEventoId] = useState<string|null>(null)
  const [evForm, setEvForm] = useState({
    descripcion: '', tipo: 'egreso',
    fecha: `${calAño}-${String(calMes + 1).padStart(2, '0')}-${String(HOY_DIA).padStart(2, '0')}`,
    monto: '', moneda: 'ARS' as Moneda, recurrente: false,
    cuotas: '1', gastoFijo: false, nota: '',
  })

  // Modal nueva deuda largo plazo
  const [showDeudaModal, setShowDeudaModal] = useState(false)
  const [mostrarDetallesLP, setMostrarDetallesLP] = useState(false)
  const [widgetsCal, setWidgetsCal] = useState<string[]>(DEFAULT_WIDGETS_DEU)
  const [widgetsLP, setWidgetsLP]   = useState<string[]>(DEFAULT_WIDGETS_LP)
  const [editingWidgets, setEditingWidgets] = useState(false)
  const [modalEditDeudaId, setModalEditDeudaId] = useState<string|null>(null)
  const [deudaForm, setDeudaForm] = useState({
    nombre: '', banco: '', total_original: '', pendiente: '', cuota_mensual: '',
    fecha_inicio: new Date().toISOString().split('T')[0],
    fecha_vencimiento: '', cuota_actual: '1', cuota_total: '1',
    moneda: 'ARS' as Moneda, color: '#5B3FA6', etiqueta: '',
  })

  // ── Stats ──────────────────────────────────────────────────────────────────
  const diasEnMes   = new Date(calAño, calMes+1, 0).getDate()
  const primerDia   = new Date(calAño, calMes, 1).getDay()
  const offsetLunes = primerDia === 0 ? 6 : primerDia - 1

  const eventosFiltrados = useMemo(() => {
    const base = (eventos ?? []).filter(e => e.tipo !== 'ingreso')
    return mostrarPagados ? base : base.filter(e => !e.pagado)
  }, [eventos, mostrarPagados])

  const eventosPorDia = useMemo(() => {
    const mp: Record<number, typeof eventos> = {}
    eventosFiltrados.forEach(e => { if (!mp[e.dia]) mp[e.dia] = []; mp[e.dia]!.push(e) })
    return mp
  }, [eventosFiltrados])

  const totalPendiente = (deudas ?? []).reduce((s, d) => s + d.pendiente, 0)
  const cuotaMensual   = (deudas ?? []).reduce((s, d) => s + d.cuota_mensual, 0)
  // "Vence este mes" / "Restante": lo que todavía está sin pagar (para la lista y el resumen operativo).
  const venceMes       = (eventos ?? []).filter(e => e.tipo !== 'ingreso' && e.tipo !== 'devolucion' && !e.pagado && e.monto).reduce((s, e) => s + (e.monto ?? 0), 0)
  const pagadoMes      = (eventos ?? []).filter(e => e.pagado && e.monto).reduce((s, e) => s + (e.monto ?? 0), 0)
  const pendientes     = (eventos ?? []).filter(e => !e.pagado && e.tipo !== 'ingreso' && e.tipo !== 'devolucion').length
  const devolucionesPendientes = (eventos ?? []).filter(e => e.tipo === 'devolucion' && !e.pagado && e.monto).reduce((s, e) => s + (e.monto ?? 0), 0)
  // Total comprometido del mes (pagado + pendiente): esto es lo que se usa para el % sobre ingresos,
  // porque pagar una deuda no hace que deje de haber implicado ese % de tus ingresos ese mes.
  const totalComprometidoMes = (eventos ?? []).filter(e => e.tipo !== 'ingreso' && e.tipo !== 'devolucion' && e.monto).reduce((s, e) => s + (e.monto ?? 0), 0)

  // Gráfico anual: vencimientos reales por mes vs ingresos del mes (siempre pagado+pendiente, por la misma razón)
  const chartAnual = useMemo(() => {
    const LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
    return Array.from({length: 12}, (_, i) => {
      const mesNum = i + 1
      const ingMes = (ingresos ?? []).filter(ing => ing.mes === mesNum && ing.año === calAño).reduce((s, ing) => s + ing.monto, 0)
      const deudaMes = (eventosAño ?? []).filter(ev => ev.mes === mesNum && ev.tipo !== 'ingreso' && ev.tipo !== 'devolucion' && ev.monto).reduce((s, ev) => s + (ev.monto ?? 0), 0)
      const pct = ingMes > 0 ? Math.round(deudaMes / ingMes * 100) : 0
      return { month: LABELS[i], ingresos: ingMes, deudas: deudaMes, pct }
    })
  }, [ingresos, eventosAño, calAño])

  // % vencimientos vs ingresos del mes (pagado + pendiente)
  const totalIngresosMes = (ingresos ?? []).filter(i => i.mes === calMes + 1 && i.año === calAño).reduce((s, i) => s + i.monto, 0)
  const pctDeudaIngresos = totalIngresosMes > 0 ? Math.round(totalComprometidoMes / totalIngresosMes * 100) : 0

  // mes anterior para trends — derivado de eventosAño (ya cargado). En enero, al no haber diciembre
  // del año en curso dentro de este mismo fetch, el trend simplemente no se muestra ese mes.
  const eventosMesAnt = (eventosAño ?? []).filter(e => e.mes === calMes && e.tipo !== 'ingreso' && e.tipo !== 'devolucion' && e.monto)
  const pagadoMesAnt        = eventosMesAnt.filter(e => e.pagado).reduce((s, e) => s + (e.monto ?? 0), 0)
  const totalComprometidoAnt = eventosMesAnt.reduce((s, e) => s + (e.monto ?? 0), 0)
  const venceMesAnt         = eventosMesAnt.filter(e => !e.pagado).reduce((s, e) => s + (e.monto ?? 0), 0)
  const ingresosMesAnt = (ingresos ?? []).filter(i => i.mes === calMes && i.año === calAño).reduce((s, i) => s + i.monto, 0)
  const pctAnt = ingresosMesAnt > 0 ? Math.round(totalComprometidoAnt / ingresosMesAnt * 100) : 0

  const trendPagado  = pagadoMesAnt > 0 ? Math.round((pagadoMes - pagadoMesAnt) / pagadoMesAnt * 100) : undefined
  const trendVence    = venceMesAnt > 0 ? Math.round((venceMes - venceMesAnt) / venceMesAnt * 100) : undefined
  const trendPct       = pctAnt > 0 ? Math.round(((pctDeudaIngresos - pctAnt) / pctAnt) * 100) : undefined

  // ── Métricas de Largo Plazo ──────────────────────────────────────────────────
  // Ahorro/inversión acumulado en USD (mismo criterio que la página de Ahorros): automático + ajuste manual.
  const ahorroUSD = (ahorros ?? []).filter(a => a.moneda === 'USD').reduce((s, a) => {
    const ing = (allIngresos ?? []).filter(i => i.tipo === a.categoria && i.moneda === 'USD').reduce((x,i)=>x+i.monto,0)
    const egr = (allEgresos ?? []).filter(e => e.categoria === a.categoria && e.moneda === 'USD').reduce((x,e)=>x+e.monto,0)
    return s + Math.max(0, ing - egr) + a.ajuste_manual
  }, 0)
  const deudaLP_USD = (deudas ?? []).filter(d => d.moneda === 'USD').reduce((s, d) => s + d.pendiente, 0)
  const pctDeudaAhorrosUSD = ahorroUSD > 0 ? Math.round(deudaLP_USD / ahorroUSD * 100) : (deudaLP_USD > 0 ? null : 0)

  // Plazo estimado: meses restantes de la deuda con el pago más largo (peor caso = respuesta más útil).
  const deudasActivas = (deudas ?? []).filter(d => d.activa !== false && d.pendiente > 0)
  const plazosPorDeuda = deudasActivas
    .filter(d => d.cuota_mensual > 0)
    .map(d => ({ d, meses: Math.ceil(d.pendiente / d.cuota_mensual) }))
  const plazoMax = plazosPorDeuda.length > 0 ? plazosPorDeuda.reduce((a, b) => b.meses > a.meses ? b : a) : null
  const fechaEstimadaPago = plazoMax ? (() => {
    const f = new Date(); f.setMonth(f.getMonth() + plazoMax.meses)
    return `${MESES[f.getMonth()]} ${f.getFullYear()}`
  })() : null

  // Proyección de pago por moneda: deuda pendiente en esa moneda ÷ lo que ahorramos en promedio
  // por mes en esa misma moneda (histórico real, mismo criterio de "automático" que usa Ahorros:
  // ingresos - egresos de las categorías vinculadas a algún Ahorro en esa moneda).
  const proyeccionesPago = useMemo(() => {
    const monedasConDeuda = Array.from(new Set(deudasActivas.map(d => d.moneda)))
    return monedasConDeuda.map(moneda => {
      const deudaTotal = deudasActivas.filter(d => d.moneda === moneda).reduce((s, d) => s + d.pendiente, 0)
      const categoriasAhorro = new Set((ahorros ?? []).filter(a => a.moneda === moneda).map(a => a.categoria))
      const porMes: Record<string, number> = {}
      ;(allIngresos ?? []).filter(i => i.moneda === moneda && categoriasAhorro.has(i.tipo)).forEach(i => {
        const key = `${i.año}-${i.mes}`; porMes[key] = (porMes[key] ?? 0) + i.monto
      })
      ;(allEgresos ?? []).filter(e => e.moneda === moneda && categoriasAhorro.has(e.categoria)).forEach(e => {
        const key = `${e.año}-${e.mes}`; porMes[key] = (porMes[key] ?? 0) - e.monto
      })
      const mesesConDatos = Object.keys(porMes)
      const ahorroMensualProm = mesesConDatos.length > 0 ? mesesConDatos.reduce((s, k) => s + porMes[k], 0) / mesesConDatos.length : 0
      const mesesRestantes = ahorroMensualProm > 0 ? Math.ceil(deudaTotal / ahorroMensualProm) : null
      const fechaEstimada = mesesRestantes ? (() => {
        const f = new Date(); f.setMonth(f.getMonth() + mesesRestantes)
        return `${MESES[f.getMonth()]} ${f.getFullYear()}`
      })() : null
      return { moneda, deudaTotal, ahorroMensualProm, mesesRestantes, fechaEstimada, mesesConDatos: mesesConDatos.length }
    })
  }, [deudasActivas, ahorros, allIngresos, allEgresos])

  const getWidgetValue = (id: string) => {
    switch (id) {
      case 'vence_mes':       return { value: fmt(venceMes, m), sub: `${pendientes} pendientes`, trend: trendVence, trendInvert: true, trendLabel: 'vs mes anterior', color: '#F54927' }
      case 'pagado_mes':      return { value: fmt(pagadoMes, m), sub: 'del mes actual', trend: trendPagado, trendInvert: true, trendLabel: 'vs mes anterior', color: '#40B046' }
      case 'pct_ingresos':    return { value: `${pctDeudaIngresos}%`, sub: 'deudas / ingresos del mes', trend: trendPct, trendInvert: true, trendLabel: 'vs mes anterior', color: pctDeudaIngresos > 40 ? '#F54927' : pctDeudaIngresos > 25 ? '#E8A020' : '#40B046' }
      case 'deudas_activas':  return { value: String((deudas ?? []).length), sub: `Cuota fija: ${fmt(cuotaMensual, m)}`, color: '#5B3FA6' }
      case 'total_pendiente': return { value: fmt(totalPendiente, m), sub: 'Saldo total de deudas LP', color: '#D4537E' }
      case 'cuota_mensual':   return { value: fmt(cuotaMensual, m), sub: 'Comprometido cada mes', color: '#1A5E9E' }
      default: return { value: '—', sub: '', color: '#888780' }
    }
  }

  const getWidgetValueLP = (id: string): { value: string; sub: string; color: string; trend?: number; trendInvert?: boolean; trendLabel?: string } => {
    switch (id) {
      case 'deuda_total_lp':
        return { value: fmt(totalPendiente, m), sub: `${deudasActivas.length} deuda${deudasActivas.length === 1 ? '' : 's'} activa${deudasActivas.length === 1 ? '' : 's'}`, color: '#5B3FA6' }
      case 'pct_deuda_ahorros_usd':
        return pctDeudaAhorrosUSD === null
          ? { value: '—', sub: 'Tenés deuda en USD pero sin ahorro en USD registrado', color: '#F54927' }
          : { value: `${pctDeudaAhorrosUSD}%`, sub: 'deuda USD / ahorros e inversiones USD', color: pctDeudaAhorrosUSD > 100 ? '#F54927' : pctDeudaAhorrosUSD > 50 ? '#E8A020' : '#40B046' }
      case 'plazo_estimado':
        return plazoMax
          ? { value: `${plazoMax.meses} mes${plazoMax.meses === 1 ? '' : 'es'}`, sub: `Estimado: ${fechaEstimadaPago} (${plazoMax.d.nombre})`, color: '#1A5E9E' }
          : { value: '—', sub: 'Cargá una cuota mensual para estimarlo', color: '#888780' }
      case 'cuota_mensual_lp':
        return { value: fmt(cuotaMensual, m), sub: 'Comprometido cada mes', color: '#D4537E' }
      default: return { value: '—', sub: '', color: '#888780' }
    }
  }

  const changeWidget = (index: number, newId: string) => {
    if (tab === 'calendario') {
      const next = [...widgetsCal]; next[index] = newId; setWidgetsCal(next)
    } else {
      const next = [...widgetsLP]; next[index] = newId; setWidgetsLP(next)
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleToggle = async (ev: any) => {
    if (!ev.pagado) {
      if (!ev.monto) {
        await import('@/lib/queries').then(q => q.togglePagado(ev.id, true))
      } else if (ev.tipo === 'devolucion') {
        await recibirDevolucion({ id: ev.id, descripcion: ev.descripcion, monto: ev.monto, moneda: ev.moneda ?? 'ARS', dia: ev.dia, mes: ev.mes, año: ev.año })
      } else {
        await pagarEvento({ id: ev.id, descripcion: ev.descripcion, monto: ev.monto, moneda: ev.moneda ?? 'ARS', dia: ev.dia, mes: ev.mes, año: ev.año, tipo: ev.tipo })
      }
    } else {
      if (ev.tipo === 'devolucion') await descartarDevolucion(ev.id, ev.ingreso_id)
      else await despagarEvento(ev.id, ev.egreso_id)
    }
    refEventos()
  }

  const openEditEventoModal = (ev: any) => {
    setEvForm({
      descripcion: ev.descripcion ?? '', tipo: ev.tipo,
      fecha: `${ev.año}-${String(ev.mes).padStart(2, '0')}-${String(ev.dia).padStart(2, '0')}`,
      monto: ev.monto != null ? String(ev.monto) : '',
      moneda: (ev.moneda ?? 'ARS') as Moneda, recurrente: !!ev.recurrente,
      cuotas: '1', gastoFijo: !!ev.gasto_fijo, nota: ev.nota ?? '',
    })
    setModalEditEventoId(ev.id)
    setShowEvModal(true)
  }

  const handleDeleteEvento = async (id: string) => {
    if (!confirm('¿Eliminar este evento?')) return
    await deleteEvento(id); refEventos()
  }

  const handleDuplicarEvento = async (ev: any) => {
    await createEvento({
      dia: ev.dia, mes: ev.mes, año: ev.año,
      tipo: ev.tipo, descripcion: ev.descripcion,
      monto: ev.monto, moneda: ev.moneda ?? 'ARS',
      recurrente: false, pagado: false, nota: ev.nota ?? null,
    })
    refEventos()
  }

  const resetEvForm = () => setEvForm({
    descripcion: '', tipo: 'egreso',
    fecha: `${calAño}-${String(calMes + 1).padStart(2, '0')}-${String(HOY_DIA).padStart(2, '0')}`,
    monto: '', moneda: 'ARS', recurrente: false, cuotas: '1', gastoFijo: false, nota: '',
  })

  const handleSaveEvento = async () => {
    if (!evForm.descripcion || !evForm.fecha) return
    setSaving(true)
    try {
      const [añoBase, mesBase, diaBase] = evForm.fecha.split('-').map(Number)

      if (modalEditEventoId) {
        await updateEvento(modalEditEventoId, {
          dia: diaBase, mes: mesBase, año: añoBase,
          tipo: evForm.tipo as any, descripcion: evForm.descripcion,
          monto: evForm.monto ? parseFloat(evForm.monto) : undefined,
          moneda: evForm.moneda, recurrente: evForm.recurrente, gasto_fijo: evForm.gastoFijo,
          nota: evForm.nota || null,
        })
      } else if (evForm.recurrente) {
        // Genera este mes + los próximos 11 (mismo día, mismo tipo). El primero usa el monto
        // cargado (si lo hay); los siguientes arrancan sin monto para completarlos mes a mes.
        const MESES_A_GENERAR = 12
        for (let i = 0; i < MESES_A_GENERAR; i++) {
          let mes = mesBase + i
          let año = añoBase
          while (mes > 12) { mes -= 12; año++ }
          await createEvento({
            dia: diaBase, mes, año,
            tipo: evForm.tipo as any, descripcion: evForm.descripcion,
            monto: i === 0 && evForm.monto ? parseFloat(evForm.monto) : undefined,
            moneda: evForm.moneda, recurrente: true, pagado: false, gasto_fijo: evForm.gastoFijo,
            nota: i === 0 ? (evForm.nota || null) : null,
          })
        }
      } else {
        const cuotas = parseInt(evForm.cuotas) || 1
        for (let i = 0; i < cuotas; i++) {
          let mes = mesBase + i
          let año = añoBase
          while (mes > 12) { mes -= 12; año++ }
          await createEvento({
            dia: diaBase, mes, año,
            tipo: evForm.tipo as any,
            descripcion: cuotas > 1 ? `${evForm.descripcion} (${i+1}/${cuotas})` : evForm.descripcion,
            monto: evForm.monto ? parseFloat(evForm.monto) : undefined,
            moneda: evForm.moneda, recurrente: false, pagado: false, gasto_fijo: evForm.gastoFijo,
            nota: evForm.nota || null,
          })
        }
      }
      setShowEvModal(false)
      setModalEditEventoId(null)
      resetEvForm()
      refEventos()
    } catch(e) { console.error(e) } finally { setSaving(false) }
  }

  const handleSaveDeuda = async () => {
    if (!deudaForm.nombre || !deudaForm.total_original) return
    setSaving(true)
    try {
      // Si no se cargó vencimiento (alta rápida), se usa un año desde el inicio como placeholder —
      // se puede editar después con el dato real cuando se tenga.
      let fechaVenc = deudaForm.fecha_vencimiento
      if (!fechaVenc) {
        const base = deudaForm.fecha_inicio ? new Date(deudaForm.fecha_inicio + 'T00:00:00') : new Date()
        base.setFullYear(base.getFullYear() + 1)
        fechaVenc = base.toISOString().split('T')[0]
      }
      if (modalEditDeudaId) {
        const nuevoPendiente = parseFloat(deudaForm.pendiente) || 0
        await updateDeuda(modalEditDeudaId, {
          nombre: deudaForm.nombre, banco: deudaForm.banco,
          pendiente: nuevoPendiente, activa: nuevoPendiente > 0,
          cuota_mensual: parseFloat(deudaForm.cuota_mensual) || 0,
          moneda: deudaForm.moneda,
          fecha_inicio: deudaForm.fecha_inicio, fecha_vencimiento: fechaVenc,
          cuota_actual: parseInt(deudaForm.cuota_actual), cuota_total: parseInt(deudaForm.cuota_total),
          color: deudaForm.color, etiqueta: deudaForm.etiqueta || null,
        })
      } else {
        await createDeuda({
          nombre: deudaForm.nombre, banco: deudaForm.banco,
          total_original: parseFloat(deudaForm.total_original),
          pendiente: parseFloat(deudaForm.total_original),
          cuota_mensual: parseFloat(deudaForm.cuota_mensual) || 0,
          tasa_interes: 0, moneda: deudaForm.moneda,
          fecha_inicio: deudaForm.fecha_inicio, fecha_vencimiento: fechaVenc,
          cuota_actual: parseInt(deudaForm.cuota_actual) || 1, cuota_total: parseInt(deudaForm.cuota_total) || 1,
          color: deudaForm.color, activa: true, etiqueta: deudaForm.etiqueta || null,
        })
      }
      setShowDeudaModal(false); setModalEditDeudaId(null); setMostrarDetallesLP(false); refDeudas()
    } catch(e) { console.error(e) } finally { setSaving(false) }
  }

  const openEditDeudaModal = (d: any) => {
    setDeudaForm({
      nombre: d.nombre ?? '', banco: d.banco ?? '',
      total_original: String(d.total_original ?? ''), pendiente: String(d.pendiente ?? ''), cuota_mensual: String(d.cuota_mensual ?? ''),
      fecha_inicio: d.fecha_inicio ?? new Date().toISOString().split('T')[0],
      fecha_vencimiento: d.fecha_vencimiento ?? '',
      cuota_actual: String(d.cuota_actual ?? '1'), cuota_total: String(d.cuota_total ?? '1'),
      moneda: d.moneda ?? 'ARS', color: d.color ?? '#5B3FA6', etiqueta: d.etiqueta ?? '',
    })
    setModalEditDeudaId(d.id)
    setMostrarDetallesLP(true)
    setShowDeudaModal(true)
  }

  const handleDeleteDeuda = async (id: string) => {
    if (!confirm('¿Eliminar esta deuda?')) return
    await deleteDeuda(id); refDeudas()
  }

  // ── Registrar pago de una Deuda LP (modal con monto y descripción editables) ──
  const [showPagoModal, setShowPagoModal] = useState<any>(null) // la deuda sobre la que se está pagando
  const [pagoForm, setPagoForm] = useState({ monto: '', descripcion: '' })

  const abrirPagoLP = (d: any) => {
    setShowPagoModal(d)
    setVinculando(false)
    setBuscarVincular('')
    setPagoForm({
      monto: String(d.cuota_mensual > 0 ? d.cuota_mensual : d.pendiente),
      descripcion: `Cuota ${d.cuota_actual}/${d.cuota_total} — ${d.nombre}`,
    })
  }

  // Cada Deuda LP tiene su propia etiqueta 1 a 1 (se crea sola al crear la deuda) — mismo
  // mecanismo que ya usan Proyecto y Ahorro. Es lo que permite ver sus "movimientos" vinculados.
  const etiquetaDeDeuda = (d: any) => (etiquetas ?? []).find(e => e.tipo === 'deuda' && e.deuda_id === d.id)

  // Al llegar a $0 se archiva sola (mismo patrón que Proyecto/Ahorro/Persona) — deja de aparecer
  // en la lista activa, pero sigue accesible desde "Ver archivadas" para consultarla. Si el saldo
  // vuelve a subir (se corrigió un pago, se eliminó un movimiento, etc.) se reactiva sola también.
  const pendienteYActiva = (nuevoPendiente: number) => ({ pendiente: Math.max(0, nuevoPendiente), activa: nuevoPendiente > 0 })

  const movimientosDeDeuda = (d: any): (Egreso & { _tipo: 'egreso' })[] => {
    const et = etiquetaDeDeuda(d)
    if (!et) return []
    const ids = new Set((egresoEtiquetas ?? []).filter(r => r.etiqueta_id === et.id).map(r => r.egreso_id))
    return (allEgresos ?? [])
      .filter(e => ids.has(e.id))
      .map(e => ({ ...e, _tipo: 'egreso' as const }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
  }

  // Descuenta del saldo, avanza la cuota, y genera el Egreso correspondiente — mismo criterio
  // que el pago de un Vencimiento (#8) — pero acá el monto y la descripción los define el usuario.
  const handlePagarCuotaLP = async () => {
    const d = showPagoModal
    const monto = parseFloat(pagoForm.monto)
    if (!d || !monto || monto <= 0) return
    setPagandoCuotaId(d.id)
    try {
      const egreso = await createEgreso({
        categoria: 'otro', descripcion: pagoForm.descripcion || `Pago — ${d.nombre}`,
        monto, moneda: d.moneda as Moneda, fecha: new Date().toISOString().split('T')[0],
        quien: 'ambos', recurrente: false, etiqueta: d.etiqueta ?? null,
      })
      const et = etiquetaDeDeuda(d)
      if (et) await agregarEtiquetaAEgreso(egreso.id, et.id)
      await updateDeuda(d.id, {
        ...pendienteYActiva(d.pendiente - monto),
        cuota_actual: Math.min(d.cuota_actual + 1, d.cuota_total),
      })
      setShowPagoModal(null)
      refDeudas(); refetchEgresoEtiquetas()
    } catch (e) { console.error(e) } finally { setPagandoCuotaId(null) }
  }

  // Vincula un egreso YA existente (ej. la pata en USD de una compra de dólares) como pago de
  // esta deuda, en vez de crear uno nuevo — mismo criterio de descuento de saldo que un pago nuevo.
  const handleVincularExistente = async (d: any, egreso: Egreso) => {
    const et = etiquetaDeDeuda(d)
    if (!et) return
    setPagandoCuotaId(d.id)
    try {
      await agregarEtiquetaAEgreso(egreso.id, et.id)
      await updateDeuda(d.id, {
        ...pendienteYActiva(d.pendiente - egreso.monto),
        cuota_actual: Math.min(d.cuota_actual + 1, d.cuota_total),
      })
      setShowPagoModal(null)
      refDeudas(); refetchEgresoEtiquetas()
    } catch (e) { console.error(e) } finally { setPagandoCuotaId(null) }
  }

  // Duplicar un movimiento vinculado: crea otro pago igual (hoy) y descuenta saldo de nuevo.
  const handleDuplicarMovimiento = async (d: any, mov: Egreso) => {
    const et = etiquetaDeDeuda(d)
    if (!et) return
    const egreso = await createEgreso({
      categoria: mov.categoria, descripcion: mov.descripcion, monto: mov.monto,
      moneda: mov.moneda as Moneda, fecha: new Date().toISOString().split('T')[0],
      quien: mov.quien as Quien, recurrente: false, etiqueta: mov.etiqueta ?? null,
    })
    await agregarEtiquetaAEgreso(egreso.id, et.id)
    await updateDeuda(d.id, pendienteYActiva(d.pendiente - mov.monto))
    refDeudas(); refetchEgresoEtiquetas()
  }

  // Eliminar un movimiento vinculado: borra el egreso y le devuelve ese monto al saldo pendiente.
  const handleEliminarMovimiento = async (d: any, mov: Egreso) => {
    if (!confirm(`¿Eliminar este pago de ${fmtFull(mov.monto, mov.moneda as Moneda)}? Vuelve a sumarse al saldo pendiente.`)) return
    await deleteEgreso(mov.id)
    await updateDeuda(d.id, pendienteYActiva(d.pendiente + mov.monto))
    refDeudas(); refetchEgresoEtiquetas()
  }

  // Editar monto/descripción/fecha de un movimiento vinculado: ajusta el pendiente por la
  // diferencia entre el monto viejo y el nuevo.
  const handleGuardarEdicionMovimiento = async (d: any, mov: Egreso, nuevo: { descripcion: string; monto: number; fecha: string }) => {
    await updateEgreso(mov.id, { descripcion: nuevo.descripcion, monto: nuevo.monto, fecha: nuevo.fecha })
    const delta = nuevo.monto - mov.monto
    if (delta !== 0) await updateDeuda(d.id, pendienteYActiva(d.pendiente - delta))
    setEditandoMovId(null)
    refDeudas(); refetchEgresoEtiquetas()
  }

  const navMes = (dir: number) => {
    let mes = calMes + dir, año = calAño
    if (mes < 0) { mes = 11; año-- } else if (mes > 11) { mes = 0; año++ }
    setCalMes(mes); setCalAño(año)
  }

  if ((ld && !deudas) || (le && !eventos)) return <LoadingSpinner />

  return (
    <div>
      <PageHeader title="Deudas"
        action={
          <div className="flex gap-2 flex-wrap justify-end">
            <button
              onClick={() => setEditingWidgets(v => !v)}
              className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${editingWidgets ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
              {editingWidgets ? '✓ Listo' : '⚙ Personalizar widgets'}
            </button>
            <button className="btn-ghost text-sm hidden md:inline-block" onClick={() => { setModalEditEventoId(null); resetEvForm(); setShowEvModal(true) }}>+ Vencimiento</button>
            <button className="btn-primary hidden md:inline-block" onClick={() => { setModalEditDeudaId(null); setMostrarDetallesLP(false); setDeudaForm({ nombre:'', banco:'', total_original:'', pendiente:'', cuota_mensual:'', fecha_inicio:new Date().toISOString().split('T')[0], fecha_vencimiento:'', cuota_actual:'1', cuota_total:'1', moneda:'ARS', color:'#5B3FA6', etiqueta:'' }); setShowDeudaModal(true) }}>+ Deuda largo plazo</button>
          </div>
        } />

      {/* ── StatCards personalizables (según la tab activa) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {(tab === 'calendario' ? widgetsCal : widgetsLP).map((widgetId, index) => {
          const options = tab === 'calendario' ? WIDGET_OPTIONS_DEU : WIDGET_OPTIONS_LP
          const opt = options.find(o => o.id === widgetId)!
          const wv  = tab === 'calendario' ? getWidgetValue(widgetId) : getWidgetValueLP(widgetId)
          return (
            <div key={index} className="relative">
              {editingWidgets && (
                <div className="absolute -top-2 -right-2 z-10">
                  <select
                    value={widgetId}
                    onChange={e => changeWidget(index, e.target.value)}
                    className="text-[10px] bg-slate-900 text-white rounded-lg px-2 py-1 border-none cursor-pointer shadow-lg">
                    {options.map(o => <option key={o.id} value={o.id}>{o.icon} {o.label}</option>)}
                  </select>
                </div>
              )}
              <div className={editingWidgets ? 'ring-2 ring-blue-400 ring-offset-1 rounded-2xl' : ''}>
                <StatCard label={opt.label} value={wv.value} sub={wv.sub} color={wv.color}
                  trend={'trend' in wv ? wv.trend : undefined} trendInvert={'trendInvert' in wv ? wv.trendInvert : undefined}
                  trendLabel={'trendLabel' in wv ? wv.trendLabel : undefined} />
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <Tabs tabs={[{value:'calendario',label:'Calendario'},{value:'largo',label:'Largo plazo'}]} value={tab} onChange={v => setTab(v as any)} />
        {tab === 'calendario' && (
          <div className="flex items-center gap-3 md:gap-5 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm flex-wrap w-full sm:w-auto">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Total a pagar:</span>
              <span className="font-mono font-bold text-red-600">{oc(fmt(venceMes, m))}</span>
            </div>
            <div className="w-px h-4 bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Pagado:</span>
              <span className="font-mono font-bold text-emerald-600">{oc(fmt(pagadoMes, m))}</span>
            </div>
            <div className="w-px h-4 bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Restante:</span>
              <span className="font-mono font-bold text-red-600">{oc(fmt(Math.max(0, venceMes - pagadoMes), m))}</span>
            </div>
            {devolucionesPendientes > 0 && <>
              <div className="w-px h-4 bg-slate-200" />
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Te deben:</span>
                <span className="font-mono font-bold text-emerald-600">{oc('+'+fmt(devolucionesPendientes, m))}</span>
              </div>
            </>}
          </div>
        )}
      </div>

      {/* ── Calendario ── */}
      {tab === 'calendario' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <button onClick={() => navMes(-1)} className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer">‹</button>
                <span className="font-semibold text-slate-900 text-sm">{MESES[calMes]} {calAño}</span>
                <button onClick={() => navMes(1)} className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer">›</button>
              </div>
              <button onClick={() => setMostrarPagados(p => !p)}
                className={`px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer transition-all ${mostrarPagados ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}>
                {mostrarPagados ? 'Ocultar pagados' : 'Ver pagados'}
              </button>
            </div>

            {/* + Nuevo vencimiento inline trigger */}
            <button onClick={() => { setModalEditEventoId(null); resetEvForm(); setShowEvModal(true) }}
              className="w-full text-left text-xs font-semibold text-red-500 hover:text-red-700 border-none bg-transparent cursor-pointer flex items-center gap-1.5 py-2 mb-2 border-b border-slate-100 transition-colors">
              <span className="text-sm font-bold">+</span> Nuevo vencimiento
            </button>

            {eventosFiltrados.length === 0 ? (
              <div className="text-slate-400 text-xs text-center py-6">Sin pendientes este mes</div>
            ) : eventosFiltrados.sort((a, b) => a.dia - b.dia).map((ev, rowIdx) => {
              const catInfo = getCatInfo(ev.tipo, categoriasEventoCustom ?? undefined)
              const bg = rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
              return (
                <div key={ev.id} className={`group flex items-center gap-3 px-2 py-2.5 rounded-lg ${bg} ${ev.pagado ? 'opacity-50' : ''}`}>
                  {/* Día badge */}
                  <div className="w-9 h-9 rounded-lg flex flex-col items-center justify-center flex-shrink-0" style={{ background: catInfo.color + '18' }}>
                    <span className="text-sm font-bold font-mono leading-none" style={{ color: catInfo.color }}>{ev.dia}</span>
                    <span className="text-[8px] font-bold uppercase" style={{ color: catInfo.color }}>{MESES_CORTOS[calMes]}</span>
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium text-slate-700 truncate ${ev.pagado ? 'line-through' : ''}`}>{ev.descripcion}</div>
                    {ev.nota && <div className="text-slate-400 text-xs truncate">{ev.nota}</div>}
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: catInfo.color + '15', color: catInfo.color }}>{catInfo.label}</span>
                      {ev.gasto_fijo && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-purple-50 text-purple-700">Gasto fijo</span>}
                    </div>
                  </div>
                  {/* Monto */}
                  <div className={`text-sm font-mono font-bold flex-shrink-0 ${ev.tipo === 'devolucion' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {ev.monto != null ? oc((ev.tipo === 'devolucion' ? '+' : '') + fmtFull(ev.monto, 'ARS')) : '—'}
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => openEditEventoModal(ev)} className="text-slate-400 hover:text-blue-600 border-none bg-transparent cursor-pointer px-1 text-sm" title="Editar">✎</button>
                    <button onClick={() => handleDuplicarEvento(ev)} className="text-slate-400 hover:text-emerald-600 border-none bg-transparent cursor-pointer px-1 text-sm" title="Duplicar">⧉</button>
                    <button onClick={() => handleDeleteEvento(ev.id)} className="text-slate-300 hover:text-red-500 border-none bg-transparent cursor-pointer px-1 text-sm" title="Eliminar">✕</button>
                  </div>
                  {/* Checkbox */}
                  <button onClick={() => handleToggle(ev)}
                    className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 cursor-pointer transition-all ${ev.pagado ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-transparent'}`}>
                    {ev.pagado && <span className="text-[10px]">✓</span>}
                  </button>
                </div>
              )
            })}
          </Card>

          {/* Calendario visual */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button onClick={() => navMes(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer">‹</button>
                <span className="font-semibold text-slate-900 min-w-[160px] text-center">{MESES[calMes]} {calAño}</span>
                <button onClick={() => navMes(1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 bg-transparent cursor-pointer">›</button>
              </div>
              <div className="text-xs text-slate-400">{pctDeudaIngresos}% de tus ingresos</div>
            </div>
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => (
                <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({length: offsetLunes}).map((_, i) => <div key={`e${i}`} className="min-h-[52px] md:min-h-[72px]" />)}
              {Array.from({length: diasEnMes}).map((_, i) => {
                const dia = i + 1
                const isHoy = dia === HOY_DIA && calMes === HOY_MES && calAño === HOY_AÑO
                const isPast = new Date(calAño, calMes, dia) < new Date(HOY_AÑO, HOY_MES, HOY_DIA)
                const dayEvs = eventosPorDia[dia] ?? []
                const visible = dayEvs.slice(0, 3)
                const extra = dayEvs.length - 3
                return (
                  <div key={dia} className={`min-h-[52px] md:min-h-[72px] rounded-lg p-1 md:p-1.5 border transition-all ${isHoy ? 'bg-blue-50 border-blue-200' : 'border-transparent'} ${dayEvs.length > 0 ? 'hover:bg-slate-50 cursor-pointer' : ''} ${isPast && !isHoy ? 'opacity-50' : ''}`}>
                    <div className={`text-xs font-bold mb-1 ${isHoy ? 'text-blue-700' : 'text-slate-500'}`}>
                      {dia}{isHoy && <span className="ml-1 text-[8px] bg-blue-700 text-white rounded px-1">hoy</span>}
                    </div>
                    {visible.map(ev => {
                      const catInfo = getCatInfo(ev.tipo, categoriasEventoCustom ?? undefined)
                      return (
                        <div key={ev.id} onClick={() => handleToggle(ev)}
                          className={`text-[9px] font-medium px-1 py-0.5 rounded mb-0.5 truncate cursor-pointer transition-opacity ${ev.pagado ? 'opacity-40 line-through' : ''}`}
                          style={{ background: catInfo.color + '18', color: catInfo.color }}>
                          {ev.descripcion}
                        </div>
                      )
                    })}
                    {extra > 0 && <div className="text-[9px] text-slate-400">+{extra} más</div>}
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ── Largo plazo ── */}
      {tab === 'largo' && (
        <div>
          {detalleDeudaId ? (() => {
            const d = (deudas ?? []).find(x => x.id === detalleDeudaId)
            if (!d) return (
              <button onClick={() => setDetalleDeudaId(null)} className="text-sm text-blue-700 underline border-none bg-transparent cursor-pointer">‹ Volver</button>
            )
            const movs = movimientosDeDeuda(d)
            const pagado = d.total_original - d.pendiente
            const pct    = Math.round((pagado / d.total_original) * 100)
            return (
              <div>
                <button onClick={() => setDetalleDeudaId(null)} className="text-sm text-slate-500 hover:text-slate-700 mb-4 border-none bg-transparent cursor-pointer flex items-center gap-1">‹ Volver a Largo plazo</button>

                <Card className="mb-5">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="text-xl font-semibold text-slate-900">{d.nombre}</div>
                      {d.banco && <div className="text-slate-400 text-sm mt-0.5">{d.banco}</div>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openEditDeudaModal(d)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:border-slate-300 cursor-pointer bg-white">Editar</button>
                      {d.pendiente > 0 && (
                        <button onClick={() => abrirPagoLP(d)} className="text-xs px-3 py-1.5 rounded-lg border-none text-white cursor-pointer" style={{ background: d.color }}>Registrar pago</button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Pendiente</div>
                      <div className="text-lg font-bold font-mono" style={{ color: d.color }}>{oc(fmtFull(d.pendiente, d.moneda as Moneda))}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Pagado</div>
                      <div className="text-lg font-bold font-mono text-emerald-600">{oc(fmtFull(pagado, d.moneda as Moneda))}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Cuotas</div>
                      <div className="text-lg font-bold font-mono text-slate-700">{d.cuota_actual} / {d.cuota_total}</div>
                    </div>
                  </div>
                  <ProgressBar value={pct} color={d.color} height={6} />
                  {d.cuota_mensual > 0 && d.pendiente > 0 && (
                    <div className="text-xs text-slate-400 mt-2">
                      Estimado: {Math.ceil(d.pendiente / d.cuota_mensual)} mes{Math.ceil(d.pendiente / d.cuota_mensual) === 1 ? '' : 'es'} más para terminar de pagar
                    </div>
                  )}
                </Card>

                <Card>
                  <div className="text-slate-900 font-semibold text-[15px] mb-4">Movimientos ({movs.length})</div>
                  {movs.length === 0 ? (
                    <div className="text-center text-slate-400 text-sm py-6">Todavía no hay pagos registrados para esta deuda.</div>
                  ) : movs.map(mov => (
                    editandoMovId === mov.id ? (
                      <div key={mov.id} className="flex items-center gap-2 px-2 py-2 bg-blue-50 rounded-lg mb-1 flex-wrap">
                        <input value={movForm.descripcion} onChange={e => setMovForm(p => ({ ...p, descripcion: e.target.value }))} className="input-field py-1 text-xs flex-1" placeholder="Descripción" />
                        <MontoInput value={movForm.monto} onChange={raw => setMovForm(p => ({ ...p, monto: raw }))} className="w-32 text-right" placeholder="Monto" />
                        <FechaInput value={movForm.fecha} onChange={iso => setMovForm(p => ({ ...p, fecha: iso }))} className="w-28" />
                        <button onClick={() => handleGuardarEdicionMovimiento(d, mov, { descripcion: movForm.descripcion, monto: parseFloat(movForm.monto) || 0, fecha: movForm.fecha })}
                          className="text-xs bg-blue-700 text-white px-2 py-1 rounded-lg border-none cursor-pointer">✓</button>
                        <button onClick={() => setEditandoMovId(null)} className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded-lg border-none cursor-pointer">✕</button>
                      </div>
                    ) : (
                      <div key={mov.id} className="group flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-700 truncate">{mov.descripcion}</div>
                          <div className="text-xs text-slate-400">{fmtDate(mov.fecha)}</div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="font-mono font-bold text-sm text-red-600">{oc('-'+fmtFull(mov.monto, mov.moneda as Moneda))}</span>
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditandoMovId(mov.id); setMovForm({ descripcion: mov.descripcion, monto: String(mov.monto), fecha: mov.fecha }) }} className="text-slate-400 hover:text-blue-600 border-none bg-transparent cursor-pointer px-1 text-sm" title="Editar">✎</button>
                            <button onClick={() => handleDuplicarMovimiento(d, mov)} className="text-slate-400 hover:text-emerald-600 border-none bg-transparent cursor-pointer px-1 text-sm" title="Duplicar">⧉</button>
                            <button onClick={() => handleEliminarMovimiento(d, mov)} className="text-slate-300 hover:text-red-500 border-none bg-transparent cursor-pointer px-1 text-sm" title="Eliminar">✕</button>
                          </div>
                        </div>
                      </div>
                    )
                  ))}
                </Card>
              </div>
            )
          })() : (deudas ?? []).length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <div className="text-4xl mb-3">📋</div>
              <div className="font-semibold text-slate-600 mb-1">Sin deudas de largo plazo</div>
              <div className="text-sm mb-4">Agregá préstamos, créditos o cuotas fijas.</div>
              <button onClick={() => { setModalEditDeudaId(null); setMostrarDetallesLP(false); setDeudaForm({ nombre:'', banco:'', total_original:'', pendiente:'', cuota_mensual:'', fecha_inicio:new Date().toISOString().split('T')[0], fecha_vencimiento:'', cuota_actual:'1', cuota_total:'1', moneda:'ARS', color:'#5B3FA6', etiqueta:'' }); setShowDeudaModal(true) }} className="btn-primary hidden md:inline-block">+ Nueva deuda LP</button>
            </div>
          ) : (
            <>
            <div className="flex justify-end mb-3">
              <button onClick={() => setMostrarArchivadas(p => !p)}
                className={`px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer transition-all ${mostrarArchivadas ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}>
                {mostrarArchivadas ? 'Ocultar archivadas' : 'Ver archivadas'}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {(deudas ?? []).filter(d => mostrarArchivadas || d.activa !== false).map(d => {
                const pagado = d.total_original - d.pendiente
                const pct    = Math.round((pagado / d.total_original) * 100)
                const isExp  = expanded[d.id]
                return (
                  <Card key={d.id} className={`group ${d.activa === false ? 'opacity-60' : ''}`}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <div onClick={() => openEditDeudaModal(d)} className="text-base font-semibold text-slate-900 truncate cursor-pointer hover:underline hover:font-bold">{d.nombre}</div>
                          {d.activa === false && <span className="flex-shrink-0 text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Archivada — pagada</span>}
                          {d.etiqueta && <span className="flex-shrink-0 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{d.etiqueta}</span>}
                        </div>
                        {d.banco && <div className="text-slate-400 text-xs mt-0.5">{d.banco}</div>}
                      </div>
                      <div className="flex items-start gap-2 flex-shrink-0 ml-3">
                        <div className="text-right">
                          <div className="text-lg font-bold font-mono" style={{ color: d.color }}>{oc(fmtFull(d.pendiente, d.moneda as Moneda))}</div>
                          <div className="text-slate-400 text-xs">pendiente</div>
                        </div>
                        <div className="flex gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity select-none">
                          <button onClick={() => openEditDeudaModal(d)} className="text-slate-400 hover:text-blue-600 border-none bg-transparent cursor-pointer px-1 text-sm">✎</button>
                          <button onClick={() => handleDeleteDeuda(d.id)} className="text-slate-300 hover:text-red-500 border-none bg-transparent cursor-pointer px-1 text-sm">✕</button>
                        </div>
                      </div>
                    </div>
                    <ProgressBar value={pct} color={d.color} height={6} />
                    <div className="flex justify-between mt-1.5 mb-3">
                      <span className="text-slate-400 text-xs">Pagado: {oc(fmtFull(pagado, d.moneda as Moneda))}</span>
                      <span className="text-xs font-bold" style={{ color: d.color }}>{pct}%</span>
                    </div>
                    {/* Cuotas como cuadraditos */}
                    <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                      <div className="flex-1">
                        <div className="label mb-1.5">Cuotas</div>
                        <div className="flex flex-wrap gap-1">
                          {Array.from({length: Math.min(d.cuota_total, 24)}).map((_, i) => (
                            <div key={i}
                              className={`w-5 h-5 rounded text-[8px] flex items-center justify-center font-bold transition-all ${i < d.cuota_actual ? 'text-white' : 'text-slate-400 bg-slate-100'}`}
                              style={i < d.cuota_actual ? { background: d.color } : {}}>
                              {i + 1}
                            </div>
                          ))}
                          {d.cuota_total > 24 && <span className="text-[9px] text-slate-400">+{d.cuota_total - 24}</span>}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">{d.cuota_actual} de {d.cuota_total} · {oc(fmtFull(d.cuota_mensual, d.moneda as Moneda))}/mes</div>
                        {d.cuota_mensual > 0 && d.pendiente > 0 && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Estimado: {Math.ceil(d.pendiente / d.cuota_mensual)} mes{Math.ceil(d.pendiente / d.cuota_mensual) === 1 ? '' : 'es'} más para terminar de pagar
                          </div>
                        )}
                      </div>
                    </div>
                    {d.pendiente > 0 && (
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => abrirPagoLP(d)}
                          className="flex-1 py-2 rounded-lg border text-xs font-semibold cursor-pointer transition-all"
                          style={{ borderColor: d.color, color: d.color, background: d.color + '10' }}>
                          Registrar pago
                        </button>
                        <button onClick={() => setDetalleDeudaId(d.id)}
                          className="flex-1 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-500 hover:border-slate-300 cursor-pointer transition-all bg-white">
                          Más info
                        </button>
                      </div>
                    )}
                    {d.pendiente <= 0 && (
                      <button onClick={() => setDetalleDeudaId(d.id)}
                        className="w-full mt-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-500 hover:border-slate-300 cursor-pointer transition-all bg-white">
                        Más info
                      </button>
                    )}
                  </Card>
                )
              })}
            </div>
            </>
          )}

          {proyeccionesPago.length > 0 && (
            <div className="mt-6">
              <div className="mb-3">
                <div className="text-slate-900 font-semibold text-[15px]">Proyección de pago</div>
                <div className="text-slate-400 text-xs mt-0.5">Cuándo terminarías de pagar, según lo que ahorrás por mes en cada moneda</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {proyeccionesPago.map(p => (
                  <div key={p.moneda} className="bg-white border border-slate-200 rounded-2xl p-5">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">{p.moneda}</div>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-xs text-slate-400">Deuda pendiente</span>
                      <span className="font-mono font-bold text-slate-900">{oc(fmtFull(p.deudaTotal, p.moneda as Moneda))}</span>
                    </div>
                    <div className="flex items-baseline justify-between mb-3">
                      <span className="text-xs text-slate-400">Ahorro promedio/mes</span>
                      <span className="font-mono font-bold text-emerald-600">{p.mesesConDatos > 0 ? oc(fmtFull(p.ahorroMensualProm, p.moneda as Moneda)) : '—'}</span>
                    </div>
                    <div className="pt-3 border-t border-slate-100">
                      {p.mesesRestantes ? (
                        <>
                          <div className="text-lg font-bold text-blue-700">{p.mesesRestantes} mes{p.mesesRestantes === 1 ? '' : 'es'}</div>
                          <div className="text-xs text-slate-400 mt-0.5">Estimado: {p.fechaEstimada}</div>
                        </>
                      ) : (
                        <div className="text-xs text-slate-400">
                          {p.mesesConDatos === 0
                            ? `Todavía no hay movimientos etiquetados a un Ahorro en ${p.moneda} para estimar un ritmo de ahorro.`
                            : `No estás ahorrando en ${p.moneda} en promedio — a este ritmo no se proyecta un pago.`}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Gráfico anual % deuda vs ingresos (solo Calendario) ── */}
      {tab === 'calendario' && (
      <div className="mt-6">
        <div className="mb-3">
          <div className="text-slate-900 font-semibold text-[15px]">Vencimientos vs Ingresos — {calAño}</div>
          <div className="text-slate-400 text-xs mt-0.5">Qué % de tus ingresos del mes se va en pago de deudas</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <p className="text-slate-400 text-xs mb-4">% de vencimientos del mes (pagados + pendientes) sobre tus ingresos de ese mes</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartAnual} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v+'%'} domain={[0, 100]} />
                <Tooltip contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null
                    const row = payload[0].payload as { month: string; ingresos: number; deudas: number; pct: number }
                    return (
                      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, padding: '8px 10px' }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
                        <div>Vencimientos: {oc(fmt(row.deudas, m))}</div>
                        <div>Ingresos: {oc(fmt(row.ingresos, m))}</div>
                        <div style={{ fontWeight: 700, color: '#F54927' }}>{row.pct}% de tus ingresos</div>
                      </div>
                    )
                  }} />
                <Bar dataKey="pct" name="% vencimientos/ingresos" radius={0} maxBarSize={40}
                  fill="#F54927"
                  label={{ position: 'top', fontSize: 10, fill: '#94a3b8', formatter: (v: number) => v > 0 ? `${v}%` : '' }} />
              </BarChart>
            </ResponsiveContainer>
        </div>
      </div>
      )}

      {/* ── Modal nuevo/editar vencimiento ── */}
      <Modal open={showEvModal} onClose={() => { setShowEvModal(false); setModalEditEventoId(null) }} title={modalEditEventoId ? 'Editar vencimiento' : 'Nuevo vencimiento'}>
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Descripción</FieldLabel>
            <AutocompleteInput value={evForm.descripcion} onChange={v => setEvForm(p => ({ ...p, descripcion: v }))}
              suggestions={descripcionesEventosQ.data ?? []} placeholder="Ej: Pago tarjeta Galicia" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Categoría</FieldLabel>
              <CategoriaSelector modulo="eventos" value={evForm.tipo} onChange={v => setEvForm(p => ({ ...p, tipo: v }))}
                categorias={categoriasEventoCustom ?? []} categoriasBase={CATEGORIAS_EVENTO} onCategoriasChange={refetchCatsEvento} />
            </div>
            <div><FieldLabel>Fecha</FieldLabel>
              <FechaInput value={evForm.fecha} onChange={iso => setEvForm(p => ({ ...p, fecha: iso }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Monto</FieldLabel>
              <MontoInput value={evForm.monto}
                onChange={raw => setEvForm(p => ({ ...p, monto: raw }))}
                placeholder="0" />
            </div>
            <div><FieldLabel>Moneda</FieldLabel>
              <select value={evForm.moneda} onChange={e => setEvForm(p => ({ ...p, moneda: e.target.value as Moneda }))} className="input-field">
                {monedasPalette.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div><FieldLabel>Nota <span className="text-slate-400 font-normal normal-case">(opcional — detalle puntual, no se usa para autocompletar como la Descripción)</span></FieldLabel>
            <input value={evForm.nota} onChange={e => setEvForm(p => ({ ...p, nota: e.target.value }))}
              placeholder="Ej: Reintegro de Juan por el viaje" className="input-field" />
          </div>
          {!modalEditEventoId && !evForm.recurrente && (
            <div><FieldLabel>Cantidad de cuotas</FieldLabel>
              <div className="flex items-center gap-3">
                <input type="number" min="1" max="60" value={evForm.cuotas}
                  onChange={e => setEvForm(p => ({ ...p, cuotas: e.target.value }))}
                  className="input-field w-24" />
                {parseInt(evForm.cuotas) > 1 && (
                  <span className="text-slate-400 text-xs">
                    Se crearán {evForm.cuotas} vencimientos mensuales a partir de la fecha elegida
                  </span>
                )}
              </div>
            </div>
          )}
          <div className="flex gap-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={evForm.recurrente} onChange={e => setEvForm(p => ({ ...p, recurrente: e.target.checked }))} className="w-4 h-4 accent-blue-700" />
              <span className="text-slate-600 text-sm">Recurrente</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={evForm.gastoFijo} onChange={e => setEvForm(p => ({ ...p, gastoFijo: e.target.checked }))} className="w-4 h-4 accent-purple-700" />
              <span className="text-slate-600 text-sm">Gasto fijo</span>
            </label>
          </div>
          {!modalEditEventoId && evForm.recurrente && (
            <p className="text-slate-400 text-xs -mt-2">
              Se van a crear los próximos 12 meses (mismo día). {evForm.monto ? 'Este mes con el monto cargado, ' : ''}los demás sin monto, para que los completes mes a mes cuando sepas cuánto es.
            </p>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={() => { setShowEvModal(false); setModalEditEventoId(null) }} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={handleSaveEvento} disabled={saving || !evForm.descripcion}
              className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Guardando...' : modalEditEventoId ? 'Guardar cambios' : 'Guardar'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Modal nueva deuda LP ── */}
      <Modal open={showDeudaModal} onClose={() => { setShowDeudaModal(false); setModalEditDeudaId(null); setMostrarDetallesLP(false) }} title={modalEditDeudaId ? 'Editar deuda' : 'Nueva deuda — Largo plazo'}>
        <div className="flex flex-col gap-4">
          <div><FieldLabel>Nombre</FieldLabel>
            <input value={deudaForm.nombre} onChange={e => setDeudaForm(p => ({ ...p, nombre: e.target.value }))}
              placeholder="Ej: Crédito auto" className="input-field" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Monto total{modalEditDeudaId ? ' (no editable)' : ''}</FieldLabel>
              <MontoInput value={deudaForm.total_original} disabled={!!modalEditDeudaId}
                onChange={raw => setDeudaForm(p => ({ ...p, total_original: raw }))} placeholder="0" className="disabled:opacity-50 disabled:cursor-not-allowed" />
            </div>
            <div><FieldLabel>Moneda</FieldLabel>
              <select value={deudaForm.moneda} onChange={e => setDeudaForm(p => ({ ...p, moneda: e.target.value as Moneda }))} className="input-field">
                {monedasPalette.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {!modalEditDeudaId && !mostrarDetallesLP && (
            <button type="button" onClick={() => setMostrarDetallesLP(true)}
              className="text-xs text-blue-700 font-semibold border-none bg-transparent cursor-pointer text-left underline w-fit">
              + Agregar más detalles (opcional — banco, cuota mensual, vencimiento, etc.)
            </button>
          )}

          {(mostrarDetallesLP || !!modalEditDeudaId) && <>
            <div><FieldLabel>Descripción / Banco</FieldLabel>
              <input value={deudaForm.banco} onChange={e => setDeudaForm(p => ({ ...p, banco: e.target.value }))}
                placeholder="Ej: Banco Galicia" className="input-field" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><FieldLabel>Cuota mensual</FieldLabel>
                <MontoInput value={deudaForm.cuota_mensual}
                  onChange={raw => setDeudaForm(p => ({ ...p, cuota_mensual: raw }))} placeholder="0" />
              </div>
              {modalEditDeudaId && (
                <div><FieldLabel>Pendiente <span className="text-slate-400 font-normal normal-case">(ajuste manual)</span></FieldLabel>
                  <MontoInput value={deudaForm.pendiente}
                    onChange={raw => setDeudaForm(p => ({ ...p, pendiente: raw }))} placeholder="0" />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><FieldLabel>Cuota actual</FieldLabel>
                <input type="number" value={deudaForm.cuota_actual}
                  onChange={e => setDeudaForm(p => ({ ...p, cuota_actual: e.target.value }))} className="input-field" />
              </div>
              <div><FieldLabel>Total cuotas</FieldLabel>
                <input type="number" value={deudaForm.cuota_total}
                  onChange={e => setDeudaForm(p => ({ ...p, cuota_total: e.target.value }))} className="input-field" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><FieldLabel>Fecha inicio</FieldLabel>
                <FechaInput value={deudaForm.fecha_inicio}
                  onChange={iso => setDeudaForm(p => ({ ...p, fecha_inicio: iso }))} />
              </div>
              <div><FieldLabel>Fecha vencimiento <span className="text-slate-400 font-normal normal-case">(opcional)</span></FieldLabel>
                <FechaInput value={deudaForm.fecha_vencimiento}
                  onChange={iso => setDeudaForm(p => ({ ...p, fecha_vencimiento: iso }))} />
              </div>
            </div>
            <div><FieldLabel>Color</FieldLabel>
              <div className="flex gap-2 mt-1">
                {['#5B3FA6','#F54927','#1D9E75','#40B046','#1A5E9E','#E8A020','#D4537E'].map(c => (
                  <button key={c} onClick={() => setDeudaForm(p => ({ ...p, color: c }))}
                    className={`w-7 h-7 rounded-full border-2 cursor-pointer transition-all ${deudaForm.color === c ? 'border-slate-900 scale-110' : 'border-transparent'}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
            <div>
              <FieldLabel>Etiqueta <span className="text-slate-400 font-normal normal-case">(opcional, para agrupar o filtrar después)</span></FieldLabel>
              <AutocompleteInput value={deudaForm.etiqueta} onChange={v => setDeudaForm(p => ({ ...p, etiqueta: v }))} suggestions={etiquetasQ.data ?? []} placeholder="Ej: Viaje Brasil" />
            </div>
          </>}

          <div className="flex gap-3 pt-2">
            <button onClick={() => { setShowDeudaModal(false); setModalEditDeudaId(null); setMostrarDetallesLP(false) }} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={handleSaveDeuda} disabled={saving || !deudaForm.nombre || !deudaForm.total_original}
              className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Guardando...' : modalEditDeudaId ? 'Guardar cambios' : 'Guardar'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Modal registrar pago de Deuda LP ── */}
      <Modal open={!!showPagoModal} onClose={() => setShowPagoModal(null)} title={`Registrar pago — ${showPagoModal?.nombre ?? ''}`}>
        <div className="flex flex-col gap-4">
          <p className="text-slate-400 text-xs -mt-1">
            Pendiente actual: {showPagoModal ? oc(fmtFull(showPagoModal.pendiente, showPagoModal.moneda as Moneda)) : ''}
          </p>

          <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
            <button onClick={() => setVinculando(false)}
              className={`flex-1 py-1.5 rounded-md text-xs font-semibold border-none cursor-pointer transition-all ${!vinculando ? 'bg-white text-slate-900 shadow-sm' : 'bg-transparent text-slate-400'}`}>
              Nuevo pago
            </button>
            <button onClick={() => setVinculando(true)}
              className={`flex-1 py-1.5 rounded-md text-xs font-semibold border-none cursor-pointer transition-all ${vinculando ? 'bg-white text-slate-900 shadow-sm' : 'bg-transparent text-slate-400'}`}>
              Vincular existente
            </button>
          </div>

          {!vinculando ? (
            <>
              <div><FieldLabel>Monto pagado</FieldLabel>
                <MontoInput value={pagoForm.monto} onChange={raw => setPagoForm(p => ({ ...p, monto: raw }))} placeholder="0" />
              </div>
              <div><FieldLabel>Descripción</FieldLabel>
                <input value={pagoForm.descripcion} onChange={e => setPagoForm(p => ({ ...p, descripcion: e.target.value }))}
                  placeholder="Ej: Cuota 3/12 — Crédito auto" className="input-field" />
              </div>
              <p className="text-slate-400 text-xs">Esto va a crear un Egreso por este monto y va a descontarlo del saldo pendiente.</p>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowPagoModal(null)} className="btn-ghost flex-1">Cancelar</button>
                <button onClick={handlePagarCuotaLP} disabled={pagandoCuotaId === showPagoModal?.id || !pagoForm.monto}
                  className="btn-primary flex-1 disabled:opacity-50">{pagandoCuotaId === showPagoModal?.id ? 'Registrando...' : 'Registrar pago'}</button>
              </div>
            </>
          ) : (() => {
            const d = showPagoModal
            const et = d ? etiquetaDeDeuda(d) : null
            const yaVinculados = new Set((egresoEtiquetas ?? []).filter(r => r.etiqueta_id === et?.id).map(r => r.egreso_id))
            const candidatos = (allEgresos ?? [])
              .filter(e => d && e.moneda === d.moneda && !yaVinculados.has(e.id))
              .filter(e => !buscarVincular || e.descripcion.toLowerCase().includes(buscarVincular.toLowerCase()))
              .sort((a, b) => b.fecha.localeCompare(a.fecha))
              .slice(0, 30)
            return (
              <>
                <p className="text-slate-400 text-xs -mt-2">
                  Solo se muestran egresos en {d?.moneda} (la misma moneda de esta deuda) — así el descuento del saldo pendiente es directo, sin conversión.
                </p>
                <input value={buscarVincular} onChange={e => setBuscarVincular(e.target.value)}
                  placeholder="Buscar por descripción..." className="input-field" />
                <div className="max-h-64 overflow-auto flex flex-col gap-1">
                  {candidatos.length === 0 ? (
                    <div className="text-center text-slate-400 text-sm py-6">
                      Sin egresos en {d?.moneda} para vincular todavía.
                    </div>
                  ) : candidatos.map(e => (
                    <button key={e.id} onClick={() => d && handleVincularExistente(d, e)} disabled={pagandoCuotaId === d?.id}
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer text-left bg-white disabled:opacity-50">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-700 truncate">{e.descripcion}</div>
                        <div className="text-xs text-slate-400">{fmtDate(e.fecha)}</div>
                      </div>
                      <span className="font-mono font-bold text-sm text-red-600 flex-shrink-0 ml-3">{oc(fmtFull(e.monto, e.moneda as Moneda))}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowPagoModal(null)} className="btn-ghost">Cancelar</button>
              </>
            )
          })()}
        </div>
      </Modal>
    </div>
  )
}
