import type { Ingreso, Egreso, Deuda, EventoCalendario } from '@/types'
import { diaDeFecha } from './formatters'

// ─── Resumen anual ────────────────────────────────────────────────────────────
export function calcularResumen(ingresos: Ingreso[], egresos: Egreso[], deudas: Deuda[]) {
  return {
    totalIngresos:    ingresos.reduce((s, i) => s + i.monto, 0),
    totalEgresos:     egresos.reduce((s, e) => s + e.monto, 0),
    totalDeuda:       deudas.filter(d => d.activa).reduce((s, d) => s + d.pendiente, 0),
    cuotasMensuales:  deudas.filter(d => d.activa).reduce((s, d) => s + d.cuota_mensual, 0),
  }
}

// ─── Salud financiera ─────────────────────────────────────────────────────────
export interface SaludCategoria {
  nombre: string; score: number; peso: number
  valorActual: string; valorIdeal: string
  descripcion: string; ok: boolean; tip: string; color: string; icono: string
}

export function calcularSalud(
  ingresoMensual: number, egresoMensual: number, cuotaTotal: number,
  tarjetaUsado: number, tarjetaLimite: number, fondoEmergencia: number
) {
  const ratioDeuda   = cuotaTotal / ingresoMensual
  const ahorro       = Math.max(0, ingresoMensual - egresoMensual - cuotaTotal)
  const ratioAhorro  = ahorro / ingresoMensual
  const ratioTarjeta = tarjetaLimite > 0 ? tarjetaUsado / tarjetaLimite : 0
  const mesesEmerg   = egresoMensual > 0 ? fondoEmergencia / egresoMensual : 0
  const ratioGasto   = egresoMensual / ingresoMensual

  const scores = {
    deuda:   Math.max(0, Math.min(100, Math.round((1 - ratioDeuda / 0.36) * 100))),
    ahorro:  Math.max(0, Math.min(100, Math.round((ratioAhorro / 0.20) * 100))),
    tarjeta: Math.max(0, Math.min(100, Math.round((1 - ratioTarjeta / 0.60) * 100))),
    emerg:   Math.max(0, Math.min(100, Math.round((mesesEmerg / 6) * 100))),
    gasto:   Math.max(0, Math.min(100, Math.round((1 - (ratioGasto - 0.50) / 0.50) * 100))),
  }

  const total = Math.round(
    scores.deuda * 0.25 + scores.ahorro * 0.25 + scores.tarjeta * 0.20 +
    scores.emerg * 0.20 + scores.gasto * 0.10
  )

  const categorias: SaludCategoria[] = [
    { nombre: 'Endeudamiento', score: scores.deuda, peso: 25, color: '#5B3FA6', icono: '📋',
      valorActual: `${(ratioDeuda*100).toFixed(1)}% del ingreso`, valorIdeal: '< 36%',
      descripcion: 'Cuotas mensuales vs ingreso', ok: ratioDeuda < 0.36,
      tip: ratioDeuda < 0.36 ? 'Tus cuotas están dentro del rango saludable.' : 'Tus cuotas superan el 36%. Considerá reducir deuda.' },
    { nombre: 'Tasa de ahorro', score: scores.ahorro, peso: 25, color: '#40B046', icono: '💰',
      valorActual: `${(ratioAhorro*100).toFixed(1)}% del ingreso`, valorIdeal: '> 20%',
      descripcion: 'Dinero libre después de todo', ok: ratioAhorro >= 0.20,
      tip: ratioAhorro >= 0.20 ? 'Excelente tasa de ahorro. Considerá invertir el excedente.' : 'Tu tasa de ahorro es baja. Revisá gastos en tarjetas.' },
    { nombre: 'Uso de tarjetas', score: scores.tarjeta, peso: 20, color: '#1A5E9E', icono: '💳',
      valorActual: `${(ratioTarjeta*100).toFixed(1)}% del límite`, valorIdeal: '< 30%',
      descripcion: 'Crédito usado vs límite total', ok: ratioTarjeta < 0.30,
      tip: ratioTarjeta < 0.30 ? 'Buen uso de tarjetas. Cuida tu historial crediticio.' : 'Crédito muy utilizado. Bajá el saldo de tarjetas.' },
    { nombre: 'Fondo emergencia', score: scores.emerg, peso: 20, color: '#1D9E75', icono: '🛡️',
      valorActual: `${mesesEmerg.toFixed(1)} meses cubiertos`, valorIdeal: '≥ 6 meses',
      descripcion: 'Meses sin ingresos cubiertos', ok: mesesEmerg >= 6,
      tip: mesesEmerg >= 6 ? '¡Fondo sólido! Estás protegido ante imprevistos.' : `Te faltan ${(6-mesesEmerg).toFixed(1)} meses. Priorizá este fondo.` },
    { nombre: 'Control de gastos', score: scores.gasto, peso: 10, color: '#E8A020', icono: '📊',
      valorActual: `${(ratioGasto*100).toFixed(1)}% del ingreso`, valorIdeal: '< 70%',
      descripcion: 'Gastos corrientes vs ingreso', ok: ratioGasto < 0.70,
      tip: ratioGasto < 0.70 ? 'Buen control operativo de gastos.' : 'Gastos elevados. Identificá dónde recortar.' },
  ]

  return {
    total,
    label: total >= 75 ? 'Saludable' : total >= 50 ? 'Moderado' : 'Atención',
    color: total >= 75 ? '#40B046' : total >= 50 ? '#E8A020' : '#F54927',
    categorias,
  }
}

