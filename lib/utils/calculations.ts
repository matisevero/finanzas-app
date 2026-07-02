import type { Ingreso, Egreso, Deuda, EventoCalendario } from '@/types'

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
  diasEnMes: number
): DiaFlow[] {
  let acum = saldoInicial
  return Array.from({ length: diasEnMes }, (_, i) => {
    const dia    = i + 1
    const dayEvs = eventos.filter(e => e.dia === dia)
    const entradas = dayEvs.filter(e => e.tipo === 'ingreso' && e.monto).reduce((s, e) => s + (e.monto ?? 0), 0)
    const salidas  = dayEvs.filter(e => e.tipo !== 'ingreso' && e.monto).reduce((s, e) => s + (e.monto ?? 0), 0)
    acum += entradas - salidas
    return { dia, entradas, salidas, neto: entradas - salidas, saldo: Math.round(acum), eventos: dayEvs }
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
