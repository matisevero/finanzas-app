'use client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCalidadHallazgosPendientes } from '@/hooks'
import { Card } from '@/components/ui'

export default function SaludDeDatosSection() {
  const router = useRouter()
  const { data: hallazgos, loading, error } = useCalidadHallazgosPendientes()

  if (error) {
    return (
      <Card>
        <div className="text-slate-900 font-semibold text-[15px] mb-2">Salud de los datos</div>
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">No se pudo cargar: {error}</div>
      </Card>
    )
  }
  if (loading || !hallazgos) return null

  const exactos = hallazgos.filter(h => h.tipo === 'duplicado_exacto').length
  const probables = hallazgos.filter(h => h.tipo === 'duplicado_probable').length
  const sinEtiqueta = hallazgos.filter(h => h.tipo === 'sin_etiqueta').length

  return (
    <Card>
      <div className="flex items-start justify-between mb-1.5">
        <div className="text-slate-900 font-semibold text-[17px]">Salud de los datos</div>
        <Link href="/dashboard/movimientos"
          className="text-[11px] text-slate-500 border border-slate-200 rounded-full px-2.5 py-1 hover:border-slate-300 hover:text-slate-700 transition-colors flex-shrink-0 whitespace-nowrap no-underline">
          Todos los movimientos
        </Link>
      </div>
      <div className="text-slate-500 text-[13px] mb-5 leading-relaxed">
        Duplicados y movimientos sin etiqueta o categoría, detectados automáticamente. Se revisa todo desde una pantalla aparte.
      </div>
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <div className="bg-slate-50 rounded-lg px-3 py-2.5">
          <div className="text-xl font-semibold" style={{color: exactos > 0 ? '#DC2626' : undefined}}>{exactos}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Duplicados exactos</div>
        </div>
        <div className="bg-slate-50 rounded-lg px-3 py-2.5">
          <div className="text-xl font-semibold" style={{color: probables > 0 ? '#D97706' : undefined}}>{probables}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Probables</div>
        </div>
        <div className="bg-slate-50 rounded-lg px-3 py-2.5">
          <div className="text-xl font-semibold text-slate-700">{sinEtiqueta}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Sin etiqueta</div>
        </div>
      </div>
      <button onClick={() => router.push('/dashboard/revision')}
        className="w-full py-2.5 rounded-lg border-none bg-blue-700 text-white text-sm font-medium cursor-pointer hover:bg-blue-800 transition-colors flex items-center justify-center gap-1.5">
        Revisar todo <span>›</span>
      </button>
    </Card>
  )
}
