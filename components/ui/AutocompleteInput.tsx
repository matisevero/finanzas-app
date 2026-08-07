'use client'
import { useState, useRef, useEffect } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  suggestions: string[]
  placeholder?: string
  className?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void
  autoFocus?: boolean
  maxSuggestions?: number
}

/** Input de texto libre con sugerencias de valores usados antes (Descripción, Etiqueta, etc).
 *  `suggestions` ya debería venir ordenada por relevancia (ej. frecuencia de uso).
 *  El desplegable se posiciona con `fixed` calculando su lugar en pantalla, para no quedar
 *  recortado cuando el input vive dentro de un contenedor con overflow (tablas, celdas, etc). */
export default function AutocompleteInput({
  value, onChange, suggestions, placeholder, className = 'input-field', onKeyDown, onPaste, autoFocus, maxSuggestions = 6,
}: Props) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null)
  const wrapRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      const target = e.target as Node
      if (wrapRef.current?.contains(target)) return
      if ((target as HTMLElement).closest?.('[data-autocomplete-menu]')) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  useEffect(() => {
    if (!open) return
    function place() {
      const el = inputRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 180) })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  const q = value.trim().toLowerCase()
  const filtered = (q
    ? suggestions.filter(s => s.toLowerCase().includes(q) && s.toLowerCase() !== q)
    : suggestions
  ).slice(0, maxSuggestions)

  const showMenu = open && filtered.length > 0 && rect

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        className={className}
        autoComplete="off"
      />
      {showMenu && (
        <div
          data-autocomplete-menu
          style={{ position: 'fixed', left: rect.left, top: rect.top, width: rect.width, zIndex: 1000 }}
          className="bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-auto"
        >
          {filtered.map(s => (
            <button
              key={s} type="button"
              onMouseDown={e => { e.preventDefault(); onChange(s); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 border-none bg-transparent cursor-pointer block"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
