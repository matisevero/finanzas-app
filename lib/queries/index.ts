import { createClient } from '@/lib/supabase/client'
import { añoMesDeFecha } from '@/lib/utils/formatters'
import type {
  Ingreso, IngresoInsert, Egreso, EgresoInsert,
  Deuda, DeudaInsert, PagoDeuda,
  Tarjeta, TarjetaInsert, TarjetaTransaccion, PagoTarjeta,
  TarjetaResumen, TarjetaResumenInsert, TarjetaPeriodoTotal, TarjetaPeriodoTotalInsert, Moneda,
  EventoCalendario, EventoInsert,
  Meta, MetaInsert, MetaAporte, MetaAporteInsert,
  Ahorro, AhorroInsert, AhorroAjuste, AhorroAjusteInsert,
  Proyecto, ProyectoInsert, ProyectoPresupuesto, ProyectoMovimientoManual, ProyectoMovimientoManualInsert,
  Etiqueta, EtiquetaInsert,
  PrecioItem, PrecioHistorial,
  SaldoInicial,
  CategoriaCustom, CategoriaCustomInsert,
  Persona, PersonaInsert,
  CalidadHallazgo, TipoHallazgo, EntidadHallazgo,
  MovimientoUnificado, TarjetaTransaccionVista,
} from '@/types'

const sb = () => createClient()
const uid = async () => {
  const { data: { user } } = await sb().auth.getUser()
  if (!user) throw new Error('No autenticado')
  return user.id
}

// ─── CATEGORIAS CUSTOM ────────────────────────────────────────────────────────
export async function getCategoriasCustom(modulo: string): Promise<CategoriaCustom[]> {
  const { data, error } = await sb()
    .from('categorias_custom')
    .select('*')
    .eq('modulo', modulo)
    .order('nombre')
  if (error) throw error
  const flat = data ?? []
  const map: Record<string, CategoriaCustom> = {}
  flat.forEach(c => { map[c.id] = { ...c, children: [] } })
  const roots: CategoriaCustom[] = []
  flat.forEach(c => {
    if (c.parent_id && map[c.parent_id]) {
      map[c.parent_id].children!.push(map[c.id])
    } else {
      roots.push(map[c.id])
    }
  })
  return roots
}

