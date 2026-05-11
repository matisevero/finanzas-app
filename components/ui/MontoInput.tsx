'use client'
import { useState } from 'react'

interface MontoInputProps {
  value: string
  onChange: (raw: string) => void
  placeholder?: string
  className?: string
}

function toDisplay(raw: string): string {
  const clean = raw.replace(/[^\d,]/g, '')
  const parts  = clean.split(',')
  const entero = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return parts.length > 1 ? entero + ',' + parts[1].slice(0, 2) : entero
}

function toRaw(display: string): string {
  return display.replace(/\./g, '').replace(',', '.')
}

export default function MontoInput({ value, onChange, placeholder = '0', className = '' }: MontoInputProps) {
  const [display, setDisplay] = useState(() => {
    if (!value) return ''
    const num = parseFloat(value)
    if (isNaN(num)) return ''
    return toDisplay(value.replace('.', ','))
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input   = e.target.value.replace(/[^\d,]/g, '')
    const commas  = (input.match(/,/g) || []).length
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
      placeholder={placeholder}
      className={`input-field font-mono ${className}`}
    />
  )
}
