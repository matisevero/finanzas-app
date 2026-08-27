'use client'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui'

export default function TodosMovimientosSection() {
  const router = useRouter()
  return (
    <Card>
      <div className="text-slate-900 font-semibold text-[17px] mb-1.5">Todos los movimientos</div>
      <div className="text-slate-500 text-[13px] mb-5 leading-relaxed">
        Buscá, filtrá y hacé cambios masivos (categoría, etiqueta, nombre) en todo lo que cargaste, sin importar si aparece en "Salud de los datos" o no.
      </div>
      <button onClick={() => router.push('/dashboard/movimientos')}
        className="w-full py-2.5 rounded-lg border-none bg-blue-700 text-white text-sm font-medium cursor-pointer hover:bg-blue-800 transition-colors flex items-center justify-center gap-1.5">
        Ver todos los movimientos <span>›</span>
      </button>
    </Card>
  )
}
