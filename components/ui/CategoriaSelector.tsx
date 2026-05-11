'use client'
import { useState } from 'react'
import { createCategoriaCustom } from '@/lib/queries'
import type { CategoriaCustom } from '@/types'

const COLORES = ['#888780','#2D7D2D','#C0392B','#1A5E9E','#E8A020','#5B3FA6','#D4537E','#1D9E75','#E05A22','#BA7517']
const ICONOS  = ['📦','💰','💳','🏠','🚗','✈️','🎓','💊','🛒','⚡','🌿','🎬','🏢','👔','💻','🔁','🎯','📋']

interface Props {
  modulo: string
  value: string
  onChange: (val: string) => void
  categorias: CategoriaCustom[]
  categoriasBase: { key: string; label: string; icon: string; color: string }[]
  onCategoriasChange: () => void
}

function flattenCats(cats: CategoriaCustom[], prefix = ''): { id: string; label: string; icono: string; color: string; indent: number }[] {
  const result: { id: string; label: string; icono: string; color: string; indent: number }[] = []
  cats.forEach(c => {
    result.push({ id: c.id, label: prefix + c.nombre, icono: c.icono, color: c.color, indent: prefix.length / 2 })
    if (c.children?.length) result.push(...flattenCats(c.children, prefix + '  '))
  })
  return result
}

export default function CategoriaSelector({ modulo, value, onChange, categorias, categoriasBase, onCategoriasChange }: Props) {
  const [showNew, setShowNew]     = useState(false)
  const [newNombre, setNewNombre] = useState('')
  const [newIcono, setNewIcono]   = useState('📦')
  const [newColor, setNewColor]   = useState('#888780')
  const [newParent, setNewParent] = useState('')
  const [saving, setSaving]       = useState(false)

  const customFlat = flattenCats(categorias)

  const handleCreate = async () => {
    if (!newNombre.trim()) return
    setSaving(true)
    try {
      await createCategoriaCustom({
        modulo,
        nombre: newNombre.trim(),
        icono: newIcono,
        color: newColor,
        parent_id: newParent || null,
      })
      onCategoriasChange()
      setNewNombre(''); setNewParent(''); setShowNew(false)
    } finally { setSaving(false) }
  }

  return (
    <div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="input-field mb-2">
        <optgroup label="Categorías base">
          {categoriasBase.map(c => (
            <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
          ))}
        </optgroup>
        {customFlat.length > 0 && (
          <optgroup label="Mis categorías">
            {customFlat.map(c => (
              <option key={c.id} value={c.id}>
                {'\u00A0'.repeat(c.indent * 2)}{c.icono} {c.label}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      {!showNew ? (
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="text-xs text-blue-600 hover:text-blue-800 border-none bg-transparent cursor-pointer px-0">
          + Crear nueva categoría
        </button>
      ) : (
        <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 mt-2">
          <div className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Nueva categoría</div>
          <input
            value={newNombre}
            onChange={e => setNewNombre(e.target.value)}
            placeholder="Nombre"
            className="input-field mb-2 text-sm"
          />
          <div className="flex gap-2 mb-2">
            <div className="flex-1">
              <div className="text-[10px] text-slate-400 mb-1">Ícono</div>
              <div className="flex flex-wrap gap-1">
                {ICONOS.map(ic => (
                  <button key={ic} type="button" onClick={() => setNewIcono(ic)}
                    className={`w-7 h-7 rounded text-sm cursor-pointer border transition-all ${newIcono===ic?'border-blue-600 bg-blue-50':'border-slate-200 bg-white'}`}>
                    {ic}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 mb-1">Color</div>
              <div className="flex flex-wrap gap-1 max-w-[80px]">
                {COLORES.map(c => (
                  <button key={c} type="button" onClick={() => setNewColor(c)}
                    className={`w-5 h-5 rounded-full cursor-pointer border-2 transition-all ${newColor===c?'border-slate-900 scale-110':'border-transparent'}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>
          {(categoriasBase.length > 0 || customFlat.length > 0) && (
            <div className="mb-2">
              <div className="text-[10px] text-slate-400 mb-1">Subcategoría de (opcional)</div>
              <select value={newParent} onChange={e => setNewParent(e.target.value)} className="input-field text-sm">
                <option value="">— Ninguna (categoría raíz) —</option>
                {customFlat.map(c => (
                  <option key={c.id} value={c.id}>{c.icono} {c.label}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={handleCreate} disabled={saving || !newNombre.trim()}
              className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button type="button" onClick={() => setShowNew(false)}
              className="btn-ghost text-xs py-1.5 px-3">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
