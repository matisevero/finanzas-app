import { createClient } from '@/lib/supabase/client'
import type {
  Ingreso, IngresoInsert, Egreso, EgresoInsert,
  Deuda, DeudaInsert, PagoDeuda,
  Tarjeta, TarjetaTransaccion, PagoTarjeta,
  EventoCalendario, EventoInsert,
  Meta, MetaInsert,
  PrecioItem, PrecioHistorial,
  SaldoInicial,
} from '@/types'

const sb = () => createClient()
const uid = async () => {
  const { data: { user } } = await sb().auth.getUser()
  if (!user) throw new Error('No autenticado')
  return user.id
}

// ─── INGRESOS ─────────────────────────────────────────────────────────────────
export async function getIngresosByAño(año: number): Promise<Ingreso[]> {
  const { data, error } = await sb().from('ingresos').select('*').eq('año', año).order('fecha')
  if (error) throw error
  return data ?? []
}

export async function createIngreso(form: IngresoInsert): Promise<Ingreso> {
  const userId = await uid()
  const fecha  = new Date(form.fecha)
  const { data, error } = await sb().from('ingresos')
    .insert({ ...form, user_id: userId, año: fecha.getFullYear(), mes: fecha.getMonth() + 1 })
    .select().single()
  if (error) throw error
  return data
}

export async function deleteIngreso(id: string) {
  const { error } = await sb().from('ingresos').delete().eq('id', id)
  if (error) throw error
}

// ─── EGRESOS ─────────────────────────────────────────────────────────────────
export async function getEgresosByAño(año: number): Promise<Egreso[]> {
  const { data, error } = await sb().from('egresos').select('*').eq('año', año).order('fecha')
  if (error) throw error
  return data ?? []
}

export async function createEgreso(form: EgresoInsert): Promise<Egreso> {
  const userId = await uid()
  const fecha  = new Date(form.fecha)
  const { data, error } = await sb().from('egresos')
    .insert({ ...form, user_id: userId, año: fecha.getFullYear(), mes: fecha.getMonth() + 1 })
    .select().single()
  if (error) throw error
  return data
}

export async function deleteEgreso(id: string) {
  const { error } = await sb().from('egresos').delete().eq('id', id)
  if (error) throw error
}

// ─── DEUDAS ──────────────────────────────────────────────────────────────────
export async function getDeudas(): Promise<Deuda[]> {
  const { data, error } = await sb().from('deudas').select('*').eq('activa', true).order('created_at')
  if (error) throw error
  return data ?? []
}

export async function createDeuda(form: DeudaInsert): Promise<Deuda> {
  const userId = await uid()
  const { data, error } = await sb().from('deudas').insert({ ...form, user_id: userId }).select().single()
  if (error) throw error
  return data
}

export async function updateDeuda(id: string, updates: Partial<DeudaInsert>): Promise<Deuda> {
  const { data, error } = await sb().from('deudas').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function getPagosDeuda(deudaId: string): Promise<PagoDeuda[]> {
  const { data, error } = await sb().from('pagos_deuda').select('*').eq('deuda_id', deudaId).order('fecha', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createPagoDeuda(pagoData: Omit<PagoDeuda, 'id' | 'created_at'>): Promise<PagoDeuda> {
  const { data, error } = await sb().from('pagos_deuda').insert(pagoData).select().single()
  if (error) throw error
  return data
}

// ─── TARJETAS ────────────────────────────────────────────────────────────────
export async function getTarjetas(): Promise<Tarjeta[]> {
  const { data, error } = await sb().from('tarjetas').select('*').eq('activa', true).order('created_at')
  if (error) throw error
  return data ?? []
}

export async function getTarjetaTransacciones(tarjetaId?: string): Promise<TarjetaTransaccion[]> {
  let q = sb().from('tarjeta_transacciones').select('*').order('fecha', { ascending: false })
  if (tarjetaId) q = q.eq('tarjeta_id', tarjetaId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function getPagosTarjeta(tarjetaId?: string): Promise<PagoTarjeta[]> {
  let q = sb().from('pagos_tarjeta').select('*').order('año, mes')
  if (tarjetaId) q = q.eq('tarjeta_id', tarjetaId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function upsertPagoTarjeta(pago: Omit<PagoTarjeta, 'id' | 'created_at'>): Promise<PagoTarjeta> {
  const { data, error } = await sb().from('pagos_tarjeta').upsert(pago, { onConflict: 'tarjeta_id,año,mes' }).select().single()
  if (error) throw error
  return data
}

// ─── EVENTOS CALENDARIO ──────────────────────────────────────────────────────
export async function getEventosByMes(año: number, mes: number): Promise<EventoCalendario[]> {
  const { data, error } = await sb().from('eventos_calendario')
    .select('*').eq('año', año).eq('mes', mes).order('dia')
  if (error) throw error
  return data ?? []
}

export async function createEvento(form: EventoInsert): Promise<EventoCalendario> {
  const userId = await uid()
  const { data, error } = await sb().from('eventos_calendario')
    .insert({ ...form, user_id: userId }).select().single()
  if (error) throw error
  return data
}

export async function updateEvento(id: string, updates: Partial<EventoCalendario>): Promise<EventoCalendario> {
  const { data, error } = await sb().from('eventos_calendario').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function togglePagado(id: string, pagado: boolean) {
  const { error } = await sb().from('eventos_calendario').update({ pagado }).eq('id', id)
  if (error) throw error
}

// ─── SALDO INICIAL ────────────────────────────────────────────────────────────
export async function getSaldoInicial(año: number, mes: number): Promise<SaldoInicial | null> {
  const userId = await uid()
  const { data } = await sb().from('saldo_inicial')
    .select('*').eq('user_id', userId).eq('año', año).eq('mes', mes).single()
  return data
}

export async function upsertSaldoInicial(año: number, mes: number, monto: number, moneda = 'ARS') {
  const userId = await uid()
  const { error } = await sb().from('saldo_inicial')
    .upsert({ user_id: userId, año, mes, monto, moneda }, { onConflict: 'user_id,año,mes' })
  if (error) throw error
}

// ─── METAS ───────────────────────────────────────────────────────────────────
export async function getMetas(): Promise<Meta[]> {
  const { data, error } = await sb().from('metas').select('*').order('fecha_limite')
  if (error) throw error
  return data ?? []
}

export async function createMeta(form: MetaInsert): Promise<Meta> {
  const userId = await uid()
  const { data, error } = await sb().from('metas').insert({ ...form, user_id: userId }).select().single()
  if (error) throw error
  return data
}

export async function updateMeta(id: string, updates: Partial<MetaInsert>): Promise<Meta> {
  const { data, error } = await sb().from('metas').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteMeta(id: string) {
  const { error } = await sb().from('metas').delete().eq('id', id)
  if (error) throw error
}

// ─── PRECIOS ─────────────────────────────────────────────────────────────────
export async function getPrecioItems(): Promise<PrecioItem[]> {
  const { data, error } = await sb().from('precio_items').select('*').order('nombre')
  if (error) throw error
  return data ?? []
}

export async function getPrecioHistorial(itemId?: string): Promise<PrecioHistorial[]> {
  let q = sb().from('precio_historial').select('*').order('mes')
  if (itemId) q = q.eq('item_id', itemId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function upsertPrecioHistorial(itemId: string, mes: string, valor: number, moneda = 'ARS') {
  const { error } = await sb().from('precio_historial')
    .upsert({ item_id: itemId, mes, valor, moneda }, { onConflict: 'item_id,mes' })
  if (error) throw error
}
