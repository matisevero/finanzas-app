'use client'
import { useState, useRef, useEffect } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  suggestions: string[]
  placeholder?: string
  className?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  autoFocus?: boolean
  maxSuggestions?: number
}

/** Input de texto libre con sugerencias de valores usados antes (Descripción, Etiqueta, etc).
 *  `suggestions` ya debería venir ordenada por relevancia (ej. frecuencia de uso). */
export default function AutocompleteInput({
  value, onChange, suggestions, placeholder, className = 'input-field', onKeyDown, autoFocus, maxSuggestions = 6,
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  const q = value.trim().toLowerCase()
  const filtered = (q
    ? suggestions.filter(s => s.toLowerCase().includes(q) && s.toLowerCase() !== q)
    : suggestions
  ).slice(0, maxSuggestions)

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={className}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-48 overflow-auto">
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
