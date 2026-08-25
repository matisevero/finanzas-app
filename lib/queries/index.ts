import { createClient } from '@/lib/supabase/client'
import type {
  Ingreso, IngresoInsert, Egreso, EgresoInsert,
  Deuda, DeudaInsert, PagoDeuda,
  Tarjeta, TarjetaInsert, TarjetaTransaccion, PagoTarjeta,
  EventoCalendario, EventoInsert,
  Meta, MetaInsert,
  Ahorro, AhorroInsert,
  Proyecto, ProyectoInsert, ProyectoPresupuesto, ProyectoMovimientoManual, ProyectoMovimientoManualInsert,
  Etiqueta, EtiquetaInsert,
  PrecioItem, PrecioHistorial,
  SaldoInicial,
  CategoriaCustom, CategoriaCustomInsert,
  Persona, PersonaInsert,
  Moneda,
  CalidadHallazgo, TipoHallazgo, EntidadHallazgo,
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
  const fecha = new Date(form.fecha)
  const { data, error } = await sb().from('ingresos')
    .insert({ ...form, user_id: userId, año: fecha.getFullYear(), mes: fecha.getMonth() + 1 })
    .select().single()
  if (error) throw error
  return data
}

export async function updateIngreso(id: string, form: Partial<IngresoInsert>): Promise<Ingreso> {
  const updates: Record<string, unknown> = { ...form }
  if (form.fecha) {
    const fecha = new Date(form.fecha)
    updates.año = fecha.getFullYear()
    updates.mes = fecha.getMonth() + 1
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
  const fecha = new Date(form.fecha)
  const { data, error } = await sb().from('egresos')
    .insert({ ...form, user_id: userId, año: fecha.getFullYear(), mes: fecha.getMonth() + 1 })
    .select().single()
  if (error) throw error
  return data
}

export async function updateEgreso(id: string, form: Partial<EgresoInsert>): Promise<Egreso> {
  const updates: Record<string, unknown> = { ...form }
  if (form.fecha) {
    const fecha = new Date(form.fecha)
    updates.año = fecha.getFullYear()
    updates.mes = fecha.getMonth() + 1
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

// Nota: esta función también existe en la rama prueba-tarjetas-conciliacion —
// al mergear ambas ramas va a quedar duplicada, hay que sacar una copia.
export async function setEtiquetasDeTarjetaTransaccion(transaccionId: string, etiquetaIds: string[]) {
  const { error: delErr } = await sb().from('tarjeta_transaccion_etiquetas').delete().eq('transaccion_id', transaccionId)
  if (delErr) throw delErr
  if (etiquetaIds.length === 0) return
  const { error } = await sb().from('tarjeta_transaccion_etiquetas').insert(etiquetaIds.map(etiqueta_id => ({ transaccion_id: transaccionId, etiqueta_id })))
  if (error) throw error
}

// Nota: esta función también existe en la rama prueba-tarjetas-conciliacion —
// al mergear ambas ramas va a quedar duplicada, hay que sacar una copia.
export async function getTarjetaTransaccionEtiquetas(): Promise<{ transaccion_id: string; etiqueta_id: string }[]> {
  const { data, error } = await sb().from('tarjeta_transaccion_etiquetas').select('*')
  if (error) throw error
  return data ?? []
}
