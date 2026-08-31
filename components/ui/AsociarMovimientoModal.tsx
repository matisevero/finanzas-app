'use client'
import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui'
import { setEtiquetasDeIngreso, setEtiquetasDeEgreso, setEtiquetasDeTarjetaTransaccion, aplicarContribucionPorEtiquetas } from '@/lib/queries'
import { fmtFull, fmtDate } from '@/lib/utils/formatters'
import type { Ingreso, Egreso, TarjetaTransaccion, Etiqueta, Ahorro, Meta, Moneda } from '@/types'

type EntidadMov = 'ingreso' | 'egreso' | 'tarjeta_transaccion'

const aplicarSet = (entidad: EntidadMov, id: string, ids: string[]) => {
  if (entidad === 'egreso') return setEtiquetasDeEgreso(id, ids)
  if (entidad === 'ingreso') return setEtiquetasDeIngreso(id, ids)
  return setEtiquetasDeTarjetaTransaccion(id, ids)
}

/** Saca una sola etiqueta (proyecto/ahorro/meta) de un movimiento sin tocar el resto de sus
 *  etiquetas, y revierte la contribución a Ahorro/Meta si correspondía — misma lógica que el
 *  "Quitar" del modal de Asociar, pero invocable directo desde una fila del Historial. */
export async function desasociarMovimiento(params: {
  entidad: EntidadMov; id: string; etiquetaId: string; etiquetasActuales: string[]
  etiquetas: Etiqueta[]; ahorros: Ahorro[]; metas: Meta[]
  tipo: 'proyecto' | 'ahorro' | 'meta'
  monto: number; moneda: Moneda; fecha: string; descripcion: string
}) {
  const { entidad, id, etiquetaId, etiquetasActuales, etiquetas, ahorros, metas, tipo, monto, moneda, fecha, descripcion } = params
  const idsDespues = etiquetasActuales.filter(x => x !== etiquetaId)
  await aplicarSet(entidad, id, idsDespues)
  if (tipo === 'ahorro' || tipo === 'meta') {
    await aplicarContribucionPorEtiquetas({
      idsAntes: etiquetasActuales, idsDespues, etiquetas, ahorros, metas,
      monto, moneda, fecha,
      signo: entidad === 'ingreso' ? -1 : 1,
      nota: `${entidad === 'egreso' ? 'Egreso' : entidad === 'ingreso' ? 'Ingreso' : 'Tarjeta'}: ${descripcion}`,
    })
  }
}

/** Modal genérico para asociar Ingresos/Egresos/Tarjeta desde la propia página del
 *  Proyecto/Ahorro/Meta — el sentido inverso del kebab que ya existe en cada movimiento.
 *  Mismo mecanismo de aporte automático que el kebab: si tipo es ahorro/meta y la moneda
 *  del movimiento coincide con la de la entidad, sumar/restar el total también. */
