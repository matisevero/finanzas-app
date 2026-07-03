import { parseFechaFlexible } from '@/components/ui/FechaInput'

export function parseCeldaMonto(s: string): number | null {
  const clean = s.trim().replace(/[^\d.,-]/g, '')
  if (!clean) return null
  const normalizado = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean
  const n = parseFloat(normalizado)
  return isNaN(n) ? null : n
}

// Matchea el texto pegado contra una opción conocida (categoría, quién) por label exacto (sin importar mayúsculas).
// Si no matchea, devuelve '' — se deja en blanco para completar a mano, nunca se inventa ni se crea de más.
export function matchOpcion(texto: string, opciones: { key: string; label: string }[]): string {
  const t = texto.trim().toLowerCase()
  const match = opciones.find(o => o.label.toLowerCase() === t)
  return match ? match.key : ''
}

export function celdaFechaISO(texto: string, añoDefault: number): string {
  return parseFechaFlexible(texto, añoDefault) ?? ''
}

const ICONOS_ACCION = new Set(['✎', '✕', '✓'])

// Convierte texto pegado (tabs entre columnas, saltos de línea entre filas) en una grilla de celdas.
// Descarta líneas vacías y líneas que son solo un ícono de acción (✎/✕) — se cuelan al copiar filas
// directo de nuestra propia tabla, porque el botón editar/borrar queda en su propia línea.
export function parsePegadoTSV(texto: string): string[][] {
  return texto
    .split(/\r?\n/)
    .map(l => l.split('\t'))
    .filter(celdas => {
      const noVacias = celdas.map(c => c.trim()).filter(c => c.length > 0)
      if (noVacias.length === 0) return false
      if (noVacias.every(c => ICONOS_ACCION.has(c))) return false
      return true
    })
}

