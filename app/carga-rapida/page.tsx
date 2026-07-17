'use client'
import { useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store/appStore'
import { useCategoriasCustom } from '@/hooks'
import { createIngreso, createEgreso } from '@/lib/queries'
import { TIPOS_INGRESO, TIPOS_EGRESO } from '@/lib/utils/constants'
import FechaInput from '@/components/ui/FechaInput'
import MontoInput from '@/components/ui/MontoInput'
import CategoriaSelector from '@/components/ui/CategoriaSelector'
import type { Moneda, Quien } from '@/types'

type TipoVista = 'ingreso' | 'egreso'

const FORM_INIT = {
  descripcion: '', monto: '', fecha: new Date().toISOString().split('T')[0],
  moneda: 'ARS' as Moneda, quien: 'ambos' as Quien, categoria: '',
}

export default function CargaRapidaPage() {
  const router = useRouter()
  const monedasPalette = useAppStore(s => s.monedasPalette)
  const [tipoVista, setTipoVista] = useState<TipoVista>('egreso')
  const [form, setForm] = useState(FORM_INIT)
  const [analizando, setAnalizando] = useState(false)
  const [analizError, setAnalizError] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardadoOk, setGuardadoOk] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const modulo = tipoVista === 'ingreso' ? 'ingresos' : 'egresos'
  const { data: categoriasCustom, refetch: refetchCats } = useCategoriasCustom(modulo)
  const tiposBase = useMemo(() => {
    const base = tipoVista === 'ingreso' ? TIPOS_INGRESO : TIPOS_EGRESO
    return Object.entries(base).map(([key, cfg]) => ({ key, label: cfg.label, icon: cfg.icon, color: cfg.color }))
  }, [tipoVista])

  const resetForm = () => { setForm(FORM_INIT); setPreview(null); setAnalizError('') }

  const cambiarTipoVista = (t: TipoVista) => { setTipoVista(t); resetForm() }

  const handleArchivo = async (file: File) => {
    setAnalizando(true); setAnalizError('')
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res((r.result as string).split(',')[1])
        r.onerror = () => rej(new Error('Error leyendo archivo'))
        r.readAsDataURL(file)
      })
      setPreview(`data:${file.type};base64,${base64}`)

      const esPdf = file.type === 'application/pdf'
      const categoriasNombres = [...tiposBase.map(t => t.label), ...(categoriasCustom ?? []).map((c: any) => c.nombre)]

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              { type: esPdf ? 'document' : 'image', source: { type: 'base64', media_type: esPdf ? 'application/pdf' : (file.type || 'image/jpeg'), data: base64 } },
              { type: 'text', text: `Esto es un comprobante, ticket, recibo o captura de un ${tipoVista === 'ingreso' ? 'ingreso de dinero' : 'gasto'}. Extraé los datos.

Categorías disponibles (elegí la que más se acerque, si ninguna calza devolvé ""): ${categoriasNombres.join(', ')}

Respondé SOLO con un JSON, sin texto extra, sin backticks, sin markdown, con estos campos exactos:
{
  "descripcion": "texto corto y legible de qué es (comercio, concepto)",
  "monto": número positivo (sin separadores de miles, punto para decimales),
  "fecha": "YYYY-MM-DD" (la fecha del comprobante; si no aparece, usá null),
  "moneda": "ARS" o "USD",
  "categoria": "una de las categorías de la lista, o vacío si ninguna calza"
}` },
            ],
          }],
        }),
      })
      const data = await resp.json()
      const text = data.content?.map((b: any) => b.text || '').join('') ?? ''
      const clean = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)

      const catMatch = tiposBase.find(t => t.label.toLowerCase() === (parsed.categoria || '').toLowerCase())
      const catCustomMatch = (categoriasCustom ?? []).find((c: any) => c.nombre.toLowerCase() === (parsed.categoria || '').toLowerCase())

      setForm(p => ({
        ...p,
        descripcion: parsed.descripcion || p.descripcion,
        monto: parsed.monto ? String(parsed.monto) : p.monto,
        fecha: parsed.fecha || p.fecha,
        moneda: (parsed.moneda === 'USD' ? 'USD' : 'ARS'),
        categoria: catMatch?.key || catCustomMatch?.id || p.categoria,
      }))
    } catch (err: any) {
      setAnalizError('No pude leer el archivo — completá los datos a mano.')
    } finally {
      setAnalizando(false)
    }
  }

  const puedeGuardar = !!(form.descripcion.trim() && form.monto && form.fecha)

  const handleGuardar = async () => {
    if (!puedeGuardar) return
    setGuardando(true)
    try {
      if (tipoVista === 'ingreso') {
        await createIngreso({
          tipo: form.categoria || 'otro', descripcion: form.descripcion, monto: parseFloat(form.monto),
          moneda: form.moneda, fecha: form.fecha, quien: form.quien, recurrente: false, etiqueta: null,
        })
      } else {
        await createEgreso({
          categoria: form.categoria || 'otro', descripcion: form.descripcion, monto: parseFloat(form.monto),
          moneda: form.moneda, fecha: form.fecha, quien: form.quien, recurrente: false, etiqueta: null,
        })
      }
      setGuardadoOk(true)
      setTimeout(() => setGuardadoOk(false), 1800)
      resetForm()
    } catch (e) {
      console.error(e)
    } finally {
      setGuardando(false)
    }
  }

  const acento = tipoVista === 'ingreso' ? '#40B046' : '#F54927'

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col pb-28">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <button onClick={() => router.push('/dashboard')} className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 text-lg cursor-pointer">
          ←
        </button>
        <h1 className="text-lg font-semibold text-slate-900">Carga rápida</h1>
      </div>

      {/* Toggle Ingreso / Egreso */}
      <div className="px-4 mb-4">
        <div className="flex bg-slate-200/70 rounded-2xl p-1">
          <button onClick={() => cambiarTipoVista('egreso')}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold cursor-pointer border-none transition-all ${tipoVista === 'egreso' ? 'bg-white text-red-600 shadow-sm' : 'bg-transparent text-slate-500'}`}>
            Egreso
          </button>
          <button onClick={() => cambiarTipoVista('ingreso')}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold cursor-pointer border-none transition-all ${tipoVista === 'ingreso' ? 'bg-white text-emerald-600 shadow-sm' : 'bg-transparent text-slate-500'}`}>
            Ingreso
          </button>
        </div>
      </div>

      {/* Zona de foto/archivo */}
      <div className="px-4 mb-4">
        <input ref={fileRef} type="file" accept="image/*,.pdf" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) handleArchivo(f) }} />
        <button onClick={() => fileRef.current?.click()} disabled={analizando}
          className="w-full border-2 border-dashed border-slate-300 rounded-2xl py-6 flex flex-col items-center gap-2 bg-white cursor-pointer disabled:opacity-60">
          {preview && !analizando ? (
            <img src={preview} alt="" className="h-20 rounded-lg object-cover" />
          ) : (
            <span className="text-3xl">📷</span>
          )}
          <span className="text-sm font-medium text-slate-600">
            {analizando ? 'Leyendo el comprobante...' : preview ? 'Cambiar foto o archivo' : 'Sacar foto o subir archivo'}
          </span>
        </button>
        {analizError && <p className="text-xs text-red-500 mt-2 text-center">{analizError}</p>}
      </div>

      <div className="flex items-center gap-3 px-4 mb-4">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-xs text-slate-400">o completá a mano</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      {/* Formulario */}
      <div className="px-4 flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Monto</label>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-3">
            <select value={form.moneda} onChange={e => setForm(p => ({ ...p, moneda: e.target.value as Moneda }))}
              className="text-sm text-slate-500 border-none bg-transparent cursor-pointer flex-shrink-0">
              {monedasPalette.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <MontoInput bare value={form.monto} onChange={raw => setForm(p => ({ ...p, monto: raw }))}
              className="text-2xl font-bold font-mono flex-1" placeholder="0" />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Descripción</label>
          <input value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
            placeholder="Ej: Almuerzo, sueldo, super..."
            className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-base outline-none focus:border-blue-400" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Fecha</label>
            <div className="bg-white border border-slate-200 rounded-2xl px-3">
              <FechaInput bare value={form.fecha} onChange={iso => setForm(p => ({ ...p, fecha: iso }))} className="py-3 text-base" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Categoría</label>
            <div className="bg-white border border-slate-200 rounded-2xl px-3 py-1.5">
              <CategoriaSelector bare modulo={modulo} value={form.categoria} onChange={v => setForm(p => ({ ...p, categoria: v }))}
                categorias={categoriasCustom ?? []} categoriasBase={tiposBase} onCategoriasChange={refetchCats} />
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Quién</label>
          <div className="flex gap-2">
            {(['ambos', 'Mati', 'Dani'] as Quien[]).map(q => (
              <button key={q} onClick={() => setForm(p => ({ ...p, quien: q }))}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium cursor-pointer border transition-all ${form.quien === q ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>
                {q === 'ambos' ? 'Ambos' : q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Barra inferior fija */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4">
        <div className="max-w-md mx-auto">
          {guardadoOk ? (
            <div className="w-full py-3.5 rounded-2xl text-center font-semibold text-white" style={{ background: acento }}>
              ✓ Guardado
            </div>
          ) : (
            <button onClick={handleGuardar} disabled={!puedeGuardar || guardando}
              className="w-full py-3.5 rounded-2xl text-center font-semibold text-white border-none cursor-pointer disabled:opacity-40 transition-all"
              style={{ background: acento }}>
              {guardando ? 'Guardando...' : `Guardar ${tipoVista}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
