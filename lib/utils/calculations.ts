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

// ─── Salud financiera — configurable ──────────────────────────────────────────
// Reemplaza los pesos/umbrales/categorías hardcodeados de calcularSalud() (que
// queda sin usar más abajo, no se borra por las dudas) por una lista de
// categorías que el usuario arma y edita desde el modal "Configurar". Cada
// categoría define de dónde sale su número (`fuente_tipo`) — ver el comentario
// en el schema SQL (11-salud-config-schema.sql) para el detalle de cada fuente.
import type { SaludCategoriaConfig, Ahorro, Meta } from '@/types'

export interface SaludInputsConfigurable {
  ingresoMensual: number
  egresoMensual: number
  cuotaTotal: number
  tarjetaUsado: number
  tarjetaLimite: number
  egresosDelPeriodo: Egreso[]
  ahorros: Ahorro[]
  metas: Meta[]
}

// Categoría ya con peso/umbral resueltos (general del usuario, salvo que haya
// override específico para el mes activo — eso se resuelve antes de llamar acá).
export type SaludCategoriaResuelta = Pick<SaludCategoriaConfig, 'id'|'nombre'|'icono'|'color'|'peso'|'umbral'|'comparacion'|'fuente_tipo'|'fuente_config'>

function valorDeCategoria(cat: SaludCategoriaResuelta, inp: SaludInputsConfigurable): { valor: number; unidad: '%' | 'meses'; montoAbsoluto: number } {
  const ing = inp.ingresoMensual || 1
  switch (cat.fuente_tipo) {
    case 'deuda_cuotas':
      return { valor: (inp.cuotaTotal / ing) * 100, unidad: '%', montoAbsoluto: inp.cuotaTotal }
    case 'ratio_ahorro_libre': {
      const libre = Math.max(0, inp.ingresoMensual - inp.egresoMensual - inp.cuotaTotal)
      return { valor: (libre / ing) * 100, unidad: '%', montoAbsoluto: libre }
    }
    case 'tarjeta_uso':
      return { valor: inp.tarjetaLimite > 0 ? (inp.tarjetaUsado / inp.tarjetaLimite) * 100 : 0, unidad: '%', montoAbsoluto: inp.tarjetaUsado }
    case 'ratio_gasto':
      return { valor: (inp.egresoMensual / ing) * 100, unidad: '%', montoAbsoluto: inp.egresoMensual }
    case 'egreso_recurrente': {
      const sum = inp.egresosDelPeriodo.filter(e => e.recurrente).reduce((s, e) => s + e.monto, 0)
      return { valor: (sum / ing) * 100, unidad: '%', montoAbsoluto: sum }
    }
    case 'egreso_categoria': {
      const cats = (cat.fuente_config.categorias ?? []).map(normCat)
      const sum = inp.egresosDelPeriodo.filter(e => cats.includes(normCat(e.categoria))).reduce((s, e) => s + e.monto, 0)
      return { valor: (sum / ing) * 100, unidad: '%', montoAbsoluto: sum }
    }
    case 'ahorro_metas': {
      const aIds = new Set(cat.fuente_config.ahorro_ids ?? [])
      const mIds = new Set(cat.fuente_config.meta_ids ?? [])
      const sumAhorros = inp.ahorros.filter(a => aIds.has(a.id)).reduce((s, a) => s + a.ajuste_manual, 0)
      const sumMetas = inp.metas.filter(m => mIds.has(m.id)).reduce((s, m) => s + m.monto_actual, 0)
      const total = sumAhorros + sumMetas
      return { valor: inp.egresoMensual > 0 ? total / inp.egresoMensual : 0, unidad: 'meses', montoAbsoluto: total }
    }
  }
}