export async function createCategoriaCustom(form: CategoriaCustomInsert): Promise<CategoriaCustom> {
  const userId = await uid()
  const { data, error } = await sb()
    .from('categorias_custom')
    .insert({ ...form, user_id: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCategoriaCustom(id: string) {
  const { error } = await sb().from('categorias_custom').delete().eq('id', id)
  if (error) throw error
}

export async function updateCategoriaCustom(id: string, form: Partial<CategoriaCustomInsert>): Promise<CategoriaCustom> {
  const { data, error } = await sb().from('categorias_custom').update(form).eq('id', id).select().single()
  if (error) throw error
  return data
}

// ─── PERSONAS ("quién") ────────────────────────────────────────────────────────
export async function getPersonas(): Promise<Persona[]> {
  const { data, error } = await sb().from('personas').select('*').order('orden').order('nombre')
  if (error) throw error
  return data ?? []
}

export async function createPersona(form: PersonaInsert): Promise<Persona> {
  const userId = await uid()
  const { data, error } = await sb()
    .from('personas')
    .insert({ ...form, user_id: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function renombrarPersona(id: string, nombre: string): Promise<Persona> {
  const { data, error } = await sb().from('personas').update({ nombre }).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function reactivarPersona(id: string): Promise<Persona> {
  const { data, error } = await sb().from('personas').update({ estado: 'activa' }).eq('id', id).select().single()
  if (error) throw error
  return data
}

// Borra la persona solo si no tiene movimientos asociados (ingresos/egresos/tarjetas
// con quien = su nombre); si tiene, la archiva en su lugar. Archivada no aparece más
// para asociar movimientos nuevos, pero el historial existente la conserva tal cual.
export async function eliminarOArchivarPersona(persona: Persona): Promise<'eliminada' | 'archivada'> {
  const userId = await uid()
  const [ing, egr, tar] = await Promise.all([
    sb().from('ingresos').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('quien', persona.nombre),
    sb().from('egresos').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('quien', persona.nombre),
    sb().from('tarjetas').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('quien', persona.nombre),
  ])
  const tieneMovimientos = (ing.count ?? 0) > 0 || (egr.count ?? 0) > 0 || (tar.count ?? 0) > 0
  if (tieneMovimientos) {
    const { error } = await sb().from('personas').update({ estado: 'archivada' }).eq('id', persona.id)
    if (error) throw error
    return 'archivada'
  }
  const { error } = await sb().from('personas').delete().eq('id', persona.id)
  if (error) throw error
  return 'eliminada'
}

// ─── ETIQUETAS (across ingresos/egresos/deudas) ───────────────────────────────
export async function getEtiquetasDistintas(): Promise<string[]> {
  const userId = await uid()
  const [ing, egr, deu] = await Promise.all([
    sb().from('ingresos').select('etiqueta').eq('user_id', userId).not('etiqueta', 'is', null),
    sb().from('egresos').select('etiqueta').eq('user_id', userId).not('etiqueta', 'is', null),
    sb().from('deudas').select('etiqueta').eq('user_id', userId).not('etiqueta', 'is', null),
  ])
  const todas = [
    ...(ing.data ?? []).map(r => r.etiqueta),
    ...(egr.data ?? []).map(r => r.etiqueta),
    ...(deu.data ?? []).map(r => r.etiqueta),
  ].filter((e): e is string => !!e && e.trim().length > 0)
  return Array.from(new Set(todas)).sort()
}

export async function renombrarEtiqueta(vieja: string, nueva: string) {
  const userId = await uid()
  await Promise.all([
    sb().from('ingresos').update({ etiqueta: nueva }).eq('user_id', userId).eq('etiqueta', vieja),
    sb().from('egresos').update({ etiqueta: nueva }).eq('user_id', userId).eq('etiqueta', vieja),
    sb().from('deudas').update({ etiqueta: nueva }).eq('user_id', userId).eq('etiqueta', vieja),
  ])
}

export async function borrarEtiqueta(etiqueta: string) {
  const userId = await uid()
  await Promise.all([
    sb().from('ingresos').update({ etiqueta: null }).eq('user_id', userId).eq('etiqueta', etiqueta),
    sb().from('egresos').update({ etiqueta: null }).eq('user_id', userId).eq('etiqueta', etiqueta),
    sb().from('deudas').update({ etiqueta: null }).eq('user_id', userId).eq('etiqueta', etiqueta),
  ])
}

// ─── DESCRIPCIONES (para autocompletar, ordenadas por frecuencia real de uso) ─
export async function getDescripcionesDistintas(modulo: 'ingresos' | 'egresos' | 'eventos_calendario'): Promise<string[]> {
  const { data, error } = await sb().from(modulo).select('descripcion')
  if (error) throw error
  const counts: Record<string, number> = {}
  for (const row of (data ?? []) as any[]) {
    const desc = (row.descripcion as string)?.trim()
    if (!desc) continue
    counts[desc] = (counts[desc] ?? 0) + 1
  }
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])
}

// ─── FRECUENCIA DE CATEGORÍAS (para ordenar selectores por uso real) ──────────
export async function getFrecuenciaCategorias(modulo: 'ingresos' | 'egresos'): Promise<Record<string, number>> {
  const campo = modulo === 'ingresos' ? 'tipo' : 'categoria'
  const { data, error } = await sb().from(modulo).select(campo)
  if (error) throw error
  const counts: Record<string, number> = {}
  for (const row of (data ?? []) as any[]) {
    const key = row[campo] as string
    if (!key) continue
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

// ─── INGRESOS ─────────────────────────────────────────────────────────────────
export async function getIngresosByAño(año: number): Promise<Ingreso[]> {
  const { data, error } = await sb().from('ingresos').select('*').eq('año', año).order('fecha', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createIngreso(form: IngresoInsert): Promise<Ingreso> {
  const userId = await uid()
  const { año, mes } = añoMesDeFecha(form.fecha)
  const { data, error } = await sb().from('ingresos')
    .insert({ ...form, user_id: userId, año, mes })
    .select().single()
  if (error) throw error
  return data
}

export async function updateIngreso(id: string, form: Partial<IngresoInsert>): Promise<Ingreso> {
  const updates: Record<string, unknown> = { ...form }
  if (form.fecha) {
    const { año, mes } = añoMesDeFecha(form.fecha)
    updates.año = año
    updates.mes = mes
  }
  const { data, error } = await sb().from('ingresos').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteIngreso(id: string) {
  const { error } = await sb().from('ingresos').delete().eq('id', id)
  if (error) throw error
}

// ─── EGRESOS ─────────────────────────────────────────────────────────────────
export async function getEgresosByAño(año: number): Promise<Egreso[]> {
  const { data, error } = await sb().from('egresos').select('*').eq('año', año).order('fecha', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createEgreso(form: EgresoInsert): Promise<Egreso> {
  const userId = await uid()
  const { año, mes } = añoMesDeFecha(form.fecha)
  const { data, error } = await sb().from('egresos')
    .insert({ ...form, user_id: userId, año, mes })
    .select().single()
  if (error) throw error
  return data
}

export async function updateEgreso(id: string, form: Partial<EgresoInsert>): Promise<Egreso> {
  const updates: Record<string, unknown> = { ...form }
  if (form.fecha) {
    const { año, mes } = añoMesDeFecha(form.fecha)
    updates.año = año
    updates.mes = mes
  }
  const { data, error } = await sb().from('egresos').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteEgreso(id: string) {
  const { error } = await sb().from('egresos').delete().eq('id', id)
  if (error) throw error
}

// Todos los ingresos/egresos del usuario, sin acotar a un año — usado por Ahorro general
// (el ahorro acumulado es historico, no algo que deba resetear cada año).
export async function getAllIngresos(): Promise<Ingreso[]> {
  const { data, error } = await sb().from('ingresos').select('*').order('fecha', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getAllEgresos(): Promise<Egreso[]> {
  const { data, error } = await sb().from('egresos').select('*').order('fecha', { ascending: false })
  if (error) throw error
  return data ?? []
}

// ─── DEUDAS ──────────────────────────────────────────────────────────────────
export async function getDeudas(): Promise<Deuda[]> {
  const { data, error } = await sb().from('deudas').select('*').eq('activa', true).order('created_at')
  if (error) throw error
  return data ?? []
}

// Para saber si un período de tarjeta ya está "cerrado" (ya se generó su Deuda) —
// sin importar si esa deuda ya se pagó (activa=false) o no.
export async function getDeudaDeTarjetaPeriodo(tarjetaId: string, año: number, mes: number): Promise<Deuda | null> {
  const { data, error } = await sb().from('deudas').select('*')
    .eq('tarjeta_id', tarjetaId).eq('periodo_año', año).eq('periodo_mes', mes).maybeSingle()
  if (error) throw error
  return data
}

export async function createDeuda(form: DeudaInsert): Promise<Deuda> {
  const userId = await uid()
  const { data, error } = await sb().from('deudas').insert({ ...form, user_id: userId }).select().single()
  if (error) throw error
  const { error: eErr } = await sb().from('etiquetas').insert({ user_id: userId, nombre: data.nombre, tipo: 'deuda', deuda_id: data.id })
  if (eErr) throw eErr
  return data
}

export async function updateDeuda(id: string, updates: Partial<DeudaInsert>): Promise<Deuda> {
  const { data, error } = await sb().from('deudas').update(updates).eq('id', id).select().single()
  if (error) throw error
  if (updates.nombre) {
    const { error: eErr } = await sb().from('etiquetas').update({ nombre: updates.nombre }).eq('deuda_id', id)
    if (eErr) throw eErr
  }
  return data
}

export async function deleteDeuda(id: string): Promise<void> {
  const { error } = await sb().from('deudas').delete().eq('id', id)
  if (error) throw error
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

export async function createTarjeta(form: Partial<TarjetaInsert>): Promise<Tarjeta> {
  const userId = await uid()
  const { data, error } = await sb().from('tarjetas').insert({ ...form, user_id: userId, activa: true }).select().single()
  if (error) throw error
  return data
}

export async function updateTarjeta(id: string, updates: Partial<TarjetaInsert>): Promise<Tarjeta> {
  const { data, error } = await sb().from('tarjetas').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

// Igual criterio que Personas/Proyectos: si tiene transacciones u otra data vinculada, se
// archiva (activa=false, ya no aparece pero el historial queda intacto); si está limpia, se borra.
export async function eliminarOArchivarTarjeta(id: string): Promise<'eliminada' | 'archivada'> {
  const [txns, pagos] = await Promise.all([
    sb().from('tarjeta_transacciones').select('id', { count: 'exact', head: true }).eq('tarjeta_id', id),
    sb().from('pagos_tarjeta').select('id', { count: 'exact', head: true }).eq('tarjeta_id', id),
  ])
  const tieneData = (txns.count ?? 0) > 0 || (pagos.count ?? 0) > 0
  if (tieneData) {
    const { error } = await sb().from('tarjetas').update({ activa: false }).eq('id', id)
    if (error) throw error
    return 'archivada'
  }
  const { error } = await sb().from('tarjetas').delete().eq('id', id)
  if (error) throw error
  return 'eliminada'
}

export async function getTarjetaTransacciones(tarjetaId?: string): Promise<TarjetaTransaccion[]> {
  let q = sb().from('tarjeta_transacciones').select('*').order('fecha', { ascending: false })
  if (tarjetaId) q = q.eq('tarjeta_id', tarjetaId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function createTarjetaTransaccion(form: Omit<TarjetaTransaccion, 'id' | 'created_at'>): Promise<TarjetaTransaccion> {
  const { data, error } = await sb().from('tarjeta_transacciones').insert(form).select().single()
  if (error) throw error
  return data
}

export async function updateTarjetaTransaccion(id: string, form: Partial<Omit<TarjetaTransaccion, 'id'>>): Promise<TarjetaTransaccion> {
  const { data, error } = await sb().from('tarjeta_transacciones').update(form).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteTarjetaTransaccion(id: string) {
  const { error } = await sb().from('tarjeta_transacciones').delete().eq('id', id)
  if (error) throw error
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

// ─── TOTAL DECLARADO POR PERÍODO (reemplaza a la conciliación contra PDF) ────
// El número que decís vos que dice el resumen, por tarjeta+período+moneda — se compara contra
// la suma real del detalle cargado (item por item / pegar bloque) para avisar si no coincide.
export async function getTarjetaPeriodoTotales(tarjetaId: string, año: number, mes: number): Promise<TarjetaPeriodoTotal[]> {
  const { data, error } = await sb().from('tarjeta_periodo_totales')
    .select('*').eq('tarjeta_id', tarjetaId).eq('año', año).eq('mes', mes)
  if (error) throw error
  return data ?? []
}

// Todos los totales declarados del usuario, sin filtrar por tarjeta ni período — para armar
// el widget de Vencimientos (que muestra todas las tarjetas juntas) sin tener que pedir
// tarjeta por tarjeta.
export async function getTarjetaPeriodoTotalesTodos(): Promise<TarjetaPeriodoTotal[]> {
  const { data, error } = await sb().from('tarjeta_periodo_totales').select('*')
  if (error) throw error
  return data ?? []
}

export async function upsertTarjetaPeriodoTotal(form: TarjetaPeriodoTotalInsert): Promise<TarjetaPeriodoTotal> {
  const { data, error } = await sb().from('tarjeta_periodo_totales')
    .upsert(form, { onConflict: 'tarjeta_id,año,mes,moneda' }).select().single()
  if (error) throw error
  return data
}

// Genera (o actualiza) el ítem de Deuda del período — botón manual "Generar deuda". Upsertea
// por (tarjeta_id, período), así que si lo volvés a tocar después de cargar más movimientos
// actualiza el mismo ítem en vez de duplicarlo.
export async function generarDeudaDesdeTarjeta(
  tarjeta: Tarjeta, año: number, mes: number, total: number, moneda: Moneda, fechaVencimiento: string
): Promise<Deuda> {
  const { data: existente } = await sb().from('deudas')
    .select('*').eq('tarjeta_id', tarjeta.id).eq('periodo_año', año).eq('periodo_mes', mes).maybeSingle()

  if (existente) {
    const cambioMonto = Math.abs(existente.total_original - total) > 1
    const { data, error } = await sb().from('deudas').update({
      total_original: total, pendiente: total,
      monto_antes_ajuste: cambioMonto ? existente.total_original : existente.monto_antes_ajuste,
      fecha_vencimiento: fechaVencimiento,
    }).eq('id', existente.id).select().single()
    if (error) throw error
    return data
  }

  return createDeuda({
    nombre: `${tarjeta.nombre} — ${String(mes).padStart(2, '0')}/${año}`,
    banco: tarjeta.banco, total_original: total, pendiente: total, cuota_mensual: total,
    tasa_interes: 0, moneda, fecha_inicio: fechaVencimiento, fecha_vencimiento: fechaVencimiento,
    cuota_actual: 1, cuota_total: 1, color: tarjeta.color, activa: true,
    tarjeta_id: tarjeta.id, periodo_año: año, periodo_mes: mes,
  } as DeudaInsert)
}

// ─── ETIQUETAS DE TRANSACCIONES DE TARJETA ───────────────────────────────────
export async function getTarjetaTransaccionEtiquetas(): Promise<{ transaccion_id: string; etiqueta_id: string }[]> {
  const { data, error } = await sb().from('tarjeta_transaccion_etiquetas').select('*')
  if (error) throw error
  return data ?? []
}

export async function setEtiquetasDeTarjetaTransaccion(transaccionId: string, etiquetaIds: string[]) {
  const { error: delErr } = await sb().from('tarjeta_transaccion_etiquetas').delete().eq('transaccion_id', transaccionId)
  if (delErr) throw delErr
  if (etiquetaIds.length === 0) return
  const { error } = await sb().from('tarjeta_transaccion_etiquetas').insert(etiquetaIds.map(etiqueta_id => ({ transaccion_id: transaccionId, etiqueta_id })))
  if (error) throw error
}

// ─── EVENTOS CALENDARIO ──────────────────────────────────────────────────────
export async function getEventosByMes(año: number, mes: number): Promise<EventoCalendario[]> {
  const { data, error } = await sb().from('eventos_calendario')
    .select('*').eq('año', año).eq('mes', mes).order('dia')
  if (error) throw error
  return data ?? []
}

export async function getEventosByAño(año: number): Promise<EventoCalendario[]> {
  const { data, error } = await sb().from('eventos_calendario')
    .select('*').eq('año', año).order('mes').order('dia')
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

export async function deleteEvento(id: string): Promise<void> {
  const { error } = await sb().from('eventos_calendario').delete().eq('id', id)
  if (error) throw error
}
export async function togglePagado(id: string, pagado: boolean) {
  const { error } = await sb().from('eventos_calendario').update({ pagado }).eq('id', id)
  if (error) throw error
}

// Marcar evento como pagado + crear egreso vinculado
export async function pagarEvento(ev: {
  id: string; descripcion: string; monto: number; moneda: string;
  dia: number; mes: number; año: number; tipo: string;
}): Promise<void> {
  const userId = await uid()
  const fecha = `${ev.año}-${String(ev.mes).padStart(2,'0')}-${String(ev.dia).padStart(2,'0')}`
  const { data: egreso, error: errEg } = await sb().from('egresos')
    .insert({
      user_id: userId,
      año: ev.año,
      mes: ev.mes,
      categoria: ev.tipo === 'tarjeta' ? 'tarjeta'
                : ev.tipo === 'casa'    ? 'casa'
                : ev.tipo === 'servicio'? 'servicios'
                : ev.tipo === 'expensa' ? 'expensas'
                : ev.tipo === 'edu'     ? 'educacion'
                : 'otro',
      descripcion: ev.descripcion,
      monto: ev.monto,
      moneda: ev.moneda,
      fecha,
      quien: 'ambos',
      recurrente: false,
    })
    .select('id')
    .single()
  if (errEg) throw errEg
  const { error: errEv } = await sb().from('eventos_calendario')
    .update({ pagado: true, egreso_id: egreso.id })
    .eq('id', ev.id)
  if (errEv) throw errEv
}

// Marcar una Devolución como recibida: crea el Ingreso correspondiente (a diferencia de un
// vencimiento normal, que crea un Egreso) y lo linkea vía ingreso_id.
export async function recibirDevolucion(ev: {
  id: string; descripcion: string; monto: number; moneda: string;
  dia: number; mes: number; año: number;
}): Promise<void> {
  const userId = await uid()
  const fecha = `${ev.año}-${String(ev.mes).padStart(2,'0')}-${String(ev.dia).padStart(2,'0')}`
  const { data: ingreso, error: errIng } = await sb().from('ingresos')
    .insert({
      user_id: userId, año: ev.año, mes: ev.mes,
      tipo: 'otro', descripcion: ev.descripcion, monto: ev.monto, moneda: ev.moneda,
      fecha, quien: 'ambos', recurrente: false,
    })
    .select('id')
    .single()
  if (errIng) throw errIng
  const { error: errEv } = await sb().from('eventos_calendario')
    .update({ pagado: true, ingreso_id: ingreso.id })
    .eq('id', ev.id)
  if (errEv) throw errEv
}

// Desmarcar una Devolución + eliminar el ingreso vinculado
export async function descartarDevolucion(id: string, ingresoId: string | null | undefined): Promise<void> {
  if (ingresoId) {
    await sb().from('ingresos').delete().eq('id', ingresoId)
  }
  const { error } = await sb().from('eventos_calendario')
    .update({ pagado: false, ingreso_id: null })
    .eq('id', id)
  if (error) throw error
}

// Desmarcar evento como pagado + eliminar egreso vinculado
export async function despagarEvento(id: string, egresoId: string | null | undefined): Promise<void> {
  if (egresoId) {
    await sb().from('egresos').delete().eq('id', egresoId)
  }
  const { error } = await sb().from('eventos_calendario')
    .update({ pagado: false, egreso_id: null })
    .eq('id', id)
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

// Igual que Ahorro: crea la Meta y, junto con ella, su etiqueta 1 a 1 (tipo 'meta') —
// disponible de entrada para asociar movimientos desde el kebab.
export async function createMeta(form: MetaInsert): Promise<Meta> {
  const userId = await uid()
  const { data, error } = await sb().from('metas').insert({ ...form, user_id: userId }).select().single()
  if (error) throw error
  const { error: eErr } = await sb().from('etiquetas').insert({ user_id: userId, nombre: data.nombre, tipo: 'meta', meta_id: data.id })
  if (eErr) throw eErr
  return data
}

export async function updateMeta(id: string, updates: Partial<MetaInsert>): Promise<Meta> {
  const { data, error } = await sb().from('metas').update(updates).eq('id', id).select().single()
  if (error) throw error
  if (updates.nombre) {
    const { error: eErr } = await sb().from('etiquetas').update({ nombre: updates.nombre }).eq('meta_id', id)
    if (eErr) throw eErr
  }
  return data
}

// La etiqueta (y sus asociaciones a movimientos) se borra sola por ON DELETE CASCADE,
// igual que con Ahorro — no hace falta limpiarla a mano. Los aportes también cascadean.
export async function deleteMeta(id: string) {
  const { error } = await sb().from('metas').delete().eq('id', id)
  if (error) throw error
}

// ─── Historial de aportes a una Meta ─────────────────────────────────────────
export async function getMetaAportes(metaId?: string): Promise<MetaAporte[]> {
  let q = sb().from('meta_aportes').select('*').order('fecha', { ascending: false })
  if (metaId) q = q.eq('meta_id', metaId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function createMetaAporte(form: MetaAporteInsert): Promise<MetaAporte> {
  const { data, error } = await sb().from('meta_aportes').insert(form).select().single()
  if (error) throw error
  return data
}

export async function deleteMetaAporte(id: string) {
  const { error } = await sb().from('meta_aportes').delete().eq('id', id)
  if (error) throw error
}

export async function updateMetaAporte(id: string, form: Partial<MetaAporteInsert>): Promise<MetaAporte> {
  const { data, error } = await sb().from('meta_aportes').update(form).eq('id', id).select().single()
  if (error) throw error
  return data
}

// Mismo motivo que `sincronizarAjusteManualAhorro`: recalcula `monto_actual` sumando los
// meta_aportes reales con una consulta fresca, en vez de "valor actual + delta" desde estado
// de React que puede estar desactualizado.
export async function sincronizarMontoActualMeta(metaId: string, montoObjetivo: number): Promise<number> {
  const aportes = await getMetaAportes(metaId)
  const suma = Math.max(0, Math.min(montoObjetivo, aportes.reduce((s, a) => s + a.monto, 0)))
  await updateMeta(metaId, { monto_actual: suma, completada: suma >= montoObjetivo })
  return suma
}

// ─── AHORROS ─────────────────────────────────────────────────────────────────
export async function getAhorros(): Promise<Ahorro[]> {
  const { data, error } = await sb().from('ahorros').select('*').order('created_at')
  if (error) throw error
  return data ?? []
}

// Crea el Ahorro y, junto con él, su etiqueta 1 a 1 (tipo 'ahorro') — así queda
// disponible de entrada para asociar movimientos, sin un paso manual aparte.
export async function createAhorro(form: AhorroInsert): Promise<Ahorro> {
  const userId = await uid()
  const { data, error } = await sb().from('ahorros').insert({ ...form, user_id: userId }).select().single()
  if (error) throw error
  const { error: eErr } = await sb().from('etiquetas').insert({ user_id: userId, nombre: data.nombre, tipo: 'ahorro', ahorro_id: data.id })
  if (eErr) throw eErr
  return data
}

// Si cambia el nombre, la etiqueta del ahorro se renombra en el mismo movimiento —
// el chip en los movimientos etiquetados se actualiza solo.
export async function updateAhorro(id: string, updates: Partial<AhorroInsert>): Promise<Ahorro> {
  const { data, error } = await sb().from('ahorros').update(updates).eq('id', id).select().single()
  if (error) throw error
  if (updates.nombre) {
    const { error: eErr } = await sb().from('etiquetas').update({ nombre: updates.nombre }).eq('ahorro_id', id)
    if (eErr) throw eErr
  }
  return data
}

// Al borrar el Ahorro, su etiqueta (y las asociaciones a movimientos que tenía) se
// borran solas por ON DELETE CASCADE — no hace falta limpiarlas a mano acá.
export async function deleteAhorro(id: string) {
  const { error } = await sb().from('ahorros').delete().eq('id', id)
  if (error) throw error
}

export async function archivarAhorro(id: string, archivar: boolean) {
  const { error } = await sb().from('etiquetas').update({ estado: archivar ? 'archivada' : 'activa' }).eq('ahorro_id', id)
  if (error) throw error
}

// ─── Historial de ajustes manuales a un Ahorro ───────────────────────────────
export async function getAhorroAjustes(ahorroId?: string): Promise<AhorroAjuste[]> {
  let q = sb().from('ahorro_ajustes').select('*').order('fecha', { ascending: false })
  if (ahorroId) q = q.eq('ahorro_id', ahorroId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function createAhorroAjuste(form: AhorroAjusteInsert): Promise<AhorroAjuste> {
  const { data, error } = await sb().from('ahorro_ajustes').insert(form).select().single()
  if (error) throw error
  return data
}

export async function deleteAhorroAjuste(id: string) {
  const { error } = await sb().from('ahorro_ajustes').delete().eq('id', id)
  if (error) throw error
}

export async function updateAhorroAjuste(id: string, form: Partial<AhorroAjusteInsert>): Promise<AhorroAjuste> {
  const { data, error } = await sb().from('ahorro_ajustes').update(form).eq('id', id).select().single()
  if (error) throw error
  return data
}

// `ajuste_manual` es un total cacheado en Ahorro para no tener que sumar ahorro_ajustes en
// cada render de una lista. El bug real: varios puntos del código lo actualizaban calculando
// "valor actual + delta" a partir de un `ahorro` que puede venir desactualizado del estado de
// React (ediciones/creaciones rápidas sucesivas, o un array de ahorros pasado a una función que
// no se refrescó entre pasos) — eso desincroniza el cache del historial real, sin ningún error
// visible. Esta función siempre recalcula sumando los ahorro_ajustes reales con una consulta
// fresca a la base (no un valor de estado), así el resultado nunca puede arrastrar un desvío.
export async function sincronizarAjusteManualAhorro(ahorroId: string): Promise<number> {
  const ajustes = await getAhorroAjustes(ahorroId)
  const suma = ajustes.reduce((s, a) => s + a.monto, 0)
  await updateAhorro(ahorroId, { ajuste_manual: suma })
  return suma
}

// ─── Aporte automático al asociar/desasociar un movimiento a Ahorro o Meta ───
// Se llama después de guardar el nuevo set de etiquetas de un movimiento. Compara
// idsAntes vs idsDespues: lo que se agregó suma (o resta, según `signo`), lo que se
// sacó revierte. Solo actúa si la moneda del movimiento coincide con la del
// Ahorro/Meta — si no coincide, no hace nada (para eso existe el flujo de
// conversión que ya tenía Ahorro, sin tocar). Deja registro en el historial
// correspondiente (ahorro_ajustes / meta_aportes), nunca "silencioso".
export async function aplicarContribucionPorEtiquetas(params: {
  idsAntes: string[]; idsDespues: string[]; etiquetas: Etiqueta[]
  ahorros: Ahorro[]; metas: Meta[]
  monto: number; moneda: Moneda; fecha: string
  signo: 1 | -1 // +1 egreso/tarjeta (contribuye), -1 ingreso (retiro/reembolso)
  nota?: string
}) {
  const { idsAntes, idsDespues, etiquetas, ahorros, metas, monto, moneda, fecha, signo, nota } = params
  const agregados = idsDespues.filter(id => !idsAntes.includes(id))
  const quitados  = idsAntes.filter(id => !idsDespues.includes(id))

  const aplicar = async (id: string, factor: 1 | -1, notaExtra: string) => {
    const et = etiquetas.find(e => e.id === id)
    if (!et) return
    if (et.tipo === 'ahorro' && et.ahorro_id) {
      const ahorro = ahorros.find(a => a.id === et.ahorro_id)
      if (!ahorro || ahorro.moneda !== moneda) return
      const delta = factor * signo * monto
      await createAhorroAjuste({ ahorro_id: ahorro.id, monto: delta, fecha, nota: (nota ?? 'Movimiento asociado') + notaExtra })
      await sincronizarAjusteManualAhorro(ahorro.id)
    }
    if (et.tipo === 'meta' && et.meta_id) {
      const meta = metas.find(x => x.id === et.meta_id)
      if (!meta || meta.moneda !== moneda) return
      const delta = factor * signo * monto
      await createMetaAporte({ meta_id: meta.id, monto: delta, fecha, nota: (nota ?? 'Movimiento asociado') + notaExtra })
      await sincronizarMontoActualMeta(meta.id, meta.monto_objetivo)
    }
  }

  for (const id of agregados) await aplicar(id, 1, '')
  for (const id of quitados)  await aplicar(id, -1, ' (desasociado)')
}

// ─── PROYECTOS ───────────────────────────────────────────────────────────────
export async function getProyectos(): Promise<Proyecto[]> {
  const { data, error } = await sb().from('proyectos').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function asegurarEtiquetaDeDeuda(deudaId: string, nombre: string): Promise<{ id: string }> {
  const { data: existente } = await sb().from('etiquetas').select('id').eq('deuda_id', deudaId).maybeSingle()
  if (existente) return existente
  const userId = await uid()
  const { data, error } = await sb().from('etiquetas').insert({ user_id: userId, nombre, tipo: 'deuda', deuda_id: deudaId }).select('id').single()
  if (error) throw error
  return data
}

export async function createProyecto(form: ProyectoInsert): Promise<Proyecto> {
  const userId = await uid()
  const { data, error } = await sb().from('proyectos').insert({ ...form, user_id: userId }).select().single()
  if (error) throw error
  const { error: eErr } = await sb().from('etiquetas').insert({ user_id: userId, nombre: data.nombre, tipo: 'proyecto', proyecto_id: data.id })
  if (eErr) throw eErr
  return data
}

export async function updateProyecto(id: string, updates: Partial<ProyectoInsert>): Promise<Proyecto> {
  const { data, error } = await sb().from('proyectos').update(updates).eq('id', id).select().single()
  if (error) throw error
  if (updates.nombre) {
    const { error: eErr } = await sb().from('etiquetas').update({ nombre: updates.nombre }).eq('proyecto_id', id)
    if (eErr) throw eErr
  }
  return data
}

export async function deleteProyecto(id: string) {
  const { error } = await sb().from('proyectos').delete().eq('id', id)
  if (error) throw error
}

export async function archivarProyecto(id: string, archivar: boolean) {
  const { error } = await sb().from('etiquetas').update({ estado: archivar ? 'archivada' : 'activa' }).eq('proyecto_id', id)
  if (error) throw error
}

// ─── PROYECTOS: presupuesto por moneda ───────────────────────────────────────
export async function getProyectoPresupuestos(): Promise<ProyectoPresupuesto[]> {
  const { data, error } = await sb().from('proyecto_presupuestos').select('*')
  if (error) throw error
  return data ?? []
}

// Reemplaza el set completo de presupuestos de un proyecto (una fila por moneda).
export async function setPresupuestosDeProyecto(proyectoId: string, presupuestos: { moneda: Moneda; monto: number }[]) {
  const { error: delErr } = await sb().from('proyecto_presupuestos').delete().eq('proyecto_id', proyectoId)
  if (delErr) throw delErr
  const filas = presupuestos.filter(p => p.monto > 0)
  if (filas.length === 0) return
  const { error } = await sb().from('proyecto_presupuestos').insert(filas.map(p => ({ proyecto_id: proyectoId, moneda: p.moneda, monto: p.monto })))
  if (error) throw error
}

// ─── PROYECTOS: movimientos manuales (estimado/pendiente, todavía sin Egreso) ─
export async function getProyectoMovimientosManuales(proyectoId?: string): Promise<ProyectoMovimientoManual[]> {
  let q = sb().from('proyecto_movimientos_manuales').select('*').order('fecha', { ascending: false })
  if (proyectoId) q = q.eq('proyecto_id', proyectoId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function createProyectoMovimientoManual(form: ProyectoMovimientoManualInsert): Promise<ProyectoMovimientoManual> {
  const { data, error } = await sb().from('proyecto_movimientos_manuales').insert(form).select().single()
  if (error) throw error
  return data
}

export async function updateProyectoMovimientoManual(id: string, updates: Partial<ProyectoMovimientoManualInsert>): Promise<ProyectoMovimientoManual> {
  const { data, error } = await sb().from('proyecto_movimientos_manuales').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteProyectoMovimientoManual(id: string) {
  const { error } = await sb().from('proyecto_movimientos_manuales').delete().eq('id', id)
  if (error) throw error
}

// ─── ETIQUETAS ───────────────────────────────────────────────────────────────
export async function getEtiquetas(): Promise<Etiqueta[]> {
  const { data, error } = await sb().from('etiquetas').select('*').order('created_at')
  if (error) throw error
  return data ?? []
}

export async function createEtiquetaLibre(nombre: string, color: string): Promise<Etiqueta> {
  const userId = await uid()
  const { data, error } = await sb().from('etiquetas').insert({ user_id: userId, nombre, tipo: 'libre', color }).select().single()
  if (error) throw error
  return data
}

export async function updateEtiquetaLibre(id: string, updates: { nombre?: string; color?: string }): Promise<Etiqueta> {
  const { data, error } = await sb().from('etiquetas').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

// Cascade delete en movimiento_etiquetas está garantizado por la FK — al borrar
// una etiqueta libre desaparece de todos los movimientos que la tenían.
export async function deleteEtiqueta(id: string) {
  const { error } = await sb().from('etiquetas').delete().eq('id', id)
  if (error) throw error
}

// Todas las relaciones movimiento↔etiqueta en un solo fetch (evita N+1 al pintar
// chips en tablas largas). Se combinan en memoria con getEtiquetas().
export async function getIngresoEtiquetas(): Promise<{ ingreso_id: string; etiqueta_id: string }[]> {
  const { data, error } = await sb().from('ingreso_etiquetas').select('*')
  if (error) throw error
  return data ?? []
}

export async function getEgresoEtiquetas(): Promise<{ egreso_id: string; etiqueta_id: string }[]> {
  const { data, error } = await sb().from('egreso_etiquetas').select('*')
  if (error) throw error
  return data ?? []
}

// Reemplaza el set completo de etiquetas de un movimiento (lo que confirma el
// picker multi-select) — borra las relaciones viejas y crea las nuevas.
export async function setEtiquetasDeIngreso(ingresoId: string, etiquetaIds: string[]) {
  const { error: delErr } = await sb().from('ingreso_etiquetas').delete().eq('ingreso_id', ingresoId)
  if (delErr) throw delErr
  if (etiquetaIds.length === 0) return
  const { error } = await sb().from('ingreso_etiquetas').insert(etiquetaIds.map(etiqueta_id => ({ ingreso_id: ingresoId, etiqueta_id })))
  if (error) throw error
}

export async function setEtiquetasDeEgreso(egresoId: string, etiquetaIds: string[]) {
  const { error: delErr } = await sb().from('egreso_etiquetas').delete().eq('egreso_id', egresoId)
  if (delErr) throw delErr
  if (etiquetaIds.length === 0) return
  const { error } = await sb().from('egreso_etiquetas').insert(etiquetaIds.map(etiqueta_id => ({ egreso_id: egresoId, etiqueta_id })))
  if (error) throw error
}

// Agrega UNA etiqueta a un movimiento sin tocar las que ya tenga (a diferencia de
// setEtiquetasDeIngreso/Egreso, que reemplazan todo el set). Usado para vincular un
// ingreso/egreso YA existente a una Deuda LP, por ejemplo.
export async function agregarEtiquetaAIngreso(ingresoId: string, etiquetaId: string) {
  const { error } = await sb().from('ingreso_etiquetas').upsert({ ingreso_id: ingresoId, etiqueta_id: etiquetaId })
  if (error) throw error
}
export async function agregarEtiquetaAEgreso(egresoId: string, etiquetaId: string) {
  const { error } = await sb().from('egreso_etiquetas').upsert({ egreso_id: egresoId, etiqueta_id: etiquetaId })
  if (error) throw error
}
export async function quitarEtiquetaDeEgreso(egresoId: string, etiquetaId: string) {
  const { error } = await sb().from('egreso_etiquetas').delete().eq('egreso_id', egresoId).eq('etiqueta_id', etiquetaId)
  if (error) throw error
}

export async function getEgresosPorEtiqueta(etiquetaId: string): Promise<Egreso[]> {
  const { data, error } = await sb().from('egreso_etiquetas').select('egresos(*)').eq('etiqueta_id', etiquetaId)
  if (error) throw error
  return ((data ?? []).map((r: any) => r.egresos).filter(Boolean)) as Egreso[]
}

export async function getIngresosPorEtiqueta(etiquetaId: string): Promise<Ingreso[]> {
  const { data, error } = await sb().from('ingreso_etiquetas').select('ingresos(*)').eq('etiqueta_id', etiquetaId)
  if (error) throw error
  return ((data ?? []).map((r: any) => r.ingresos).filter(Boolean)) as Ingreso[]
}

// ─── PRECIOS ─────────────────────────────────────────────────────────────────
export async function getPrecioItems(): Promise<PrecioItem[]> {
  const { data, error } = await sb().from('precio_items').select('*').order('nombre')
  if (error) throw error
  return data ?? []
}

export async function updatePrecioItem(id: string, updates: { nombre?: string; categoria?: string; icono?: string }): Promise<PrecioItem> {
  const { data, error } = await sb().from('precio_items').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function archivarPrecioItem(id: string, archivar: boolean) {
  const { error } = await sb().from('precio_items').update({ archivado: archivar }).eq('id', id)
  if (error) throw error
}

// Borra el ítem y, en cascada, todo su historial de precios (no toca los Egresos
// que puedan haber quedado vinculados — esos siguen intactos, solo se corta el link).
export async function deletePrecioItem(id: string) {
  const { error } = await sb().from('precio_items').delete().eq('id', id)
  if (error) throw error
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

// ─── TARJETA COMERCIOS (aprendizaje) ─────────────────────────────────────────
export interface TarjetaComercio {
  id: string
  user_id: string
  descripcion_raw: string
  descripcion_limpia: string | null
  categoria: string
  tarjeta_id: string | null
  ultimos_4: string | null
  red: string | null
  banco: string | null
  quien: string | null
  created_at: string
  updated_at: string
}

export async function getTarjetasComercios(): Promise<TarjetaComercio[]> {
  const userId = await uid()
  const { data, error } = await sb()
    .from('tarjeta_comercios')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function upsertTarjetaComercio(row: Omit<TarjetaComercio, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<void> {
  const userId = await uid()
  const { error } = await sb()
    .from('tarjeta_comercios')
    .upsert(
      { ...row, user_id: userId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,descripcion_raw' }
    )
  if (error) throw error
}

export async function upsertTarjetaComercios(rows: Omit<TarjetaComercio, 'id' | 'user_id' | 'created_at' | 'updated_at'>[]): Promise<void> {
  const userId = await uid()
  const toUpsert = rows.map(r => ({ ...r, user_id: userId, updated_at: new Date().toISOString() }))
  const { error } = await sb()
    .from('tarjeta_comercios')
    .upsert(toUpsert, { onConflict: 'user_id,descripcion_raw' })
  if (error) throw error
}

// ─── SALUD DE LOS DATOS ───────────────────────────────────────────────────────
export async function getCalidadHallazgosPendientes(todos = false): Promise<CalidadHallazgo[]> {
  let q = sb().from('calidad_hallazgos').select('*').order('detectado_en', { ascending: true })
  if (!todos) q = q.eq('estado', 'pendiente')
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function crearHallazgoSiNoExiste(h: { tipo: TipoHallazgo; entidad: EntidadHallazgo; entidad_id: string; entidad_id_2: string | null }) {
  const userId = await uid()
  const { error } = await sb().from('calidad_hallazgos').insert({ ...h, user_id: userId })
  if (error) throw error
}

export async function descartarHallazgo(id: string) {
  const { error } = await sb().from('calidad_hallazgos').update({ estado: 'descartado' }).eq('id', id)
  if (error) throw error
}

export async function resolverHallazgo(id: string) {
  const { error } = await sb().from('calidad_hallazgos').update({ estado: 'resuelto' }).eq('id', id)
  if (error) throw error
}

// Borra un hallazgo que ya no reproduce el criterio actual de detección (cambió la
// lógica, o el movimiento ya tiene etiqueta puesta desde otro lado) — no es una
// acción del usuario, es limpieza automática del propio motor de análisis.
export async function eliminarHallazgo(id: string) {
  const { error } = await sb().from('calidad_hallazgos').delete().eq('id', id)
  if (error) throw error
}

export async function getUltimoAnalisisCalidad(): Promise<string | null> {
  const userId = await uid()
  const { data } = await sb().from('calidad_meta').select('ultimo_analisis_at').eq('user_id', userId).maybeSingle()
  return data?.ultimo_analisis_at ?? null
}

export async function marcarAnalisisCalidadEjecutado() {
  const userId = await uid()
  const { error } = await sb().from('calidad_meta').upsert({ user_id: userId, ultimo_analisis_at: new Date().toISOString() })
  if (error) throw error
}

// ─── Consola de "Todos los movimientos" — paginación real contra la base ────
type OrdenCampo = 'fecha' | 'monto'
type FiltrosMovs = { tipo?: 'ingreso' | 'egreso' | 'todos'; categoria?: string; etiquetaId?: string; search?: string }

function aplicarFiltrosMovs(q: any, f: FiltrosMovs) {
  if (f.tipo && f.tipo !== 'todos') q = q.eq('tipo_movimiento', f.tipo)
  if (f.categoria) q = q.eq('categoria', f.categoria)
  if (f.etiquetaId) q = q.contains('etiqueta_ids', [f.etiquetaId])
  if (f.search) q = q.ilike('descripcion', `%${f.search}%`)
  return q
}
function aplicarFiltrosTarjeta(q: any, f: Omit<FiltrosMovs, 'tipo'>) {
  if (f.categoria) q = q.eq('categoria', f.categoria)
  if (f.etiquetaId) q = q.contains('etiqueta_ids', [f.etiquetaId])
  if (f.search) q = q.ilike('descripcion', `%${f.search}%`)
  return q
}

export async function getMovimientosUnificados(params: FiltrosMovs & {
  page: number; pageSize: number; ordenCampo?: OrdenCampo; ordenAsc?: boolean
}): Promise<{ rows: MovimientoUnificado[]; total: number }> {
  const { page, pageSize, ordenCampo = 'fecha', ordenAsc = false, ...filtros } = params
  let q = aplicarFiltrosMovs(sb().from('movimientos_unificados').select('*', { count: 'exact' }), filtros)
  const from = page * pageSize, to = from + pageSize - 1
  const { data, error, count } = await q.order(ordenCampo, { ascending: ordenAsc }).range(from, to)
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

export async function getTarjetaTransaccionesVista(params: Omit<FiltrosMovs, 'tipo'> & {
  page: number; pageSize: number; ordenCampo?: OrdenCampo; ordenAsc?: boolean
}): Promise<{ rows: TarjetaTransaccionVista[]; total: number }> {
  const { page, pageSize, ordenCampo = 'fecha', ordenAsc = false, ...filtros } = params
  let q = aplicarFiltrosTarjeta(sb().from('tarjeta_transacciones_vista').select('*', { count: 'exact' }), filtros)
  const from = page * pageSize, to = from + pageSize - 1
  const { data, error, count } = await q.order(ordenCampo, { ascending: ordenAsc }).range(from, to)
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

// Nombres de categoría distintos que existen hoy en Ingresos+Egresos, para el filtro.
export async function getCategoriasUnificadasDistintas(): Promise<string[]> {
  const { data, error } = await sb().from('movimientos_unificados').select('categoria')
  if (error) throw error
  return Array.from(new Set((data ?? []).map((r: any) => r.categoria))).sort()
}

// Todos los ids (+ tipo) que matchean el filtro actual — para "seleccionar todos los N
// resultados", no solo la página visible. Trae solo lo mínimo, no las filas completas.
export async function getIdsMovimientosUnificados(filtros: FiltrosMovs): Promise<{ id: string; tipo_movimiento: 'ingreso'|'egreso' }[]> {
  const q = aplicarFiltrosMovs(sb().from('movimientos_unificados').select('id,tipo_movimiento'), filtros)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}
export async function getIdsTarjetaTransaccionesVista(filtros: Omit<FiltrosMovs,'tipo'>): Promise<{ id: string }[]> {
  const q = aplicarFiltrosTarjeta(sb().from('tarjeta_transacciones_vista').select('id'), filtros)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

// Todas las filas que matchean el filtro (sin paginar) — para exportar a CSV.
// Ojo: no usar para render en pantalla, es solo para el export.
export async function getTodosMovimientosUnificados(filtros: FiltrosMovs): Promise<MovimientoUnificado[]> {
  const q = aplicarFiltrosMovs(sb().from('movimientos_unificados').select('*'), filtros)
  const { data, error } = await q.order('fecha', { ascending: false })
  if (error) throw error
  return data ?? []
}
export async function getTodasTarjetaTransaccionesVista(filtros: Omit<FiltrosMovs,'tipo'>): Promise<TarjetaTransaccionVista[]> {
  const q = aplicarFiltrosTarjeta(sb().from('tarjeta_transacciones_vista').select('*'), filtros)
  const { data, error } = await q.order('fecha', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Filas completas por id — usado antes de una acción en lote (como etiquetar) que
// necesita datos que no vienen en la selección liviana de "seleccionar todos los N".
export async function getMovimientosUnificadosPorIds(ids: string[]): Promise<MovimientoUnificado[]> {
  if (ids.length === 0) return []
  const { data, error } = await sb().from('movimientos_unificados').select('*').in('id', ids)
  if (error) throw error
  return data ?? []
}
export async function getTarjetaTransaccionesVistaPorIds(ids: string[]): Promise<TarjetaTransaccionVista[]> {
  if (ids.length === 0) return []
  const { data, error } = await sb().from('tarjeta_transacciones_vista').select('*').in('id', ids)
  if (error) throw error
  return data ?? []
}
