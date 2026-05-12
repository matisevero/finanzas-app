'use client'
import { useState, useEffect } from 'react'
import { usePageHeader } from '@/context/PageHeaderContext'

// ─── StatCard ─────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string; value: string | number; sub?: string
  trend?: number; trendInvert?: boolean; color?: string; icon?: string
}
export function StatCard({ label, value, sub, trend, trendInvert = false, color = '#1A5E9E', icon }: StatCardProps) {
  const up   = trend !== undefined && trend >= 0
  const good = trendInvert ? !up : up
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 relative overflow-hidden transition-all hover:shadow-card-hover hover:border-slate-300 cursor-default"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div className="absolute top-0 right-0 w-16 h-16 rounded-bl-[64px]" style={{ background: color + '10' }} />
      {icon && <div className="text-xl mb-2">{icon}</div>}
      <div className="text-slate-500 text-[11px] font-bold uppercase tracking-widest mb-1">{label}</div>
      <div className="text-slate-900 text-2xl font-bold font-mono leading-tight">{value}</div>
      {sub && <div className="text-slate-400 text-xs mt-1">{sub}</div>}
      {trend !== undefined && (
        <div className="flex items-center gap-1 mt-2">
          <span className={`text-xs font-bold ${good ? 'text-emerald-700' : 'text-red-600'}`}>
            {up ? '▲' : '▼'} {Math.abs(trend)}%
          </span>
          <span className="text-slate-400 text-xs">vs año anterior</span>
        </div>
      )}
    </div>
  )
}

// ─── PageHeader ───────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, action }: {
  title: string; subtitle?: string; action?: React.ReactNode
}) {
  const { setHeader } = usePageHeader()
  useEffect(() => {
    setHeader(title, subtitle, action)
    return () => setHeader('', '', null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, subtitle])
  return null
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, className = '', padding = 'md', onClick }: {
  children: React.ReactNode; className?: string; padding?: 'sm' | 'md' | 'lg'; onClick?: () => void
}) {
  const p = { sm: 'p-4', md: 'p-6', lg: 'p-8' }[padding]
  return <div className={`bg-white border border-slate-200 rounded-2xl ${p} shadow-card ${className}`} onClick={onClick}>{children}</div>
}

// ─── CardTitle ────────────────────────────────────────────────────────────────
export function CardTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="text-slate-900 font-semibold text-[15px]">{children}</div>
      {action && <div>{action}</div>}
    </div>
  )
}

// ─── ChartToggle ─────────────────────────────────────────────────────────────
export function ChartToggle({ options, value, onChange }: { options: Array<{ value: string; label: string }>; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1 bg-slate-100 border border-slate-200 rounded-lg p-1">
      {options.map(opt => (
        <button key={opt.value} onClick={() => onChange(opt.value)}
          className={`px-3 py-1 rounded-md text-xs font-semibold transition-all border-none cursor-pointer ${value === opt.value ? 'bg-white text-slate-900 shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-700'}`}>
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-7 py-5 border-b border-slate-100">
          <h2 className="text-slate-900 font-semibold text-lg m-0">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none border-none bg-transparent cursor-pointer">×</button>
        </div>
        <div className="p-7">{children}</div>
      </div>
    </div>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────
export function Badge({ children, color = '#1A5E9E' }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: color + '18', color }}>
      {children}
    </span>
  )
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────
export function ProgressBar({ value, color = '#1A5E9E', height = 6 }: { value: number; color?: string; height?: number }) {
  return (
    <div className="bg-slate-100 rounded-full overflow-hidden" style={{ height }}>
      <div className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
    </div>
  )
}

// ─── LoadingSpinner ───────────────────────────────────────────────────────────
export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-2 border-blue-700 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
export function EmptyState({ icon = '📭', title, description, action }: { icon?: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-5xl mb-4">{icon}</div>
      <div className="text-slate-700 font-semibold text-lg mb-2">{title}</div>
      {description && <div className="text-slate-400 text-sm mb-6 max-w-xs">{description}</div>}
      {action}
    </div>
  )
}

// ─── Table helpers ────────────────────────────────────────────────────────────
export function Table({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto"><table className="w-full border-collapse">{children}</table></div>
}
export function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`text-slate-400 text-[11px] font-bold uppercase tracking-widest pb-3 border-b border-slate-100 ${right ? 'text-right' : 'text-left'}`}>{children}</th>
}
export function Td({ children, right, className = '' }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={`py-3 border-b border-slate-50 text-sm ${right ? 'text-right' : ''} ${className}`}>{children}</td>
}

// ─── FieldLabel ──────────────────────────────────────────────────────────────
export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="label mb-1.5 block">{children}</label>
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
export function Tabs({ tabs, value, onChange }: { tabs: Array<{ value: string; label: string }>; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
      {tabs.map(t => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={`tab ${value === t.value ? 'tab-active' : ''}`}>
          {t.label}
        </button>
      ))}
    </div>
  )
}
