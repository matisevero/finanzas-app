'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useCalidadHallazgosPendientes } from '@/hooks'
import { getUltimoAnalisisCalidad, marcarAnalisisCalidadEjecutado } from '@/lib/queries'
import { ejecutarAnalisisCalidadDatos } from '@/lib/analisisCalidad'

const VEINTICUATRO_HS = 24 * 60 * 60 * 1000
const DIAS_PARA_ALERTA = 5
// Mati: solo tiene sentido interrumpir en las páginas donde realmente vas a
// cargar/editar movimientos — en el resto es ruido.
const PAGINAS_CON_AVISO = ['/dashboard/ingresos', '/dashboard/egresos']

export default function CalidadDatosWatcher() {
  const pathname = usePathname()
  const mostrarEnEstaPagina = PAGINAS_CON_AVISO.some(p => pathname?.startsWith(p))
  const { data: hallazgos, refetch } = useCalidadHallazgosPendientes()
  const [mostrarModal, setMostrarModal] = useState(false)

  // Dispara el análisis en segundo plano como mucho una vez cada 24hs — no en
  // cada carga de página, para no recalcular todo cada vez que navegás.
  useEffect(() => {
    (async () => {
      try {
        const ultimo = await getUltimoAnalisisCalidad()
        if (ultimo && Date.now() - new Date(ultimo).getTime() < VEINTICUATRO_HS) return
        await ejecutarAnalisisCalidadDatos()
        await marcarAnalisisCalidadEjecutado()
        refetch()
      } catch (e) { console.error('Análisis de calidad de datos falló:', e) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mati: "sin etiqueta" no es un error de datos — las etiquetas son opcionales y no todo
  // movimiento tiene por qué llevar una. El aviso recurrente (banner + modal a los N días) es
  // solo para duplicados; "sin etiqueta" sigue disponible en /dashboard/revision y /dashboard/salud,
  // simplemente no interrumpe.
  const hallazgosParaAviso = (hallazgos ?? []).filter(h => h.tipo !== 'sin_etiqueta')

  useEffect(() => {
    if (hallazgosParaAviso.length === 0) return
    const masViejo = hallazgosParaAviso[0].detectado_en // ya viene ordenado por detectado_en asc
    const dias = (Date.now() - new Date(masViejo).getTime()) / (24 * 60 * 60 * 1000)
    if (dias < DIAS_PARA_ALERTA) return
    const hoy = new Date().toISOString().split('T')[0]
    const yaMostradoHoy = typeof window !== 'undefined' && localStorage.getItem('calidad_modal_shown') === hoy
    if (!yaMostradoHoy) setMostrarModal(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hallazgosParaAviso])

  const cerrarModal = () => {
    setMostrarModal(false)
    if (typeof window !== 'undefined') localStorage.setItem('calidad_modal_shown', new Date().toISOString().split('T')[0])
  }

  if (!mostrarEnEstaPagina || hallazgosParaAviso.length === 0) return null

  const exactos   = hallazgosParaAviso.filter(h => h.tipo === 'duplicado_exacto').length
  const probables = hallazgosParaAviso.filter(h => h.tipo === 'duplicado_probable').length
  const detalle = [
    exactos > 0 && `${exactos} duplicado${exactos > 1 ? 's' : ''} exacto${exactos > 1 ? 's' : ''}`,
    probables > 0 && `${probables} posible${probables > 1 ? 's' : ''} duplicado${probables > 1 ? 's' : ''}`,
  ].filter(Boolean).join(', ')

  return (
    <>
      <div className="mx-4 md:mx-8 mt-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
        <span className="text-sm text-amber-800">{hallazgosParaAviso.length} movimiento{hallazgosParaAviso.length > 1 ? 's' : ''} para revisar ({detalle})</span>
        <Link href="/dashboard/revision" className="text-sm text-amber-800 font-medium underline flex-shrink-0">Revisar</Link>
      </div>

      {mostrarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center">
            <div className="text-slate-900 font-semibold text-[15px] mb-1">Hay movimientos hace tiempo sin revisar</div>
            <div className="text-slate-500 text-sm mb-5">{detalle} — algunos llevan {DIAS_PARA_ALERTA}+ días pendientes.</div>
            <div className="flex gap-2">
              <button onClick={cerrarModal} className="btn-ghost flex-1">Ahora no</button>
              <Link href="/dashboard/revision" onClick={cerrarModal} className="btn-primary flex-1 text-center">Revisar</Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
