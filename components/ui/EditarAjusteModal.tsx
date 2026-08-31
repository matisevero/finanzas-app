'use client'
import { useState, useEffect } from 'react'
import { Modal, FieldLabel } from '@/components/ui'
import MontoInput from './MontoInput'
import FechaInput from './FechaInput'

export interface AjusteEditable {
  tipo: 'ahorro' | 'meta'
  id: string
  nota: string
  monto: number // con signo — positivo aporte, negativo retiro
  fecha: string
}

export function EditarAjusteModal({ open, onClose, ajuste, onGuardar, onEliminar }: {
  open: boolean
  onClose: () => void
  ajuste: AjusteEditable | null
  onGuardar: (id: string, cambios: { nota: string; monto: number; fecha: string }) => Promise<void>
  onEliminar: (id: string) => Promise<void>
}) {
  const [nota, setNota] = useState('')
  const [signo, setSigno] = useState<1 | -1>(1)
  const [montoAbs, setMontoAbs] = useState('')
  const [fecha, setFecha] = useState('')
  const [saving, setSaving] = useState(false)
  const [eliminando, setEliminando] = useState(false)

  useEffect(() => {
    if (open && ajuste) {
      setNota(ajuste.nota)
      setSigno(ajuste.monto < 0 ? -1 : 1)
      setMontoAbs(String(Math.abs(ajuste.monto)))
      setFecha(ajuste.fecha)
    }
  }, [open, ajuste])

  const handleGuardar = async () => {
    if (!ajuste || !montoAbs) return
    const nuevoMonto = signo * parseFloat(montoAbs)
    setSaving(true)
    try {
      await onGuardar(ajuste.id, { nota, monto: nuevoMonto, fecha })
      onClose()
    } catch (e: any) { console.error(e); alert('No se pudo guardar: ' + (e.message || e)) } finally { setSaving(false) }
  }

  const handleEliminar = async () => {
    if (!ajuste) return
    if (!confirm('¿Eliminar este ajuste manual? Se descuenta del total.')) return
    setEliminando(true)
    try {
      await onEliminar(ajuste.id)
      onClose()
    } catch (e: any) { console.error(e); alert('No se pudo eliminar: ' + (e.message || e)) } finally { setEliminando(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar ajuste manual">
      <div className="flex flex-col gap-4">
        <div><FieldLabel>Nota</FieldLabel>
          <input value={nota} onChange={e => setNota(e.target.value)} className="input-field" autoFocus />
        </div>
        <div><FieldLabel>Monto</FieldLabel>
          <div className="flex gap-2">
            <button onClick={() => setSigno(1)} className="px-3 rounded-lg text-sm font-bold flex-shrink-0"
              style={{ background: signo === 1 ? '#40B046' : '#F1F5F9', color: signo === 1 ? '#fff' : '#64748B' }}>+</button>
            <button onClick={() => setSigno(-1)} className="px-3 rounded-lg text-sm font-bold flex-shrink-0"
              style={{ background: signo === -1 ? '#F54927' : '#F1F5F9', color: signo === -1 ? '#fff' : '#64748B' }}>−</button>
            <MontoInput value={montoAbs} onChange={setMontoAbs} placeholder="0" className="flex-1" />
          </div>
        </div>
        <div><FieldLabel>Fecha</FieldLabel>
          <FechaInput value={fecha} onChange={setFecha} />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={handleEliminar} disabled={eliminando || saving}
            className="text-red-600 text-sm font-medium disabled:opacity-50">{eliminando ? 'Eliminando...' : 'Eliminar'}</button>
          <div className="flex-1" />
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button onClick={handleGuardar} disabled={saving || eliminando || !montoAbs} className="btn-primary disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
