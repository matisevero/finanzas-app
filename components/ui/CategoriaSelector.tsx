'use client'
import { useState, useRef, useEffect } from 'react'
import { createCategoriaCustom } from '@/lib/queries'
import type { CategoriaCustom } from '@/types'

const COLORES = ['#888780','#2D7D2D','#C0392B','#1A5E9E','#E8A020','#5B3FA6','#D4537E','#1D9E75','#E05A22','#BA7517']

function flattenCats(cats: CategoriaCustom[], indent = 0): { id: string; label: string; icono: string; color: string; indent: number }[] {
  const result: { id: string; label: string; icono: string; color: string; indent: number }[] = []
  cats.forEach(c => {
    result.push({ id: c.id, label: c.nombre, icono: c.icono, color: c.color, indent })
    if (c.children?.length) result.push(...flattenCats(c.children, indent + 1))
  })
  return result
}

interface Props {
  modulo: string
  value: string
  onChange: (val: string) => void
  categorias: CategoriaCustom[]
  categoriasBase: { key: string; label: string; icon: string; color: string }[]
  onCategoriasChange: () => void
}

export default function CategoriaSelector({ modulo, value, onChange, categorias, categoriasBase, onCategoriasChange }: Props) {
  const [open, setOpen]           = useState(false)
  const [showNew, setShowNew]     = useState(false)
  const [newNombre, setNewNombre] = useState('')
  const [newColor, setNewColor]   = useState('#888780')
  const [newParent, setNewParent] = useState('')
  const [saving, setSaving]       = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const customFlat = flattenCats(categorias)

  const allOptions = [
    ...categoriasBase.map(c => ({ id: c.key, label: c.label, icono: c.icon, color: c.color, isCustom: false })),
    ...customFlat.map(c => ({ ...c, isCustom: true })),
  ]

  const selected = allOptions.find(o => o.id === value)

  // Cerrar al click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setShowNew(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleCreate = async () => {
    if (!newNombre.trim()) return
    setSaving(true)
    try {
      const created = await createCategoriaCustom({
        modulo, nombre: newNombre.trim(),
        icono: '', color: newColor,
        parent_id: newParent || null,
      })
      onCategoriasChange()
      onChange(created.id)
      setNewNombre(''); setNewParent(''); setShowNew(false); setOpen(false)
    } finally { setSaving(false) }
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setShowNew(false) }}
        style={{borderRadius:2}}
        className="input-field flex items-center justify-between gap-2 text-left w-full text-xs py-1 px-2">
        <span className="truncate">{selected?.label ?? 'Seleccioná'}</span>
        <span className="text-slate-400 text-xs flex-shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-modal overflow-hidden" style={{minWidth:220}}>
          {/* Lista de opciones */}
          <div className="max-h-48 overflow-y-auto">
            {categoriasBase.length > 0 && (
              <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">
                Categorías base
              </div>
            )}
            {categoriasBase.map(c => (
              <button key={c.key} type="button"
                onClick={() => { onChange(c.key); setOpen(false) }}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-50 transition-colors text-sm border-none cursor-pointer ${value === c.key ? 'bg-blue-50 text-blue-700' : 'bg-white text-slate-700'}`}>
                <span>{c.label}</span>
              </button>
            ))}

            {customFlat.length > 0 && (
              <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 border-t border-slate-100">
                Mis categorías
              </div>
            )}
            {customFlat.map(c => (
              <button key={c.id} type="button"
                onClick={() => { onChange(c.id); setOpen(false) }}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-50 transition-colors text-sm border-none cursor-pointer ${value === c.id ? 'bg-blue-50 text-blue-700' : 'bg-white text-slate-700'}`}
                style={{ paddingLeft: `${12 + c.indent * 16}px` }}>
                <span>{c.label}</span>
              </button>
            ))}
          </div>

          {/* Separador + botón nueva categoría */}
          <div className="border-t border-slate-100">
            {!showNew ? (
              <button type="button" onClick={() => setShowNew(true)}
                className="w-full text-left px-3 py-2.5 text-xs text-blue-600 hover:bg-blue-50 transition-colors border-none bg-white cursor-pointer font-medium">
                + Crear nueva categoría
              </button>
            ) : (
              <div className="p-3 bg-slate-50">
                <div className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Nueva categoría</div>
                <input value={newNombre} onChange={e => setNewNombre(e.target.value)}
                  placeholder="Nombre" className="input-field mb-2 text-sm" autoFocus />

                <div className="flex gap-2 mb-2">
                  <div>
                    <div className="text-[10px] text-slate-400 mb-1">Color</div>
                    <div className="flex flex-wrap gap-1 max-w-[120px]">
                      {COLORES.map(col => (
                        <button key={col} type="button" onClick={() => setNewColor(col)}
                          className={`w-5 h-5 rounded-full cursor-pointer border-2 transition-all ${newColor === col ? 'border-slate-900 scale-110' : 'border-transparent'}`}
                          style={{ background: col }} />
                      ))}
                    </div>
                  </div>
                </div>

                {customFlat.length > 0 && (
                  <div className="mb-2">
                    <div className="text-[10px] text-slate-400 mb-1">Subcategoría de (opcional)</div>
                    <select value={newParent} onChange={e => setNewParent(e.target.value)} className="input-field text-sm">
                      <option value="">— Ninguna —</option>
                      {customFlat.map(c => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex gap-2">
                  <button type="button" onClick={handleCreate} disabled={saving || !newNombre.trim()}
                    className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50">
                    {saving ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button type="button" onClick={() => setShowNew(false)} className="btn-ghost text-xs py-1.5 px-3">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
