// ─── Primitivos ──────────────────────────────────────────────────────────────
// Antes era una lista cerrada de 6 códigos. La base de datos nunca exigió eso —
// era solo una restricción de este tipo. Ahora es cualquier código de moneda que
// el usuario agregue desde Configuración (el pool vive en el store, no acá).
export type Moneda = string
export type TipoIngreso = string
export type TipoEgreso = string
export type TipoEvento = 'ingreso' | 'egreso' | 'tarjeta' | 'casa' | 'servicio' | 'edu' | 'expensa' | 'devolucion'
// Antes era una lista cerrada ('Mati' | 'Dani' | 'ambos'), igual que Moneda. Ahora las
// personas se gestionan desde Configuración (ver Persona más abajo) y "ambos" queda como
// el único valor fijo, sinónimo de "compartido/todos" — no es una fila en `personas`.
export type Quien = string

// ─── Persona ("quién") ─────────────────────────────────────────────────────────
// Gestionable desde Configuración: alta, edición de nombre y archivado/baja.
// `quien` en ingresos/egresos/tarjetas sigue siendo TEXT libre por nombre, no FK —
// así el historial no se rompe si en algún momento se decide no propagar un rename.
export interface Persona {
  id: string
  user_id: string
  nombre: string
  orden: number
  estado: 'activa' | 'archivada'
  created_at: string
}
export type PersonaInsert = { nombre: string; orden?: number }

// ─── Categoría custom ─────────────────────────────────────────────────────────
export interface CategoriaCustom {
  id: string
  user_id: string
  modulo: string
  nombre: string
  icono: string
  color: string
  parent_id: string | null
  created_at: string
  children?: CategoriaCustom[]
}
export type CategoriaCustomInsert = Omit<CategoriaCustom, 'id' | 'user_id' | 'created_at' | 'children'>

// ─── Usuario ─────────────────────────────────────────────────────────────────
export interface Usuario {
  id: string
  email: string
  nombre: string
  avatar_url?: string
  moneda_principal: Moneda
  monedas_ahorro: Moneda[]
  monedas_cripto: Moneda[]
  created_at: string
  updated_at: string
}

// ─── Ingresos ────────────────────────────────────────────────────────────────
export interface Ingreso {
  id: string
  user_id: string
  año: number
  mes: number
  tipo: string
  monto: number
  moneda: Moneda
  descripcion: string
  fecha: string
  quien: Quien
  recurrente: boolean
  etiqueta?: string | null
  cotizacion?: number | null
  nota?: string | null
  created_at: string
}
export type IngresoInsert = Omit<Ingreso, 'id' | 'user_id' | 'año' | 'mes' | 'created_at'>

// ─── Egresos ─────────────────────────────────────────────────────────────────
export interface Egreso {
  id: string
  user_id: string
  año: number
  mes: number
  categoria: string
  monto: number
  moneda: Moneda
  descripcion: string
  fecha: string
  quien: Quien
  recurrente: boolean
  etiqueta?: string | null
  cotizacion?: number | null
  nota?: string | null
  created_at: string
}
export type EgresoInsert = Omit<Egreso, 'id' | 'user_id' | 'año' | 'mes' | 'created_at'>

// ─── Deudas largo plazo ───────────────────────────────────────────────────────
export interface Deuda {
  id: string
  user_id: string
  nombre: string
  banco: string
  total_original: number
  pendiente: number
  cuota_mensual: number
  tasa_interes: number
  moneda: Moneda
  fecha_inicio: string
  fecha_vencimiento: string
  cuota_actual: number
  cuota_total: number
  color: string
  activa: boolean
  etiqueta?: string | null
  tarjeta_id?: string | null
  periodo_año?: number | null
  periodo_mes?: number | null
  monto_antes_ajuste?: number | null
  created_at: string
}
export type DeudaInsert = Omit<Deuda, 'id' | 'user_id' | 'created_at'>

export interface PagoDeuda {
  id: string
  deuda_id: string
  fecha: string
  descripcion: string
  monto: number
  moneda: Moneda
  created_at: string
}

// ─── Tarjetas ────────────────────────────────────────────────────────────────
export interface Tarjeta {
  id: string
  user_id: string
  nombre: string
  banco: string
  limite: number
  moneda: Moneda
  color: string
  icono: string
  quien: Quien
  dia_cierre: number
  dia_vencimiento: number
  ultimos_4?: string | null
  activa: boolean
  fecha_cierre_actual?: string | null
  fecha_vencimiento_actual?: string | null
  fecha_cierre_proximo?: string | null
  fecha_vencimiento_proximo?: string | null
  created_at: string
}
export type TarjetaInsert = Omit<Tarjeta, 'id' | 'user_id' | 'created_at'>

