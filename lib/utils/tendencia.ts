import type { VistaTipo } from '@/store/appStore'

// ─── Tendencia real (mes anterior / año anterior) ──────────────────────────────
// Reemplaza los valores hardcodeados de los widgets. Calcula el % de variación
// del período activo (según vistaTipo) contra el período anterior equivalente:
//   - vista "mensual" -> mes activo vs mes inmediatamente anterior (cruza de año en enero)
//   - vista "anual"   -> año activo vs año anterior
// Devuelve trend: undefined cuando no hay dato del período anterior para comparar
// (evita mostrar un % enganioso tipo "+Inf%" o basado en 0).

export interface RegistroPeriodo {
  monto: number
  mes: number
  año: number
}

export function calcularTendencia(
  registros: RegistroPeriodo[],
  vistaTipo: VistaTipo,
  mesActivo: number,
  añoActivo: number,
): { trend: number | undefined; label: string } {
  const esMensual = vistaTipo === 'mensual'
  const label = esMensual ? 'vs mes anterior' : 'vs año anterior'

  let actual = 0
  let anterior = 0

  if (esMensual) {
    const mesAnt = mesActivo === 1 ? 12 : mesActivo - 1
    const añoAnt = mesActivo === 1 ? añoActivo - 1 : añoActivo
    actual    = registros.filter(r => r.mes === mesActivo && r.año === añoActivo).reduce((s, r) => s + r.monto, 0)
    anterior  = registros.filter(r => r.mes === mesAnt && r.año === añoAnt).reduce((s, r) => s + r.monto, 0)
  } else {
    actual    = registros.filter(r => r.año === añoActivo).reduce((s, r) => s + r.monto, 0)
    anterior  = registros.filter(r => r.año === añoActivo - 1).reduce((s, r) => s + r.monto, 0)
  }

  const trend = anterior > 0 ? Math.round((actual - anterior) / anterior * 100) : undefined
  return { trend, label }
}

// Variante para balances (ingresos - egresos): recibe ambos sets y resta período a período,
// en vez de sumar un único campo `monto`.
export function calcularTendenciaBalance(
  ingresos: RegistroPeriodo[],
  egresos: RegistroPeriodo[],
  vistaTipo: VistaTipo,
  mesActivo: number,
  añoActivo: number,
): { trend: number | undefined; label: string } {
  const esMensual = vistaTipo === 'mensual'
  const label = esMensual ? 'vs mes anterior' : 'vs año anterior'

  const sum = (regs: RegistroPeriodo[], mes: number | null, año: number) =>
    regs.filter(r => (mes === null || r.mes === mes) && r.año === año).reduce((s, r) => s + r.monto, 0)

  let actual = 0
  let anterior = 0

  if (esMensual) {
    const mesAnt = mesActivo === 1 ? 12 : mesActivo - 1
    const añoAnt = mesActivo === 1 ? añoActivo - 1 : añoActivo
    actual   = sum(ingresos, mesActivo, añoActivo) - sum(egresos, mesActivo, añoActivo)
    anterior = sum(ingresos, mesAnt, añoAnt) - sum(egresos, mesAnt, añoAnt)
  } else {
    actual   = sum(ingresos, null, añoActivo) - sum(egresos, null, añoActivo)
    anterior = sum(ingresos, null, añoActivo - 1) - sum(egresos, null, añoActivo - 1)
  }

  const trend = anterior !== 0 ? Math.round((actual - anterior) / Math.abs(anterior) * 100) : undefined
  return { trend, label }
}