// ─── Cash flow diario ─────────────────────────────────────────────────────────
export interface DiaFlow {
  dia: number; entradas: number; salidas: number; neto: number; saldo: number
  eventos: EventoCalendario[]
}

export function proyectarCashFlow(
  saldoInicial: number,
  eventos: EventoCalendario[],
  diasEnMes: number,
  ingresosDelMes: Ingreso[] = []
): DiaFlow[] {
  // Nota: los "ingresos" del flujo día a día antes solo miraban eventos_calendario tipo
  // ingreso — pero la UI no tiene forma de crear ese tipo de evento, así que ese numero
  // daba prácticamente siempre 0. Ahora suma también la tabla ingresos real (derivando
  // el día del mes desde su fecha), que es donde realmente se cargan los ingresos.
  let acum = saldoInicial
  return Array.from({ length: diasEnMes }, (_, i) => {
    const dia    = i + 1
    const dayEvs = eventos.filter(e => e.dia === dia)
    const entradasEventos  = dayEvs.filter(e => e.tipo === 'ingreso' && e.monto).reduce((s, e) => s + (e.monto ?? 0), 0)
    const entradasIngresos = ingresosDelMes.filter(ing => diaDeFecha(ing.fecha) === dia).reduce((s, ing) => s + ing.monto, 0)
    const entradas = entradasEventos + entradasIngresos
    const salidas  = dayEvs.filter(e => e.tipo !== 'ingreso' && e.monto).reduce((s, e) => s + (e.monto ?? 0), 0)
    acum += entradas - salidas
    return { dia, entradas, salidas, neto: entradas - salidas, saldo: Math.round(acum), eventos: dayEvs }
  })
}

