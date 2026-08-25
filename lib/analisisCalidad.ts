// Motor de "Salud de los datos" — corre en el browser, se dispara desde
// CalidadDatosWatcher como mucho una vez por día (ver calidad_meta). No borra
// ni modifica movimientos: solo detecta y deja hallazgos para que se revisen
// a mano desde Configuración.
import {
  getAllIngresos, getAllEgresos, getIngresoEtiquetas, getEgresoEtiquetas,
  getTarjetaTransacciones, getTarjetaTransaccionEtiquetas,
  getCalidadHallazgosPendientes, crearHallazgoSiNoExiste, eliminarHallazgo,
} from '@/lib/queries'
import type { Ingreso, Egreso, TarjetaTransaccion, TipoHallazgo, EntidadHallazgo } from '@/types'

type Mov = { entidad: EntidadHallazgo; id: string; descripcion: string; monto: number; moneda: string; fecha: string }

const DIA_MS = 86400000

// Similaridad de texto simple (0 a 1) — normaliza acentos/mayúsculas y compara
// por superposición de palabras. No hace falta nada más sofisticado para
// distinguir "Super Coto" de "Netflix"; para bancos que abrevian distinto cada
// vez, esto ya agarra la mayoría de los casos sin falsos positivos groseros.
function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').trim()
}
function similaridad(a: string, b: string): number {
  const A = new Set(normalizar(a).split(/\s+/).filter(w => w.length > 2))
  const B = new Set(normalizar(b).split(/\s+/).filter(w => w.length > 2))
  if (A.size === 0 || B.size === 0) return 0
  const interseccion = [...A].filter(w => B.has(w)).length
  return interseccion / Math.max(A.size, B.size)
}

