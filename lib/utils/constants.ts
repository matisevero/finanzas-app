import type { TipoIngreso, TipoEgreso, Moneda } from '@/types'

// ─── Nav ─────────────────────────────────────────────────────────────────────
export const NAV_ITEMS = [
  { id: 'dashboard',     label: 'Dashboard',     icon: '◈', href: '/dashboard'               },
  { id: 'ingresos',      label: 'Ingresos',       icon: '↑', href: '/dashboard/ingresos'      },
  { id: 'egresos',       label: 'Egresos',        icon: '↓', href: '/dashboard/egresos'       },
  { id: 'deudas',        label: 'Deudas',         icon: '⬡', href: '/dashboard/deudas'        },
  { id: 'tarjetas',      label: 'Tarjetas',       icon: '▣', href: '/dashboard/tarjetas'      },
  { id: 'cashflow',      label: 'Cash Flow',      icon: '≋', href: '/dashboard/cashflow'      },
  { id: 'comparador',    label: 'Comparador',     icon: '⇌', href: '/dashboard/comparador'    },
  { id: 'precios',       label: 'Precios',        icon: '△', href: '/dashboard/precios'       },
  { id: 'metas',         label: 'Metas',          icon: '◎', href: '/dashboard/metas'         },
  { id: 'salud',         label: 'Salud',          icon: '♥', href: '/dashboard/salud'         },
  { id: 'configuracion', label: 'Configuración',  icon: '⚙', href: '/dashboard/configuracion' },
] as const

// ─── Meses ────────────────────────────────────────────────────────────────────
export const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
export const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// ─── Tipos ingreso ────────────────────────────────────────────────────────────
export const TIPOS_INGRESO: Record<TipoIngreso, { label: string; color: string; icon: string }> = {
  salario:   { label: 'Salario',    color: '#40B046', icon: '👔' },
  freelance: { label: 'Freelance',  color: '#52A852', icon: '💻' },
  alquiler:  { label: 'Alquiler',   color: '#BA7517', icon: '🏠' },
  otro:      { label: 'Otro',       color: '#888780', icon: '💰' },
}

// ─── Tipos egreso ─────────────────────────────────────────────────────────────
export const TIPOS_EGRESO: Record<TipoEgreso, { label: string; color: string; bg: string; icon: string }> = {
  tarjeta:   { label: 'Tarjetas',       color: '#1A5E9E', bg: '#E6F1FB', icon: '💳' },
  usd:       { label: 'Inversiones USD',color: '#40B046', bg: '#E9F6EA', icon: '💵' },
  servicios: { label: 'Servicios',      color: '#E8A020', bg: '#FEF3E2', icon: '⚡' },
  oli:       { label: 'Oli',            color: '#D4537E', bg: '#FBEAF0', icon: '🌿' },
  casa:      { label: 'Casa',           color: '#5B3FA6', bg: '#EEEDFE', icon: '🏠' },
  social:    { label: 'Social',         color: '#F54927', bg: '#FEF0EE', icon: '🎬' },
  expensas:  { label: 'Expensas',       color: '#1D9E75', bg: '#E1F5EE', icon: '🏢' },
  salud:     { label: 'Salud',          color: '#D03E21', bg: '#FEF0EE', icon: '💊' },
  super:     { label: 'Supermercado',   color: '#E8A020', bg: '#FEF3E2', icon: '🛒' },
  impuestos: { label: 'Impuestos',      color: '#444441', bg: '#F1EFE8', icon: '📋' },
  viajes:    { label: 'Viajes',         color: '#0F6E56', bg: '#E1F5EE', icon: '✈️' },
  auto:      { label: 'Automóvil',      color: '#26215C', bg: '#EEEDFE', icon: '🚗' },
  educacion: { label: 'Educación',      color: '#72243E', bg: '#FBEAF0', icon: '🎓' },
  otro:      { label: 'Otro',           color: '#5F5E5A', bg: '#F1EFE8', icon: '📦' },
}

// ─── Tipos evento calendario ──────────────────────────────────────────────────
export const TIPOS_EVENTO: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  ingreso:  { label: 'Ingreso',    color: '#40B046', bg: '#E9F6EA', icon: '↑'  },
  egreso:   { label: 'Egreso',     color: '#F54927', bg: '#FEF0EE', icon: '↓'  },
  tarjeta:  { label: 'Tarjeta',    color: '#1A5E9E', bg: '#E6F1FB', icon: '💳' },
  casa:     { label: 'Casa/Cuota', color: '#5B3FA6', bg: '#EEEDFE', icon: '🏠' },
  servicio: { label: 'Servicio',   color: '#E8A020', bg: '#FEF3E2', icon: '⚡' },
  edu:      { label: 'Educación',  color: '#D4537E', bg: '#FBEAF0', icon: '🎓' },
  expensa:  { label: 'Expensa',    color: '#1D9E75', bg: '#E1F5EE', icon: '🏢' },
}

// ─── Monedas ─────────────────────────────────────────────────────────────────
export const MONEDAS_INFO: Record<Moneda, { label: string; symbol: string; flag: string }> = {
  ARS:  { label: 'Peso Argentino', symbol: '$',   flag: '🇦🇷' },
  USD:  { label: 'Dólar USD',      symbol: 'US$', flag: '🇺🇸' },
  EUR:  { label: 'Euro',           symbol: '€',   flag: '🇪🇺' },
  BTC:  { label: 'Bitcoin',        symbol: '₿',   flag: '₿'   },
  ETH:  { label: 'Ethereum',       symbol: 'Ξ',   flag: 'Ξ'   },
  USDT: { label: 'Tether',         symbol: '₮',   flag: '₮'   },
}

// ─── Paletas para comparador ──────────────────────────────────────────────────
export const PALETA_INGRESOS = ['#40B046','#52A852','#85C985','#B8E0B8']
export const PALETA_EGRESOS  = ['#F54927','#E05A22','#F28B30','#F5B042','#F7C96A','#F9DC95','#E8A598','#D9776C','#C94E42']
export const PALETA_DEUDAS   = ['#5B3FA6','#8462CC','#A988D8','#CBAFE6']
export const PALETA_TARJETAS = ['#1A5E9E','#2E7EC2','#4D9AD4','#72B3E0','#97CCE8','#BCDFF2']

// ─── Colores para metas ───────────────────────────────────────────────────────
export const META_COLORS = ['#1A5E9E','#F54927','#40B046','#5B3FA6','#E8A020','#D4537E','#1D9E75','#888780']

// ─── Íconos ───────────────────────────────────────────────────────────────────
export const ICONOS_GENERALES = [
  '🎯','🛡️','✈️','💻','🚗','🏠','🎓','💍','🏋️','🌴',
  '📱','🎸','🐶','👶','🏦','🚀','💰','🏖️','💧','⚡',
  '🔥','🌐','⛽','💊','📺','🎵','📦','💳','🛒','🌿',
]

// ─── Categorías de precios recurrentes ───────────────────────────────────────
export const CATS_PRECIO = ['Servicios','Salarios','Suscripciones','Alimentos','Transporte','Vivienda','Otro'] as const

export const COLORES_PRECIO: Record<string, string> = {
  Servicios:     '#E8A020',
  Salarios:      '#40B046',
  Suscripciones: '#5B3FA6',
  Alimentos:     '#1D9E75',
  Transporte:    '#C07010',
  Vivienda:      '#1A5E9E',
  Otro:          '#888780',
}