// ─── Cash flow diario — versión con desglose real/pendiente ──────────────────
// Usada por la página de Cash Flow. A diferencia de `proyectarCashFlow` (que
// sigue usando el Dashboard sin tocar), acá el punto de partida es 100%
// mensual: `saldoInicioMes` es Ingresos del mes − Egresos del mes − Deudas
// pendientes del mes (ver `page.tsx`), NO un histórico acumulado de todos los
// meses — eso ya se descartó. Cada día distingue movimientos "real" (ya
// cargados en Ingresos/Egresos) de "pendiente" (eventos de calendario con
// vencimiento conocido pero sin pagar todavía — pasale solo los `!pagado`, los
// pagados ya están reflejados en los Egresos/Ingresos reales que generaron).
// `disponible`: cuánto podés gastar por día DESDE ese día en adelante — el
// saldo de ese día menos las salidas que todavía faltan el resto del mes,
// dividido los días que quedan. Es la misma cuenta que el KPI "Podés gastar
// por día" de la página, pero recalculada para cada día — así el número que
// se ve en cada celda del calendario es el disponible, no el saldo acumulado
// (que no dice nada por sí solo sin ver el resto del mes).
export interface MovimientoDia {
  id: string
  descripcion: string
  monto: number
  tipo: 'ingreso' | 'egreso'
  origen: 'real' | 'pendiente' | 'supuesto'
}
export interface DiaFlowDetallado {
  dia: number; entradas: number; salidas: number; neto: number; saldo: number; disponible: number
  movimientos: MovimientoDia[]
}

// Item del simulador ya ubicado en un día (los "sin fecha" no entran acá — mismo
// criterio que ya usaba el badge "Con supuestos" del calendario). Tipado mínimo
// a propósito (no importa CashflowSimItem de @/types) para no acoplar este
// archivo al modelo de datos completo — cualquier objeto con esta forma sirve.
export interface SupuestoFlow { id: string; dia: number | null; monto: number; tipo: 'ingreso' | 'egreso'; descripcion: string }

export function proyectarCashFlowMes(
  saldoInicioMes: number,
  eventosPendientes: EventoCalendario[],
  ingresosDelMes: Ingreso[],
  egresosDelMes: Egreso[],
  diasEnMes: number,
  supuestos: SupuestoFlow[] = []
): DiaFlowDetallado[] {
  let acum = saldoInicioMes
  const base = Array.from({ length: diasEnMes }, (_, i) => {
    const dia = i + 1
    const movimientos: MovimientoDia[] = []
    ingresosDelMes.filter(ing => diaDeFecha(ing.fecha) === dia).forEach(ing =>
      movimientos.push({ id: ing.id, descripcion: ing.descripcion, monto: ing.monto, tipo: 'ingreso', origen: 'real' }))
    egresosDelMes.filter(eg => diaDeFecha(eg.fecha) === dia).forEach(eg =>
      movimientos.push({ id: eg.id, descripcion: eg.descripcion, monto: eg.monto, tipo: 'egreso', origen: 'real' }))
    eventosPendientes.filter(ev => ev.dia === dia).forEach(ev =>
      movimientos.push({
        id: ev.id, descripcion: ev.descripcion, monto: ev.monto ?? 0,
        tipo: ev.tipo === 'ingreso' ? 'ingreso' : 'egreso', origen: 'pendiente',
      }))
    supuestos.filter(s => s.dia === dia).forEach(s =>
      movimientos.push({ id: s.id, descripcion: s.descripcion, monto: s.monto, tipo: s.tipo, origen: 'supuesto' }))
    const entradas = movimientos.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
    const salidas  = movimientos.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0)
    acum += entradas - salidas
    return { dia, entradas, salidas, neto: entradas - salidas, saldo: Math.round(acum), movimientos }
  })
  return base.map((d, idx) => {
    const diasRestantes = diasEnMes - d.dia + 1
    const salidasFuturas = base.slice(idx + 1).reduce((s, dd) => s + dd.salidas, 0)
    const disponible = diasRestantes > 0 ? Math.round((d.saldo - salidasFuturas) / diasRestantes) : d.saldo
    return { ...d, disponible }
  })
}

// ─── Meta de ahorro ───────────────────────────────────────────────────────────
export function calcularMeta(objetivo: number, actual: number, fechaLimite: string) {
  const hoy    = new Date()
  const fin    = new Date(fechaLimite)
  const falta  = Math.max(0, objetivo - actual)
  const pct    = Math.min(100, Math.round((actual / objetivo) * 100))
  const meses  = Math.max(0, Math.round((fin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
  const cuota  = meses > 0 ? Math.ceil(falta / meses) : falta
  return { pct, meses, cuota, falta }
}