// 'cargado'  = cargado a mano, todavía no llegó el resumen que lo confirme
// 'validado' = matcheado contra un resumen (automático o a mano), o vino directo del PDF
// 'revisar'  = no encontró correspondencia — decisión manual
export type EstadoConciliacion = 'cargado' | 'validado' | 'revisar'

export interface TarjetaTransaccion {
  id: string
  tarjeta_id: string
  descripcion: string
  /** El texto tal cual aparece en el resumen del banco — separado de `descripcion`, que puede
   *  ser un nombre más amigable (editado a mano, o aprendido de tarjeta_comercios). */
  descripcion_raw?: string | null
  categoria: string
  fecha: string
  /** A qué período (mes de pago) pertenece — independiente de `fecha`. Un resumen de agosto
   *  trae gastos de julio y agosto; lo que importa es en qué carga se metió, no la fecha del ítem. */
  periodo_año: number
  periodo_mes: number
  monto: number
  moneda: Moneda
  cotizacion_ars?: number
  cuota_actual?: number
  cuota_total?: number
  tipo: 'debito' | 'credito'
  origen?: 'manual' | 'pdf'
  quien?: string | null
  created_at: string
}

export interface TarjetaResumen {
  id: string
  tarjeta_id: string
  año: number
  mes: number
  fecha_cierre: string
  fecha_vencimiento: string
  fecha_cierre_proximo?: string | null
  fecha_vencimiento_proximo?: string | null
  total_resumen: number
  moneda: Moneda
  deuda_id?: string | null
  created_at: string
}
export type TarjetaResumenInsert = Omit<TarjetaResumen, 'id' | 'created_at'>

/** Total que declarás vos (leído del resumen real) por tarjeta+período+moneda, para comparar
 *  contra la suma del detalle cargado. Reemplaza al sistema de conciliación contra PDF. */
export interface TarjetaPeriodoTotal {
  id: string
  tarjeta_id: string
  año: number
  mes: number
  moneda: Moneda
  total_declarado: number
  /** Fecha real de vencimiento de ESTE período (puede caer en el mes siguiente al que se
   *  está cargando — un resumen de agosto vence en septiembre). Igual en todas las filas
   *  de moneda de un mismo período; se guarda repetida para no armar otra tabla aparte. */
  fecha_vencimiento?: string | null
  created_at: string
}
export type TarjetaPeriodoTotalInsert = Omit<TarjetaPeriodoTotal, 'id' | 'created_at'>

export interface PagoTarjeta {
  id: string
  tarjeta_id: string
  año: number
  mes: number
  monto: number
  moneda: Moneda
  fecha_pago: string
  created_at: string
}

// ─── Eventos calendario / cash flow ──────────────────────────────────────────
export interface EventoCalendario {
  id: string
  user_id: string
  dia: number
  mes: number
  año: number
  tipo: TipoEvento
  descripcion: string
  monto?: number
  moneda: Moneda
  recurrente: boolean
  pagado: boolean
  egreso_id?: string | null
  ingreso_id?: string | null
  nota?: string | null
  gasto_fijo?: boolean
  created_at: string
}
export type EventoInsert = Omit<EventoCalendario, 'id' | 'user_id' | 'created_at'>

// ─── Metas ───────────────────────────────────────────────────────────────────
export type TipoPeriodoMeta = 'objetivo' | 'mensual' | 'anual' | 'lapso'
export interface Meta {
  id: string
  user_id: string
  nombre: string
  descripcion?: string
  monto_objetivo: number
  monto_actual: number
  moneda: Moneda
  fecha_limite: string
  tipo_periodo: TipoPeriodoMeta
  icono: string
  color: string
  completada: boolean
  created_at: string
}
export type MetaInsert = Omit<Meta, 'id' | 'user_id' | 'created_at'>

export interface MetaAporte {
  id: string
  meta_id: string
  monto: number
  fecha: string
  nota?: string | null
  created_at: string
}
export type MetaAporteInsert = Omit<MetaAporte, 'id' | 'created_at'>

export interface Ahorro {
  id: string
  user_id: string
  nombre: string
  categoria: string
  moneda: Moneda
  icono: string
  color: string
  ajuste_manual: number
  cantidad?: number | null
  created_at: string
}
export type AhorroInsert = Omit<Ahorro, 'id' | 'user_id' | 'created_at'>

export interface AhorroAjuste {
  id: string
  ahorro_id: string
  monto: number // puede ser negativo
  fecha: string
  nota?: string | null
  created_at: string
}
export type AhorroAjusteInsert = Omit<AhorroAjuste, 'id' | 'created_at'>

export interface Proyecto {
  id: string
  user_id: string
  nombre: string
  icono: string
  color: string
  presupuesto: number
  moneda: Moneda
  fecha_inicio?: string | null
  fecha_fin?: string | null
  activo: boolean
  created_at: string
}
export type ProyectoInsert = Omit<Proyecto, 'id' | 'user_id' | 'created_at'>