export async function ejecutarAnalisisCalidadDatos(): Promise<void> {
  const [ingresos, egresos, txnsTarjeta, ingresoEt, egresoEt, txnEt] = await Promise.all([
    getAllIngresos(), getAllEgresos(), getTarjetaTransacciones(),
    getIngresoEtiquetas(), getEgresoEtiquetas(), getTarjetaTransaccionEtiquetas(),
  ])

  const movs: Mov[] = [
    ...ingresos.map(i => ({ entidad: 'ingreso' as const, id: i.id, descripcion: i.descripcion, monto: i.monto, moneda: i.moneda, fecha: i.fecha })),
    ...egresos.map(e => ({ entidad: 'egreso' as const, id: e.id, descripcion: e.descripcion, monto: e.monto, moneda: e.moneda, fecha: e.fecha })),
    ...txnsTarjeta.map(t => ({ entidad: 'tarjeta_transaccion' as const, id: t.id, descripcion: t.descripcion, monto: t.monto, moneda: t.moneda, fecha: t.fecha })),
  ]

  // ── Duplicados: comparamos ingresos contra ingresos, y (egresos + tarjeta)
  // contra sí mismos, sin cruzar ingresos con gastos.
  const gruposComparables: Mov[][] = [
    movs.filter(m => m.entidad === 'ingreso'),
    movs.filter(m => m.entidad === 'egreso' || m.entidad === 'tarjeta_transaccion'),
  ]

  const hallazgos: { tipo: TipoHallazgo; entidad: EntidadHallazgo; entidad_id: string; entidad_id_2: string }[] = []

  for (const grupo of gruposComparables) {
    for (let i = 0; i < grupo.length; i++) {
      for (let j = i + 1; j < grupo.length; j++) {
        const a: Mov = grupo[i], b: Mov = grupo[j]
        if (a.moneda !== b.moneda) continue
        const diasDif = Math.abs(new Date(a.fecha).getTime() - new Date(b.fecha).getTime()) / DIA_MS
        const mismoMonto = Math.abs(a.monto - b.monto) <= 1
        const descripcionIdentica = normalizar(a.descripcion) === normalizar(b.descripcion) && normalizar(a.descripcion).length > 0
        if (mismoMonto && diasDif <= 1 && descripcionIdentica) {
          hallazgos.push({ tipo: 'duplicado_exacto', entidad: a.entidad, entidad_id: a.id, entidad_id_2: b.id })
          continue
        }
        const montoParecido = a.monto > 0 && Math.abs(a.monto - b.monto) / a.monto <= 0.05
        if (montoParecido && diasDif <= 3 && similaridad(a.descripcion, b.descripcion) >= 0.5) {
          hallazgos.push({ tipo: 'duplicado_probable', entidad: a.entidad, entidad_id: a.id, entidad_id_2: b.id })
        }
      }
    }
  }

  // ── Sin etiqueta: todo movimiento que no tiene ninguna fila en su tabla puente.
  const ingresoIdsConEtiqueta = new Set(ingresoEt.map((x: { ingreso_id: string }) => x.ingreso_id))
  const egresoIdsConEtiqueta  = new Set(egresoEt.map((x: { egreso_id: string }) => x.egreso_id))
  const txnIdsConEtiqueta     = new Set(txnEt.map((x: { transaccion_id: string }) => x.transaccion_id))
  for (const i of ingresos) if (!ingresoIdsConEtiqueta.has(i.id)) hallazgos.push({ tipo: 'sin_etiqueta', entidad: 'ingreso', entidad_id: i.id, entidad_id_2: '' })
  for (const e of egresos) if (!egresoIdsConEtiqueta.has(e.id)) hallazgos.push({ tipo: 'sin_etiqueta', entidad: 'egreso', entidad_id: e.id, entidad_id_2: '' })
  for (const t of txnsTarjeta) if (!txnIdsConEtiqueta.has(t.id)) hallazgos.push({ tipo: 'sin_etiqueta', entidad: 'tarjeta_transaccion', entidad_id: t.id, entidad_id_2: '' })

  // Reconciliación: se recalcula todo desde cero cada vez, así que si cambia el
  // criterio de detección (o el movimiento ya se etiquetó desde otro lado) el
  // hallazgo viejo se borra solo en vez de quedar colgado para siempre.
  const clave = (h: { tipo: TipoHallazgo; entidad: EntidadHallazgo; entidad_id: string; entidad_id_2?: string | null }) =>
    `${h.tipo}|${h.entidad}|${h.entidad_id}|${h.entidad_id_2 || ''}`
  const clavesFrescas = new Set(hallazgos.map(clave))
  // Los duplicados no tienen un orden garantizado entre ejecuciones (a/b pueden
  // invertirse), así que también se acepta la clave con el par al revés.
  hallazgos.forEach(h => { if (h.entidad_id_2) clavesFrescas.add(clave({ ...h, entidad_id: h.entidad_id_2, entidad_id_2: h.entidad_id })) })

  const pendientes = (await getCalidadHallazgosPendientes(true)).filter(e => e.estado === 'pendiente')
  for (const p of pendientes) {
    if (!clavesFrescas.has(clave(p))) await eliminarHallazgo(p.id).catch(()=>{})
  }

  // No se recrean hallazgos que ya están pendientes (mantiene la fecha original
  // de detección) ni los que la persona ya descartó o resolvió.
  const existentes = await getCalidadHallazgosPendientes(true) // incluye descartados/resueltos para no repetirlos
  const yaExiste = (h: typeof hallazgos[number]) => existentes.some(e =>
    e.tipo === h.tipo && e.entidad === h.entidad && e.entidad_id === h.entidad_id &&
    (e.entidad_id_2 || '') === (h.entidad_id_2 || '')
  )

  for (const h of hallazgos) {
    if (yaExiste(h)) continue
    await crearHallazgoSiNoExiste({
      tipo: h.tipo, entidad: h.entidad, entidad_id: h.entidad_id,
      entidad_id_2: h.entidad_id_2 || null,
    })
  }
}
