'use client'
import { useState, useEffect } from 'react'
import { useAppStore } from '@/store/appStore'

interface FechaInputProps {
  value: string
  onChange: (iso: string) => void
  placeholder?: string
  className?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void
  bare?: boolean
}

function pad(n: number) { return String(n).padStart(2, '0') }

function toDisplay(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return ''
  return `${d}/${m}/${y}`
}

const MESES_ABR: Record<string, number> = {
  ene:1, feb:2, mar:3, abr:4, may:5, jun:6,
  jul:7, ago:8, sep:9, set:9, oct:10, nov:11, dic:12,
}

// Acepta "6/7", "6/7/26", "06-07-2026", "10-jul-2026", "10 de julio 2026", etc. Si falta el año, usa añoDefault.
export function parseFechaFlexible(input: string, añoDefault: number): string | null {
  const clean = input.trim()
  if (!clean) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean

  // Formato con mes en texto: "10-jul-2026", "10 jul 26", "10 de julio de 2026"
  const conMes = clean.toLowerCase().replace(/\s+de\s+/g, ' ').match(/^(\d{1,2})[\s\-\/]+([a-záéíóúñ]{3,})[a-záéíóúñ]*[\s\-\/]+(\d{2,4})$/)
  if (conMes) {
    const day = parseInt(conMes[1], 10)
    const month = MESES_ABR[conMes[2].slice(0, 3)]
    if (!month) return null
    const year = conMes[3].length === 2 ? 2000 + parseInt(conMes[3], 10) : parseInt(conMes[3], 10)
    const diasEnMes = new Date(year, month, 0).getDate()
    if (day < 1 || day > diasEnMes) return null
    return `${year}-${pad(month)}-${pad(day)}`
  }

  const m = clean.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/)
  if (!m) return null

  const day = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  if (month < 1 || month > 12) return null

  let year = añoDefault
  if (m[3]) year = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)

  const diasEnMes = new Date(year, month, 0).getDate()
  if (day < 1 || day > diasEnMes) return null

  return `${year}-${pad(month)}-${pad(day)}`
}

export default function FechaInput({ value, onChange, placeholder = 'dd/mm/aa', className = '', onKeyDown, onPaste, bare = false }: FechaInputProps) {
  const añoActivo = useAppStore(s => s.añoActivo)
  const [text, setText]   = useState(() => toDisplay(value))
  const [invalid, setInvalid] = useState(false)

  useEffect(() => { setText(toDisplay(value)) }, [value])

  const commit = () => {
    if (!text.trim()) { setInvalid(false); return }
    const iso = parseFechaFlexible(text, añoActivo)
    if (iso) {
      setInvalid(false)
      setText(toDisplay(iso))
      if (iso !== value) onChange(iso)
    } else {
      setInvalid(true)
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={e => { setText(e.target.value); setInvalid(false) }}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit()
        onKeyDown?.(e)
      }}
      onPaste={onPaste}
      placeholder={placeholder}
      title={invalid ? 'Fecha no válida — probá dd/mm/aa' : undefined}
      className={bare
        ? `w-full h-8 px-2 bg-transparent border-none outline-none focus:ring-2 focus:ring-blue-400/40 font-mono text-xs ${invalid ? 'text-red-600' : ''} ${className}`
        : `input-field font-mono ${invalid ? 'border-red-400 text-red-600' : ''} ${className}`}
    />
  )
}
