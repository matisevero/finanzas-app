// ─── Primitivos ──────────────────────────────────────────────────────────────
export type Moneda = 'ARS' | 'USD' | 'EUR' | 'BTC' | 'ETH' | 'USDT'
export type TipoIngreso = string
export type TipoEgreso = string
export type TipoEvento = 'ingreso' | 'egreso' | 'tarjeta' | 'casa' | 'servicio' | 'edu' | 'expensa'
export type Quien = 'Mati' | 'Dani' | 'ambos'

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
  activa: boolean
  created_at: string
}

export interface TarjetaTransaccion {
  id: string
  tarjeta_id: string
  descripcion: string
  categoria: string
  fecha: string
  monto: number
  moneda: Moneda
  cotizacion_ars?: number
  cuota_actual?: number
  cuota_total?: number
  tipo: 'debito' | 'credito'
  created_at: string
}

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
  created_at: string
}
export type EventoInsert = Omit<EventoCalendario, 'id' | 'user_id' | 'created_at'>

// ─── Metas ───────────────────────────────────────────────────────────────────
export interface Meta {
  id: string
  user_id: string
  nombre: string
  descripcion?: string
  monto_objetivo: number
  monto_actual: number
  moneda: Moneda
  fecha_limite: string
  icono: string
  color: string
  completada: boolean
  created_at: string
}
export type MetaInsert = Omit<Meta, 'id' | 'user_id' | 'created_at'>

// ─── Precios recurrentes ──────────────────────────────────────────────────────
export interface PrecioItem {
  id: string
  user_id: string
  nombre: string
  categoria: string
  icono: string
  created_at: string
}

export interface PrecioHistorial {
  id: string
  item_id: string
  mes: string
  valor: number
  moneda: Moneda
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
