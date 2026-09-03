'use client'
import { useState, useRef } from 'react'

export default function MultiDropdown({ label, options, selected, onChange }: {
  label: string
  options: { key: string; label: string }[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const allSelected = selected.length === 0
  const activeLabel = allSelected ? label
    : selected.length === 1 ? (options.find(o => o.key === selected[0])?.label ?? label)
    : `${label} (${selected.length})`
  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key])

  return (
    <div ref={ref} className="relative">
      <button type="button"
        onClick={() => setOpen(v => !v)}
        onBlur={e => { if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false) }}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-all ${!allSelected ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
        {activeLabel} <span className="opacity-60">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-modal min-w-[180px] overflow-hidden">
          <div className="p-1 max-h-56 overflow-y-auto">
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => onChange([])}
              className={`w-full text-left px-3 py-2 text-xs rounded-lg cursor-pointer border-none transition-colors ${allSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'bg-transparent text-slate-600 hover:bg-slate-50'}`}>
              Todos
            </button>
            {options.map(opt => (
              <button key={opt.key} type="button" onMouseDown={e => e.preventDefault()} onClick={() => toggle(opt.key)}
                className={`w-full text-left px-3 py-2 text-xs rounded-lg cursor-pointer border-none transition-colors flex items-center gap-2 ${selected.includes(opt.key) ? 'bg-blue-50 text-blue-700 font-semibold' : 'bg-transparent text-slate-600 hover:bg-slate-50'}`}>
                <span className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 ${selected.includes(opt.key) ? 'bg-blue-700 border-blue-700' : 'border-slate-300'}`}>
                  {selected.includes(opt.key) && <span className="text-white text-[8px]">✓</span>}
                </span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
