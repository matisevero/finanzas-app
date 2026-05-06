# Finanzas Personal App — v2

Hub financiero personal construido con Next.js 14, TypeScript, Supabase y Tailwind CSS.

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 14 (App Router) |
| Lenguaje | TypeScript strict |
| Base de datos | Supabase (PostgreSQL + Auth + RLS) |
| Estado global | Zustand (persistido en localStorage) |
| Estilos | Tailwind CSS |
| Gráficos | Recharts |

## Estructura

```
finanzas-app/
├── app/
│   ├── auth/login/          → Login y registro
│   ├── auth/callback/       → Callback de confirmación de email
│   └── dashboard/           → Todas las pantallas (protegidas)
│       ├── layout.tsx        → Sidebar + TopBar
│       ├── page.tsx          → Dashboard principal
│       ├── ingresos/
│       ├── egresos/
│       ├── deudas/           → Calendario (tab 1) + Largo plazo (tab 2)
│       ├── tarjetas/
│       ├── cashflow/
│       ├── comparador/
│       ├── precios/
│       ├── metas/
│       ├── salud/
│       └── configuracion/
│
├── components/
│   ├── ui/index.tsx          → StatCard, Modal, Badge, Table, Tabs, etc.
│   └── layout/               → Sidebar, TopBar
│
├── lib/
│   ├── supabase/             → client.ts (browser) + server.ts (SSR)
│   ├── queries/index.ts      → Todas las queries CRUD a Supabase
│   └── utils/
│       ├── constants.ts      → Nav, categorías, colores, íconos
│       ├── formatters.ts     → fmt(), fmtFull(), fmtDate(), varPct()
│       └── calculations.ts   → Salud financiera, cash flow, metas
│
├── types/index.ts            → Todos los tipos TypeScript del dominio
├── hooks/index.ts            → useIngresos, useEgresos, useYear, etc.
├── store/appStore.ts         → Zustand: año activo, monedas, usuario
├── middleware.ts             → Auth guard (redirige si no está logueado)
└── supabase-schema.sql       → Schema completo — ejecutar una sola vez
```

## Navegación

```
Dashboard → Ingresos → Egresos → Deudas → Tarjetas →
Cash Flow → Comparador → Precios → Metas → Salud → Configuración
```

**Deudas** tiene dos tabs:
- Tab 1: Calendario (vista por defecto) — vencimientos del mes
- Tab 2: Largo plazo — préstamos y cuotas con historial

## Setup paso a paso

### 1. Instalar dependencias

```bash
npm install
```

### 2. Crear proyecto en Supabase

1. Ir a [supabase.com](https://supabase.com) → New project
2. Nombre: `finanzas-personal`
3. Región: South America (São Paulo)

### 3. Ejecutar el schema

1. Supabase Dashboard → SQL Editor → New query
2. Pegar contenido de `supabase-schema.sql`
3. Click Run

### 4. Configurar variables de entorno

```bash
cp .env.local.example .env.local
```

Editar `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

### 5. Correr en desarrollo

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000)

## Módulos

| Módulo | Estado |
|--------|--------|
| Auth (login/registro/callback) | ✅ Completo |
| Layout (Sidebar + TopBar) | ✅ Completo |
| Dashboard | ✅ Conectado a Supabase |
| Ingresos | 🔧 UI pendiente (queries listas) |
| Egresos | 🔧 UI pendiente |
| Deudas (Calendario + Largo plazo) | 🔧 UI pendiente |
| Tarjetas | 🔧 UI pendiente |
| Cash Flow | 🔧 UI pendiente |
| Comparador | 🔧 UI pendiente |
| Precios recurrentes | 🔧 UI pendiente |
| Metas de ahorro | 🔧 UI pendiente |
| Salud financiera | 🔧 UI pendiente |
| Configuración | 🔧 UI pendiente |

## Convenciones

- **Queries**: siempre en `lib/queries/index.ts`, nunca inline en componentes
- **Tipos**: `types/index.ts`, importar desde `@/types`
- **Formateo**: usar `fmt()` de `lib/utils/formatters.ts`
- **Estado global**: Zustand en `store/appStore.ts`
- **Data fetching**: hooks en `hooks/index.ts`
- **UI atoms**: `components/ui/index.tsx`

## Deploy en Vercel

```bash
vercel --prod
```

Agregar en Vercel Dashboard → Environment Variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
