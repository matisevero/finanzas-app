'use client'
import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui'
import type { Etiqueta, Proyecto, Ahorro } from '@/types'

// Las etiquetas de tipo proyecto/ahorro no tienen color propio — heredan el color
// de la entidad a la que pertenecen (vía proyecto_id/ahorro_id), así que si cambiás
// el color del proyecto el chip se actualiza solo. Las libres sí tienen el suyo.
export function colorDeEtiqueta(et: Etiqueta, proyectos: Proyecto[], ahorros: Ahorro[]): string {
  if (et.tipo === 'proyecto') return proyectos.find(p => p.id === et.proyecto_id)?.color ?? '#888780'
  if (et.tipo === 'ahorro')   return ahorros.find(a => a.id === et.ahorro_id)?.color ?? '#888780'
  return et.color ?? '#888780'
}

export function EtiquetaChips({ etiquetaIds, etiquetas, proyectos, ahorros, max = 3 }: {
  etiquetaIds: string[]
  etiquetas: Etiqueta[]
  proyectos: Proyecto[]
  ahorros: Ahorro[]
  max?: number
}) {
  if (etiquetaIds.length === 0) return null
  const items = etiquetaIds.map(id => etiquetas.find(e => e.id === id)).filter((e): e is Etiqueta => !!e)
  if (items.length === 0) return null
  const visibles = items.slice(0, max)
  const resto = items.length - visibles.length
  return (
    <div className="flex flex-wrap gap-1 mt-1" onClick={e => e.stopPropagation()}>
      {visibles.map(et => {
        const color = colorDeEtiqueta(et, proyectos, ahorros)
        return (
          <span key={et.id} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: color + '18', color }}>
            {et.nombre}
          </span>
        )
      })}
      {resto > 0 && <span className="text-[10px] text-slate-400 px-1">+{resto}</span>}
    </div>
  )
}

export function EtiquetaPickerModal({ open, onClose, tipo, etiquetas, proyectos, ahorros, seleccionadas, onConfirm, onCrear }: {
  open: boolean
  onClose: () => void
  tipo: 'proyecto' | 'ahorro'
  etiquetas: Etiqueta[]
  proyectos: Proyecto[]
  ahorros: Ahorro[]
  seleccionadas: string[]
  onConfirm: (ids: string[]) => void | Promise<void>
  onCrear: (nombre: string) => Promise<string | null>
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set(seleccionadas))
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [creando, setCreando] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) setChecked(new Set(seleccionadas)) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const disponibles = etiquetas.filter(e => e.tipo === tipo && e.estado === 'activa')

  const toggle = (id: string) => setChecked(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const handleCrear = async () => {
    if (!nuevoNombre.trim()) return
    setCreando(true)
    try {
      const newId = await onCrear(nuevoNombre.trim())
      if (newId) setChecked(prev => new Set(prev).add(newId))
      setNuevoNombre('')
    } finally { setCreando(false) }
  }

  const handleConfirm = async () => {
    setSaving(true)
    try { await onConfirm(Array.from(checked)); onClose() } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={tipo === 'proyecto' ? 'Asociar a proyecto' : 'Asociar a ahorro'}>
      <div className="flex flex-col gap-3">
        {disponibles.length === 0 ? (
          <div className="text-slate-400 text-sm text-center py-4">Todavía no tenés {tipo === 'proyecto' ? 'proyectos' : 'ahorros'} activos.</div>
        ) : (
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {disponibles.map(et => {
              const color = colorDeEtiqueta(et, proyectos, ahorros)
              return (
                <label key={et.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={checked.has(et.id)} onChange={() => toggle(et.id)} className="w-4 h-4 accent-blue-700" />
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="text-sm text-slate-700">{et.nombre}</span>
                </label>
              )
            })}
          </div>
        )}
        <div className="flex gap-2 pt-2 border-t border-slate-100">
          <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} placeholder={`Nuevo ${tipo}...`} className="input-field flex-1 text-sm" />
          <button onClick={handleCrear} disabled={creando || !nuevoNombre.trim()} className="btn-ghost text-sm disabled:opacity-50 flex-shrink-0">{creando ? '...' : '+ Crear'}</button>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={handleConfirm} disabled={saving} className="btn-primary flex-1 disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </Modal>
  )
}
