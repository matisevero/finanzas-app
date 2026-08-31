'use client'
import { useState, useEffect } from 'react'
import { Modal, FieldLabel } from '@/components/ui'
import MontoInput from './MontoInput'
import FechaInput from './FechaInput'
import { updateIngreso, updateEgreso, updateTarjetaTransaccion } from '@/lib/queries'
import type { Moneda } from '@/types'

type EntidadMov = 'ingreso' | 'egreso' | 'tarjeta_transaccion'

export interface MovimientoEditable {
  entidad: EntidadMov
  id: string
  descripcion: string
  monto: number
  moneda: Moneda
  fecha: string
  /** Si este movimiento hoy contribuye a un Ahorro/Meta, avisamos que cambiar el monto acá
   *  no reajusta ese saldo — hay que ajustarlo a mano si corresponde. */
  contribuyeAAhorroOMeta?: boolean
}

export function EditarMovimientoRapidoModal({ open, onClose, movimiento, monedasPalette, onSaved }: {
  open: boolean
  onClose: () => void
  movimiento: MovimientoEditable | null
  monedasPalette: Moneda[]
  onSaved: () => void
}) {
  const [form, setForm] = useState({ descripcion: '', monto: '', moneda: 'ARS' as Moneda, fecha: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && movimiento) {
      setForm({ descripcion: movimiento.descripcion, monto: String(movimiento.monto), moneda: movimiento.moneda, fecha: movimiento.fecha })
    }
  }, [open, movimiento])

  const handleGuardar = async () => {
    if (!movimiento || !form.descripcion || !form.monto) return
    setSaving(true)
    try {
      const payload = { descripcion: form.descripcion, monto: parseFloat(form.monto), moneda: form.moneda, fecha: form.fecha }
      if (movimiento.entidad === 'ingreso') await updateIngreso(movimiento.id, payload)
      else if (movimiento.entidad === 'egreso') await updateEgreso(movimiento.id, payload)
      else await updateTarjetaTransaccion(movimiento.id, payload)
      onSaved()
      onClose()
    } catch (e: any) {
      console.error(e)
      alert('No se pudo guardar el movimiento: ' + (e.message || e))
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar movimiento">
      <div className="flex flex-col gap-4">
        {movimiento?.contribuyeAAhorroOMeta && (
          <div className="bg-amber-50 text-amber-700 text-xs rounded-lg p-2.5">
            Este movimiento ya contribuyó a un Ahorro/Meta. Si cambiás el monto acá, ese saldo
            no se reajusta solo — revisalo a mano si hace falta.
          </div>
        )}
        <div><FieldLabel>Descripción</FieldLabel>
          <input value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} className="input-field" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><FieldLabel>Monto</FieldLabel>
            <MontoInput value={form.monto} onChange={raw => setForm(p => ({ ...p, monto: raw }))} placeholder="0" />
          </div>
          <div><FieldLabel>Moneda</FieldLabel>
            <select value={form.moneda} onChange={e => setForm(p => ({ ...p, moneda: e.target.value as Moneda }))} className="input-field">
              {monedasPalette.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div><FieldLabel>Fecha</FieldLabel>
          <FechaInput value={form.fecha} onChange={iso => setForm(p => ({ ...p, fecha: iso }))} />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={handleGuardar} disabled={saving || !form.descripcion || !form.monto} className="btn-primary flex-1 disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