export function AsociarMovimientoModal({ open, onClose, tipo, etiquetaId, etiquetas, ingresos, egresos, tarjetaTxns,
  ingresoEtiquetas, egresoEtiquetas, txnEtiquetas, moneda, ahorros = [], metas = [], onDone }: {
  open: boolean; onClose: () => void
  tipo: 'proyecto' | 'ahorro' | 'meta'
  etiquetaId: string
  etiquetas: Etiqueta[]
  ingresos: Ingreso[]; egresos: Egreso[]; tarjetaTxns: TarjetaTransaccion[]
  ingresoEtiquetas: { ingreso_id: string; etiqueta_id: string }[]
  egresoEtiquetas: { egreso_id: string; etiqueta_id: string }[]
  txnEtiquetas: { transaccion_id: string; etiqueta_id: string }[]
  moneda?: Moneda
  ahorros?: Ahorro[]; metas?: Meta[]
  onDone: () => void
}) {
  const [busqueda, setBusqueda] = useState('')
  const [procesando, setProcesando] = useState<string | null>(null)

  type Fila = { entidad: EntidadMov; id: string; fecha: string; descripcion: string; monto: number; moneda: Moneda; yaAsociado: boolean }

  const filas = useMemo((): Fila[] => {
    const egIds  = new Set(egresoEtiquetas.filter(r => r.etiqueta_id === etiquetaId).map(r => r.egreso_id))
    const inIds  = new Set(ingresoEtiquetas.filter(r => r.etiqueta_id === etiquetaId).map(r => r.ingreso_id))
    const txIds  = new Set(txnEtiquetas.filter(r => r.etiqueta_id === etiquetaId).map(r => r.transaccion_id))
    const e: Fila[] = egresos.map(x => ({ entidad:'egreso', id:x.id, fecha:x.fecha, descripcion:x.descripcion, monto:x.monto, moneda:x.moneda as Moneda, yaAsociado: egIds.has(x.id) }))
    const i: Fila[] = ingresos.map(x => ({ entidad:'ingreso', id:x.id, fecha:x.fecha, descripcion:x.descripcion, monto:x.monto, moneda:x.moneda as Moneda, yaAsociado: inIds.has(x.id) }))
    const t: Fila[] = tarjetaTxns.map(x => ({ entidad:'tarjeta_transaccion', id:x.id, fecha:x.fecha, descripcion:x.descripcion, monto:x.monto, moneda:x.moneda as Moneda, yaAsociado: txIds.has(x.id) }))
    return [...e, ...i, ...t].sort((a,b) => b.fecha.localeCompare(a.fecha))
  }, [egresos, ingresos, tarjetaTxns, egresoEtiquetas, ingresoEtiquetas, txnEtiquetas, etiquetaId])

  const filtradas = useMemo(() => {
    const q = busqueda.toLowerCase()
    return filas.filter(f => !q || f.descripcion.toLowerCase().includes(q))
  }, [filas, busqueda])

  const asociadas   = filtradas.filter(f => f.yaAsociado)
  const disponibles = filtradas.filter(f => !f.yaAsociado)

  const etiquetasDelMov = (entidad: EntidadMov, id: string): string[] => {
    if (entidad === 'egreso') return egresoEtiquetas.filter(r => r.egreso_id === id).map(r => r.etiqueta_id)
    if (entidad === 'ingreso') return ingresoEtiquetas.filter(r => r.ingreso_id === id).map(r => r.etiqueta_id)
    return txnEtiquetas.filter(r => r.transaccion_id === id).map(r => r.etiqueta_id)
  }

  const toggle = async (f: Fila) => {
    setProcesando(f.id)
    try {
      const idsAntes = etiquetasDelMov(f.entidad, f.id)
      const idsDespues = f.yaAsociado ? idsAntes.filter(x => x !== etiquetaId) : [...idsAntes, etiquetaId]
      await aplicarSet(f.entidad, f.id, idsDespues)
      if ((tipo === 'ahorro' || tipo === 'meta') && moneda) {
        await aplicarContribucionPorEtiquetas({
          idsAntes, idsDespues, etiquetas, ahorros, metas,
          monto: f.monto, moneda: f.moneda, fecha: f.fecha,
          signo: f.entidad === 'ingreso' ? -1 : 1,
          nota: `${f.entidad === 'egreso' ? 'Egreso' : f.entidad === 'ingreso' ? 'Ingreso' : 'Tarjeta'}: ${f.descripcion}`,
        })
      }
      onDone()
    } finally { setProcesando(null) }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Asociar movimientos${tipo === 'proyecto' ? ' al proyecto' : tipo === 'ahorro' ? ' al ahorro' : ' a la meta'}`}>
      <div className="flex flex-col gap-3">
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por descripción..." className="input-field text-sm" autoFocus />

        {asociadas.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1.5">Ya asociados ({asociadas.length})</div>
            <div className="flex flex-col gap-1 max-h-32 overflow-y-auto border border-slate-200 rounded-lg p-1">
              {asociadas.map(f => (
                <div key={`${f.entidad}-${f.id}`} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-50">
                  <div className="min-w-0"><span className="text-xs text-slate-700 truncate">{f.descripcion}</span> <span className="text-[10px] text-slate-400">{fmtDate(f.fecha)} · {fmtFull(f.monto, f.moneda)}</span></div>
                  <button onClick={() => toggle(f)} disabled={procesando===f.id} className="text-[11px] text-slate-400 hover:text-red-500 border-none bg-transparent cursor-pointer disabled:opacity-50 flex-shrink-0">Quitar</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="text-xs font-semibold text-slate-500 mb-1.5">Disponibles</div>
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto border border-slate-200 rounded-lg p-1">
            {disponibles.length === 0 ? (
              <div className="text-xs text-slate-400 text-center py-3">Sin movimientos para mostrar.</div>
            ) : disponibles.slice(0, 50).map(f => (
              <div key={`${f.entidad}-${f.id}`} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-50">
                <div className="min-w-0"><span className="text-xs text-slate-700 truncate">{f.descripcion}</span> <span className="text-[10px] text-slate-400">{fmtDate(f.fecha)} · {fmtFull(f.monto, f.moneda)}</span></div>
                <button onClick={() => toggle(f)} disabled={procesando===f.id} className="text-[11px] text-blue-700 border-none bg-transparent cursor-pointer disabled:opacity-50 flex-shrink-0">{procesando===f.id?'...':'+ Asociar'}</button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex pt-2">
          <button onClick={onClose} className="btn-primary flex-1">Listo</button>
        </div>
      </div>
    </Modal>
  )
}
