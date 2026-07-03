'use client'
import { useState, useEffect } from 'react'

interface MontoInputProps {
  value: string
  onChange: (raw: string) => void
  placeholder?: string
  className?: string
  onFocus?: () => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void
  bare?: boolean
}

function toDisplay(raw: string): string {
  const clean  = raw.replace(/[^\d,]/g, '')
  const parts  = clean.split(',')
  const entero = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return parts.length > 1 ? entero + ',' + parts[1].slice(0, 2) : entero
}

function toRaw(display: string): string {
  return display.replace(/\./g, '').replace(',', '.')
}

function fromRawValue(value: string): string {
  if (!value) return ''
  const num = parseFloat(value)
  if (isNaN(num)) return ''
  return toDisplay(String(num).replace('.', ','))
}

export default function MontoInput({ value, onChange, placeholder = '0', className = '', onFocus, onKeyDown, onPaste, bare = false }: MontoInputProps) {
  const [display, setDisplay] = useState(() => fromRawValue(value))

  useEffect(() => {
    const numActual = parseFloat(toRaw(display))
    const numNuevo  = parseFloat(value)
    const mismosVacios = toRaw(display) === '' && !value
    if (mismosVacios || numActual === numNuevo) return
    setDisplay(fromRawValue(value))
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input  = e.target.value.replace(/[^\d,]/g, '')
    const commas = (input.match(/,/g) || []).length
    if (commas > 1) return
    const formatted = toDisplay(input)
    setDisplay(formatted)
    onChange(toRaw(formatted))
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      placeholder={placeholder}
      className={bare
        ? `w-full h-8 px-2 bg-transparent border-none outline-none focus:ring-2 focus:ring-blue-400/40 font-mono text-xs text-right ${className}`
        : `input-field font-mono ${className}`}
    />
  )
}
