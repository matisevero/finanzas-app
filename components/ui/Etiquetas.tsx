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

export function EtiquetaPickerModal({ open, onClose, tipo, etiquetas, proyectos, ahorros, seleccionadas, onConfirm, onCrear, modo, origenMoneda, origenMonto, onConfirmConversion }: {
  open: boolean
  onClose: () => void
  tipo: 'proyecto' | 'ahorro'
  etiquetas: Etiqueta[]
  proyectos: Proyecto[]
  ahorros: Ahorro[]
  seleccionadas: string[]
  onConfirm: (ids: string[]) => void | Promise<void>
  onCrear: (nombre: string) => Promise<string | null>
  /** 'compra' (desde Egresos: suma al Ahorro) o 'venta' (desde Ingresos: resta del Ahorro).
   *  Para 'venta' de un Ahorro en cripto (BTC/ETH), la moneda de origen esperada es USD, no ARS —
   *  vender cripto liquida en USD, no directo a pesos. Para todo lo demás (fiat: USD/EUR/USDT en
   *  cualquiera de los dos modos, o compra de cripto), la moneda de origen esperada es ARS. */
  modo?: 'compra' | 'venta'
  origenMoneda?: string
  origenMonto?: number
  onConfirmConversion?: (ahorroId: string, montoConvertido: number, cotizacionUsdRef?: number) => Promise<void>
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set(seleccionadas))
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [creando, setCreando] = useState(false)
  const [saving, setSaving] = useState(false)
  const [montoConvertido, setMontoConvertido] = useState('')
  const [cotizacionUsdRef, setCotizacionUsdRef] = useState('')

  useEffect(() => { if (open) { setChecked(new Set(seleccionadas)); setMontoConvertido(''); setCotizacionUsdRef('') } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Si se seleccionó exactamente un Ahorro que no es ARS, y la moneda del ítem que se está
  // asociando coincide con la esperada para ese caso, mostramos el campo de conversión.
  const ahorroConversion = (() => {
    if (tipo !== 'ahorro' || !modo || !onConfirmConversion) return null
    const ids = Array.from(checked)
    if (ids.length !== 1) return null
    const et = disponibles.find(e => e.id === ids[0])
    const ahorro = et ? ahorros.find(a => a.id === et.ahorro_id) : null
    if (!ahorro || ahorro.moneda === 'ARS') return null
    const esCripto = ['BTC', 'ETH'].includes(ahorro.moneda)
    const monedaEsperada = (modo === 'venta' && esCripto) ? 'USD' : 'ARS'
    if (origenMoneda !== monedaEsperada) return null
    return ahorro
  })()
  const esCripto = ahorroConversion ? ['BTC', 'ETH'].includes(ahorroConversion.moneda) : false

  const handleConfirm = async () => {
    setSaving(true)
    try {
      await onConfirm(Array.from(checked))
      if (ahorroConversion && onConfirmConversion && montoConvertido) {
        await onConfirmConversion(ahorroConversion.id, parseFloat(montoConvertido), cotizacionUsdRef ? parseFloat(cotizacionUsdRef) : undefined)
      }
      onClose()
    } finally { setSaving(false) }
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

        {ahorroConversion && (
          <div className="bg-purple-50 rounded-lg p-3 flex flex-col gap-2.5">
            <div className="text-xs text-purple-700">
              Este ahorro es en <strong>{ahorroConversion.moneda}</strong> — contame cuánto {modo === 'venta' ? 'vendiste' : (esCripto ? 'compraste' : 'obtuviste')} para {modo === 'venta' ? 'descontarlo' : 'sumarlo'} ahí (la cotización queda guardada como nota en el movimiento).
            </div>
            <div>
              <div className="text-[10.5px] font-bold text-purple-600 uppercase tracking-wider mb-1">
                {esCripto ? `Cantidad de ${ahorroConversion.moneda} ${modo === 'venta' ? 'vendida' : 'comprada'}` : `Monto en ${ahorroConversion.moneda}`}
              </div>
              <input type="number" step="any" value={montoConvertido} onChange={e => setMontoConvertido(e.target.value)} placeholder="0" className="input-field font-mono text-sm" />
            </div>
            {esCripto && modo === 'compra' && (
              <div>
                <div className="text-[10.5px] font-bold text-purple-600 uppercase tracking-wider mb-1">Cotización del USD ese día <span className="text-purple-400 font-normal normal-case">(opcional, para seguimiento)</span></div>
                <input type="number" step="any" value={cotizacionUsdRef} onChange={e => setCotizacionUsdRef(e.target.value)} placeholder="Ej: 1538.46" className="input-field font-mono text-sm" />
              </div>
            )}
            {origenMonto && montoConvertido && parseFloat(montoConvertido) > 0 && (esCripto
              ? (modo === 'venta'
                  ? <div className="text-xs text-purple-500">Precio: ${(origenMonto / parseFloat(montoConvertido)).toLocaleString('es-AR', { maximumFractionDigits: 2 })} USD por {ahorroConversion.moneda} (se deriva solo, no hace falta cargarlo)</div>
                  : <div className="text-xs text-purple-500">Precio implícito: ${(origenMonto / parseFloat(montoConvertido)).toLocaleString('es-AR', { maximumFractionDigits: 2 })} ARS por {ahorroConversion.moneda}</div>)
              : <div className="text-xs text-purple-500">Cotización implícita: ${(origenMonto / parseFloat(montoConvertido)).toLocaleString('es-AR', { maximumFractionDigits: 2 })} por {ahorroConversion.moneda}</div>
            )}
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
