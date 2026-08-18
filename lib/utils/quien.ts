import type { Persona } from '@/types'

// Paleta fija para los chips de "Quién" — antes era un ternario hardcodeado a
// Mati (azul) / Dani (rosa) / resto (gris). Ahora que las personas se agregan
// desde Configuración, el color se asigna determinísticamente por nombre así
// cualquier persona nueva tiene un chip consistente sin tocar código.
const PALETA_QUIEN: { bg: string; text: string }[] = [
  { bg: 'bg-blue-50',    text: 'text-blue-700' },
  { bg: 'bg-pink-50',    text: 'text-pink-700' },
  { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  { bg: 'bg-amber-50',   text: 'text-amber-700' },
  { bg: 'bg-purple-50',  text: 'text-purple-700' },
  { bg: 'bg-cyan-50',    text: 'text-cyan-700' },
]
const COLOR_TODOS = { bg: 'bg-slate-100', text: 'text-slate-500' }

function hashNombre(nombre: string): number {
  let h = 0
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0
  return h
}

/** Clases Tailwind para el chip de una persona (o "ambos"/"todos", que siempre es gris). */
export function colorQuien(nombre: string): { bg: string; text: string } {
  if (!nombre || nombre === 'ambos') return COLOR_TODOS
  return PALETA_QUIEN[hashNombre(nombre) % PALETA_QUIEN.length]
}

/** Opciones para los selectores de "Quién": Todos (fijo) + personas activas. */
export function quienOpciones(personas: Persona[] | null | undefined): { key: string; label: string }[] {
  const activas = (personas ?? []).filter(p => p.estado === 'activa')
  return [{ key: 'ambos', label: 'Todos' }, ...activas.map(p => ({ key: p.nombre, label: p.nombre }))]
}