export interface ProyectoPresupuesto {
  proyecto_id: string
  moneda: Moneda
  monto: number
}

export type EstadoMovimientoManual = 'estimado' | 'pendiente'
export interface ProyectoMovimientoManual {
  id: string
  proyecto_id: string
  descripcion: string
  categoria: string
  fecha: string
  monto: number
  moneda: Moneda
  estado: EstadoMovimientoManual
  egreso_id?: string | null
  created_at: string
}
export type ProyectoMovimientoManualInsert = Omit<ProyectoMovimientoManual, 'id' | 'created_at'>

export type TipoEtiqueta = 'libre' | 'proyecto' | 'ahorro' | 'deuda' | 'meta'
export type EstadoEtiqueta = 'activa' | 'archivada'
export interface Etiqueta {
  id: string
  user_id: string
  nombre: string
  tipo: TipoEtiqueta
  proyecto_id?: string | null
  ahorro_id?: string | null
  deuda_id?: string | null
  meta_id?: string | null
  color?: string | null
  estado: EstadoEtiqueta
  created_at: string
}
export type EtiquetaInsert = Omit<Etiqueta, 'id' | 'user_id' | 'created_at' | 'estado'>

// ─── Precios recurrentes ──────────────────────────────────────────────────────
export interface PrecioItem {
  id: string
  user_id: string
  nombre: string
  categoria: string
  icono: string
  archivado: boolean
  created_at: string
}

export interface PrecioHistorial {
  id: string
  item_id: string
  mes: string
  valor: number
  moneda: Moneda
  egreso_id?: string | null
  ingreso_id?: string | null
  created_at: string
}

// ─── Cash flow ───────────────────────────────────────────────────────────────
export interface SaldoInicial {
  id: string
  user_id: string
  año: number
  mes: number
  monto: number
  moneda: Moneda
  created_at: string
}

// ─── Cash Flow — simulador (items "supuestos" del mes) ───────────────────────
// Viven acotados a un (año, mes): el simulador arranca limpio al cambiar de mes,
// no se arrastran de un mes a otro. `checked` = el usuario confirmó que el supuesto
// se cumplió tal cual lo planeó (auto-validación manual, no matching automático).
export interface CashflowSimItem {
  id: string
  user_id: string
  año: number
  mes: number
  dia: number | null
  descripcion: string
  monto: number
  moneda: Moneda
  tipo: 'ingreso' | 'egreso'
  checked: boolean
  created_at: string
}
export type CashflowSimItemInsert = Omit<CashflowSimItem, 'id' | 'user_id' | 'created_at'>

// ─── Cash Flow — resumen mensual (histórico, sobrevive aunque se limpien los
// items del simulador de ese mes al pasar al siguiente) ───────────────────────
// (CashflowResumenMensual se sacó junto con la tabla — ver nota en lib/queries/index.ts)

// ─── App state ───────────────────────────────────────────────────────────────
export interface AppConfig {
  añoActivo: number
  monedaPrincipal: Moneda
  monedasAhorro: Moneda[]
  monedasCripto: Moneda[]
}

export interface ResumenAnual {
  totalIngresos: number
  totalEgresos: number
  totalAhorro: number
  totalDeuda: number
  cuotasMensuales: number
  moneda: Moneda
}

export interface DiaFlow {
  dia: number
  entradas: number
  salidas: number
  neto: number
  saldoAcumulado: number
  eventos: EventoCalendario[]
}

// ─── Salud de los datos ───────────────────────────────────────────────────────
export type TipoHallazgo = 'duplicado_exacto' | 'duplicado_probable' | 'sin_etiqueta'
export type EntidadHallazgo = 'ingreso' | 'egreso' | 'tarjeta_transaccion'
export type EstadoHallazgo = 'pendiente' | 'descartado' | 'resuelto'

export interface CalidadHallazgo {
  id: string
  user_id: string
  tipo: TipoHallazgo
  entidad: EntidadHallazgo
  entidad_id: string
  entidad_id_2?: string | null
  detectado_en: string
  estado: EstadoHallazgo
  created_at: string
}

// ─── Consola de movimientos (Configuración → Todos los movimientos) ─────────
export interface MovimientoUnificado {
  id: string
  user_id: string
  tipo_movimiento: 'ingreso' | 'egreso'
  descripcion: string
  categoria: string
  monto: number
  moneda: Moneda
  fecha: string
  quien: string
  etiqueta_ids: string[]
  created_at: string
}

export interface TarjetaTransaccionVista {
  id: string
  tarjeta_id: string
  descripcion: string
  categoria: string
  monto: number
  moneda: Moneda
  fecha: string
  periodo_año: number
  periodo_mes: number
  tipo: string
  etiqueta_ids: string[]
  created_at: string
}