// Normaliza para comparar categorías sin que importe mayúsculas/acentos —
// "Educación" y "educacion" son la misma categoría para cualquier humano, pero
// como texto son strings distintos. Sin esto, seleccionar una no capturaba los
// Egresos cargados con la otra variante. Exportada porque el modal de
// configuración también la necesita para armar la lista sin repetir variantes.
export function normCat(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

const DESCRIPCION_FUENTE: Record<SaludCategoriaConfig['fuente_tipo'], string> = {
  deuda_cuotas: 'Cuotas mensuales de deudas vs ingreso',
  ratio_ahorro_libre: 'Dinero libre después de todo',
  tarjeta_uso: 'Crédito usado vs límite total',
  ratio_gasto: 'Gastos corrientes vs ingreso',
  egreso_recurrente: 'Egresos recurrentes vs ingreso',
  egreso_categoria: 'Egresos de la categoría elegida vs ingreso',
  ahorro_metas: 'Ahorros/metas elegidos vs egreso mensual',
}

export interface SaludCategoriaResultado {
  id: string; nombre: string; icono: string; color: string; peso: number
  score: number; ok: boolean; tip: string; descripcion: string
  valorActual: string; valorIdeal: string; montoActual: number
  // Para la pestaña Presupuesto: unidad/umbral crudos (sin formatear) y de qué
  // fuente sale, para poder convertir el umbral a $ y dibujar el slider.
  umbral: number; unidad: '%' | 'meses'; fuenteTipo: SaludCategoriaConfig['fuente_tipo']
}

export function calcularSaludConfigurable(categorias: SaludCategoriaResuelta[], inp: SaludInputsConfigurable) {
  const pesoTotal = categorias.reduce((s, c) => s + c.peso, 0) || 100
  const resultados: SaludCategoriaResultado[] = categorias.map(cat => {
    const { valor, unidad, montoAbsoluto } = valorDeCategoria(cat, inp)
    const umbral = cat.umbral || 1
    const score = Math.max(0, Math.min(100, Math.round(
      cat.comparacion === 'mayor_que' ? (valor / umbral) * 100 : (1 - valor / umbral) * 100
    )))
    const ok = cat.comparacion === 'mayor_que' ? valor >= cat.umbral : valor < cat.umbral
    const fmtValor = (v: number) => unidad === '%' ? `${v.toFixed(1)}%` : `${v.toFixed(1)} meses`
    const fmtIdeal = unidad === '%'
      ? `${cat.comparacion === 'menor_que' ? '<' : '>'} ${cat.umbral}%`
      : `${cat.comparacion === 'menor_que' ? '<' : '≥'} ${cat.umbral} meses`
    return {
      id: cat.id, nombre: cat.nombre, icono: cat.icono, color: cat.color, peso: cat.peso,
      score, ok, descripcion: DESCRIPCION_FUENTE[cat.fuente_tipo],
      tip: ok
        ? 'Está dentro del rango que definiste.'
        : cat.comparacion === 'menor_que'
          ? `Está por encima del ideal (${fmtIdeal}). Convendría bajarlo.`
          : `Está por debajo del ideal (${fmtIdeal}). Convendría subirlo.`,
      valorActual: fmtValor(valor), valorIdeal: fmtIdeal, montoActual: montoAbsoluto,
      umbral: cat.umbral, unidad, fuenteTipo: cat.fuente_tipo,
    }
  })
  const total = Math.round(resultados.reduce((s, c) => s + c.score * c.peso, 0) / pesoTotal)
  return {
    total,
    label: total >= 75 ? 'Saludable' : total >= 50 ? 'Moderado' : 'Atención',
    color: total >= 75 ? '#40B046' : total >= 50 ? '#E8A020' : '#F54927',
    categorias: resultados,
  }
}

// ─── Insights en texto plano — "esto es lo que juntamos, esto podrías hacer" ──
// Compara el mes activo contra el mes anterior (mismas categorías, mismos
// fuente_tipo) para poder decir "subió/bajó X% vs el mes pasado". Los tipos
// 'ratio_ahorro_libre' y 'ahorro_metas' no tienen una comparación mes a mes
// confiable con los datos que hay hoy (uno es derivado, el otro es una foto del
// saldo actual, no un historial) — para esos se muestra el estado sin variación.
export interface SaludInsight {
  id: string; icono: string; texto: string; tipo: 'oportunidad' | 'cambio' | 'positivo'
}

export function calcularInsights(
  categorias: SaludCategoriaResuelta[],
  inpActual: SaludInputsConfigurable,
  inpAnterior: SaludInputsConfigurable
): SaludInsight[] {
  const insights: SaludInsight[] = []
  for (const cat of categorias) {
    const { valor, montoAbsoluto } = valorDeCategoria(cat, inpActual)
    const ok = cat.comparacion === 'mayor_que' ? valor >= cat.umbral : valor < cat.umbral

    if (cat.fuente_tipo === 'ahorro_metas') {
      insights.push({
        id: cat.id, icono: cat.icono, tipo: ok ? 'positivo' : 'cambio',
        texto: `Tu ${cat.nombre} está en ${Math.round(montoAbsoluto).toLocaleString('es-AR')} — cubre ${valor.toFixed(1)} meses de gastos.`,
      })
      continue
    }

    const { montoAbsoluto: montoAnterior } = valorDeCategoria(cat, inpAnterior)
    const cambioPct = montoAnterior > 0 ? ((montoAbsoluto - montoAnterior) / montoAnterior) * 100 : 0

    if (!ok && montoAbsoluto > 0) {
      insights.push({
        id: cat.id, icono: cat.icono, tipo: 'oportunidad',
        texto: `Gastás ${Math.round(montoAbsoluto).toLocaleString('es-AR')} en ${cat.nombre} — ${valor.toFixed(1)}% de tu ingreso. Bajarlo a la mitad te dejaría +${Math.round(montoAbsoluto/2).toLocaleString('es-AR')}/mes libres.`,
      })
    } else if (Math.abs(cambioPct) >= 10 && montoAnterior > 0) {
      insights.push({
        id: cat.id, icono: cat.icono, tipo: 'cambio',
        texto: `${cat.nombre} vino un ${Math.abs(Math.round(cambioPct))}% ${cambioPct > 0 ? 'arriba' : 'abajo'} del mes pasado — pasó de ${Math.round(montoAnterior).toLocaleString('es-AR')} a ${Math.round(montoAbsoluto).toLocaleString('es-AR')}.`,
      })
    } else if (ok) {
      insights.push({ id: cat.id, icono: cat.icono, tipo: 'positivo', texto: `${cat.nombre} está bien — ${valor.toFixed(1)}%, dentro de lo que definiste.` })
    }
  }
  const orden = { oportunidad: 0, cambio: 1, positivo: 2 }
  return insights.sort((a, b) => orden[a.tipo] - orden[b.tipo])
}


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
