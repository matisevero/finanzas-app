'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useCategoriasCustom, useFrecuenciaCategorias } from '@/hooks'
import { createIngreso, createEgreso, createEvento, createDeuda } from '@/lib/queries'
import { TIPOS_INGRESO, TIPOS_EGRESO, TIPOS_EVENTO } from '@/lib/utils/constants'
import type { Moneda, Quien } from '@/types'

type Tipo = 'ingreso' | 'egreso' | 'deuda'
type Campo = 'monto' | 'descripcion' | 'categoria' | 'fecha' | 'quien' | 'subtipo' | 'nombre' | 'cuota_mensual' | 'fecha_vencimiento'

const TIPO_INFO: Record<Tipo, { label: string; acc: string; accBg: string }> = {
  ingreso: { label: 'Ingreso', acc: '#2F6B12', accBg: '#EAF3DE' },
  egreso:  { label: 'Egreso',  acc: '#991B1B', accBg: '#FEF2F2' },
  deuda:   { label: 'Deuda',   acc: '#0C447C', accBg: '#EFF6FF' },
}

const FLOWS_FIJOS: Record<'ingreso' | 'egreso', Campo[]> = {
  ingreso: ['monto', 'descripcion', 'categoria', 'fecha', 'quien'],
  egreso:  ['monto', 'descripcion', 'categoria', 'fecha', 'quien'],
}
const FLOW_DEUDA_VENCIMIENTO: Campo[] = ['subtipo', 'descripcion', 'monto', 'fecha']
const FLOW_DEUDA_LARGO: Campo[] = ['subtipo', 'nombre', 'monto', 'cuota_mensual', 'fecha_vencimiento']

function hoyISO() { return new Date().toISOString().split('T')[0] }
function ayerISO() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0] }
function fmtMonto(v: string) { if (!v) return ''; const n = parseFloat(v); return isNaN(n) ? '' : '$' + n.toLocaleString('es-AR') }
function fmtFechaChip(iso: string) {
  if (!iso) return ''
  if (iso === hoyISO()) return 'Hoy'
  if (iso === ayerISO()) return 'Ayer'
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

interface CatOpt { id: string; label: string }

export default function CargaRapidaPage() {
  const router = useRouter()
  const [tipo, setTipo]   = useState<Tipo | null>(null)
  const [step, setStep]   = useState(0)
  const [form, setForm]   = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [guardadoOk, setGuardadoOk] = useState(false)
  const [error, setError] = useState('')
  const [analizando, setAnalizando] = useState(false)
  const [analizError, setAnalizError] = useState('')
  const [iaDisponible, setIaDisponible] = useState<boolean | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const montoRef = useRef<HTMLInputElement>(null)
  const descRef  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/analizar-comprobante').then(r => r.json()).then(d => setIaDisponible(!!d.disponible)).catch(() => setIaDisponible(false))
  }, [])

  const modulo: 'ingresos' | 'egresos' | null = tipo === 'ingreso' ? 'ingresos' : tipo === 'egreso' ? 'egresos' : null
  const { data: categoriasCustom } = useCategoriasCustom(modulo ?? 'ingresos')
  const frecuenciaQ = useFrecuenciaCategorias((modulo ?? 'ingresos') as 'ingresos' | 'egresos')

  const esDeudaLargo = tipo === 'deuda' && form.subtipo === 'largo'

  const categoriaOptions: CatOpt[] = useMemo(() => {
    if (!tipo) return []
    if (tipo === 'deuda') {
      const eventos = Object.entries(TIPOS_EVENTO)
        .filter(([k]) => k !== 'ingreso' && k !== 'egreso')
        .map(([key, cfg]) => ({ id: key, label: cfg.label }))
      return [...eventos, { id: 'largo', label: 'Deuda nueva a largo plazo' }]
    }
    if (!modulo) return []
    const base = tipo === 'ingreso' ? TIPOS_INGRESO : TIPOS_EGRESO
    const baseOpts: CatOpt[] = Object.entries(base).map(([key, cfg]) => ({ id: key, label: cfg.label }))
    const customOpts: CatOpt[] = (categoriasCustom ?? []).map((c: any) => ({ id: c.id, label: c.nombre }))
    const all = [...baseOpts, ...customOpts]
    const frec = frecuenciaQ.data
    return frec ? [...all].sort((a, b) => (frec[b.id] ?? 0) - (frec[a.id] ?? 0)) : all
  }, [tipo, modulo, categoriasCustom, frecuenciaQ.data])

  const flow: Campo[] = useMemo(() => {
    if (tipo === 'ingreso' || tipo === 'egreso') return FLOWS_FIJOS[tipo]
    if (tipo === 'deuda') {
      if (!form.subtipo) return ['subtipo']
      return form.subtipo === 'largo' ? FLOW_DEUDA_LARGO : FLOW_DEUDA_VENCIMIENTO
    }
    return []
  }, [tipo, form.subtipo])

  function fieldLabel(f: Campo): string {
    switch (f) {
      case 'monto': return esDeudaLargo ? 'Monto total' : 'Monto'
      case 'descripcion': return 'Descripción'
      case 'categoria': return 'Categoría'
      case 'fecha': return 'Fecha'
      case 'quien': return 'Quién'
      case 'subtipo': return 'Tipo'
      case 'nombre': return 'Nombre de la deuda'
      case 'cuota_mensual': return 'Cuota mensual'
      case 'fecha_vencimiento': return 'Vencimiento'
    }
  }

  function reset() { setTipo(null); setStep(0); setForm({}); setError(''); setAnalizError('') }
  function chooseTipo(t: Tipo) { setTipo(t); setStep(0); setForm({}) }
  function commit(field: string, value: string) {
    setForm(p => {
      const next = { ...p, [field]: value }
      // Si cambia el subtipo de deuda, descarta lo que se hubiera cargado del otro sub-flujo
      if (field === 'subtipo') {
        return { subtipo: value }
      }
      return next
    })
    setStep(s => s + 1)
  }
  function editStep(i: number) { setStep(i) }
  function goBack() { if (step > 0) setStep(s => s - 1); else reset() }

  const puedeGuardar = !!tipo && flow.length > 0 && flow.every(f => form[f] !== undefined && form[f] !== '')

  async function handleGuardar() {
    if (!tipo || !puedeGuardar) return
    setGuardando(true); setError('')
    try {
      if (tipo === 'ingreso') {
        await createIngreso({
          tipo: form.categoria || 'otro', descripcion: form.descripcion, monto: parseFloat(form.monto),
          moneda: 'ARS' as Moneda, fecha: form.fecha, quien: form.quien as Quien, recurrente: false, etiqueta: null,
        })
      } else if (tipo === 'egreso') {
        await createEgreso({
          categoria: form.categoria || 'otro', descripcion: form.descripcion, monto: parseFloat(form.monto),
          moneda: 'ARS' as Moneda, fecha: form.fecha, quien: form.quien as Quien, recurrente: false, etiqueta: null,
        })
      } else if (esDeudaLargo) {
        await createDeuda({
          nombre: form.nombre, banco: '',
          total_original: parseFloat(form.monto), pendiente: parseFloat(form.monto),
          cuota_mensual: parseFloat(form.cuota_mensual) || 0, tasa_interes: 0,
          moneda: 'ARS' as Moneda, fecha_inicio: hoyISO(), fecha_vencimiento: form.fecha_vencimiento,
          cuota_actual: 1, cuota_total: 1, color: '#5B3FA6', activa: true, etiqueta: null,
        })
      } else {
        const [y, m, d] = form.fecha.split('-').map(Number)
        await createEvento({
          dia: d, mes: m, año: y, tipo: form.subtipo as any, descripcion: form.descripcion,
          monto: parseFloat(form.monto), moneda: 'ARS' as Moneda, recurrente: false, pagado: false,
        })
      }
      setGuardadoOk(true)
      setTimeout(() => setGuardadoOk(false), 1600)
      reset()
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar. Probá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  const handleArchivo = async (file: File) => {
    if (tipo !== 'ingreso' && tipo !== 'egreso') return
    setAnalizando(true); setAnalizError('')
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res((r.result as string).split(',')[1])
        r.onerror = () => rej(new Error('Error leyendo archivo'))
        r.readAsDataURL(file)
      })
      const esPdf = file.type === 'application/pdf'
      const categoriasNombres = categoriaOptions.map(c => c.label)
      const prompt = `Esto es un comprobante, ticket, recibo o captura de un ${tipo === 'ingreso' ? 'ingreso de dinero' : 'gasto'}. Extraé los datos.

Categorías disponibles (elegí la que más se acerque, si ninguna calza devolvé ""): ${categoriasNombres.join(', ')}

Respondé SOLO con un JSON, sin texto extra, sin backticks, sin markdown, con estos campos exactos:
{
  "descripcion": "texto corto y legible de qué es (comercio, concepto)",
  "monto": número positivo (sin separadores de miles, punto para decimales),
  "fecha": "YYYY-MM-DD" (la fecha del comprobante; si no aparece, usá null),
  "categoria": "una de las categorías de la lista, o vacío si ninguna calza"
}`
      const resp = await fetch('/api/analizar-comprobante', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mediaType: file.type, esPdf, prompt }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Error analizando el archivo')
      const clean = (data.text || '').replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)

      const catMatch = categoriaOptions.find(c => c.label.toLowerCase() === (parsed.categoria || '').toLowerCase())

      const next: Record<string, string> = { ...form }
      if (parsed.descripcion) next.descripcion = parsed.descripcion
      if (parsed.monto) next.monto = String(parsed.monto)
      if (parsed.fecha) next.fecha = parsed.fecha
      if (catMatch) next.categoria = catMatch.id
      setForm(next)

      const firstMissing = flow.findIndex(f => !next[f])
      setStep(firstMissing === -1 ? flow.length : firstMissing)
    } catch (err: any) {
      setAnalizError(err?.message ? `No pude leerlo: ${err.message}` : 'No pude leer el archivo — segui completando a mano.')
    } finally {
      setAnalizando(false)
    }
  }

  useEffect(() => {
    if (!tipo) return
    const field = flow[step]
    if (field === 'monto') setTimeout(() => montoRef.current?.focus(), 50)
    if (field === 'descripcion' || field === 'nombre') setTimeout(() => descRef.current?.focus(), 50)
  }, [tipo, step]) // eslint-disable-line react-hooks/exhaustive-deps

  const acc = tipo ? TIPO_INFO[tipo].acc : '#0F172A'
  const accBg = tipo ? TIPO_INFO[tipo].accBg : '#F1F5F9'

  function summaryValue(field: Campo): string {
    if (field === 'monto') return fmtMonto(form.monto)
    if (field === 'fecha') return fmtFechaChip(form.fecha)
    if (field === 'fecha_vencimiento') return form.fecha_vencimiento
    if (field === 'categoria') return categoriaOptions.find(c => c.id === form.categoria)?.label ?? form.categoria
    if (field === 'subtipo') return categoriaOptions.find(c => c.id === form.subtipo)?.label ?? form.subtipo
    if (field === 'quien') return form.quien === 'ambos' ? 'Ambos' : form.quien
    return form[field]
  }

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <button onClick={tipo ? goBack : () => router.push('/dashboard')}
          className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 text-lg cursor-pointer flex-shrink-0">
          ‹
        </button>
        <h1 className="text-lg font-semibold text-slate-900">Carga rápida</h1>
      </div>

      <div className="px-4 flex-1">
        {/* ── Paso 0: elegir tipo ── */}
        {!tipo && (
          <>
            <div className="text-sm text-slate-500 mb-3">¿Qué querés cargar?</div>
            <div className="flex flex-col gap-2.5">
              <button onClick={() => chooseTipo('ingreso')}
                className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl p-4 cursor-pointer text-left">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-lg" style={{ background: '#EAF3DE', color: '#2F6B12' }}>↓</div>
                <span className="text-[15px] font-semibold text-slate-900">Ingreso</span>
              </button>
              <button onClick={() => chooseTipo('egreso')}
                className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl p-4 cursor-pointer text-left">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-lg" style={{ background: '#FEF2F2', color: '#991B1B' }}>↑</div>
                <span className="text-[15px] font-semibold text-slate-900">Egreso</span>
              </button>
              <button onClick={() => chooseTipo('deuda')}
                className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl p-4 cursor-pointer text-left">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-lg" style={{ background: '#EFF6FF', color: '#0C447C' }}>$</div>
                <div>
                  <div className="text-[15px] font-semibold text-slate-900">Deuda</div>
                  <div className="text-xs text-slate-400">Vencimiento o deuda nueva a largo plazo</div>
                </div>
              </button>
            </div>
          </>
        )}

        {/* ── Flujo progresivo ── */}
        {tipo && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: accBg, color: acc }}>
                {esDeudaLargo ? 'Deuda a largo plazo' : tipo === 'deuda' ? 'Vencimiento' : TIPO_INFO[tipo].label}
              </span>
              <button onClick={reset} className="text-xs text-slate-400 underline border-none bg-transparent cursor-pointer p-0">cambiar</button>
            </div>

            {/* Analizar foto: solo ingreso/egreso, primer paso */}
            {(tipo === 'ingreso' || tipo === 'egreso') && step === 0 && !form.monto && (
              <div className="mb-3">
                <input ref={fileRef} type="file" accept="image/*,.pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) handleArchivo(f) }} />
                <button onClick={() => fileRef.current?.click()} disabled={analizando || !iaDisponible}
                  className="w-full border border-dashed border-slate-300 rounded-2xl py-3 flex items-center justify-center gap-2 bg-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm text-slate-600">
                  <span>{iaDisponible === false ? 'Análisis de foto — próximamente' : analizando ? 'Leyendo comprobante...' : 'Cargar desde una foto o PDF'}</span>
                </button>
                {analizError && <p className="text-xs text-red-500 mt-2 text-center">{analizError}</p>}
              </div>
            )}

            {/* Pasos completados */}
            {flow.slice(0, step).map((field, i) => (
              <div key={field} onClick={() => editStep(i)}
                className="flex items-center justify-between px-3.5 py-3 bg-white border border-slate-200 rounded-sm mb-2 cursor-pointer">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{fieldLabel(field)}</span>
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{summaryValue(field)}</span>
                  <span className="text-slate-300 text-xs">✎</span>
                </span>
              </div>
            ))}

            {/* Paso activo */}
            {step < flow.length && (
              <div className="bg-white border rounded-sm p-4" style={{ borderColor: acc }}>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">{fieldLabel(flow[step])}</div>

                {flow[step] === 'monto' && (
                  <>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-bold font-mono text-slate-900">$</span>
                      <input ref={montoRef} type="number" inputMode="decimal" placeholder="0"
                        value={form.monto ?? ''} onChange={e => setForm(p => ({ ...p, monto: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter' && form.monto) commit('monto', form.monto) }}
                        className="text-2xl font-bold font-mono text-slate-900 outline-none border-none w-full bg-transparent" />
                    </div>
                    <button onClick={() => form.monto && commit('monto', form.monto)} disabled={!form.monto}
                      className="w-full mt-3 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer disabled:opacity-40" style={{ background: acc }}>
                      Continuar
                    </button>
                  </>
                )}

                {(flow[step] === 'descripcion' || flow[step] === 'nombre') && (
                  <>
                    <input ref={descRef} type="text"
                      placeholder={flow[step] === 'nombre' ? 'Ej: Préstamo auto, Tarjeta Visa...' : 'Ej: Supermercado, sueldo julio...'}
                      value={form[flow[step]] ?? ''} onChange={e => setForm(p => ({ ...p, [flow[step]]: e.target.value }))}
                      onKeyDown={e => { const v = form[flow[step]]; if (e.key === 'Enter' && v?.trim()) commit(flow[step], v) }}
                      className="w-full text-[15px] text-slate-900 outline-none border-none bg-transparent" />
                    <button onClick={() => { const v = form[flow[step]]; if (v?.trim()) commit(flow[step], v) }} disabled={!form[flow[step]]?.trim()}
                      className="w-full mt-3 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer disabled:opacity-40" style={{ background: acc }}>
                      Continuar
                    </button>
                  </>
                )}

                {flow[step] === 'cuota_mensual' && (
                  <>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xl font-bold font-mono text-slate-900">$</span>
                      <input type="number" inputMode="decimal" placeholder="0"
                        value={form.cuota_mensual ?? ''} onChange={e => setForm(p => ({ ...p, cuota_mensual: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter' && form.cuota_mensual) commit('cuota_mensual', form.cuota_mensual) }}
                        className="text-xl font-bold font-mono text-slate-900 outline-none border-none w-full bg-transparent" />
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => commit('cuota_mensual', '0')}
                        className="text-xs text-slate-400 underline border-none bg-transparent cursor-pointer">no sé todavía</button>
                      <button onClick={() => form.cuota_mensual && commit('cuota_mensual', form.cuota_mensual)} disabled={!form.cuota_mensual}
                        className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer disabled:opacity-40" style={{ background: acc }}>
                        Continuar
                      </button>
                    </div>
                  </>
                )}

                {(flow[step] === 'categoria' || flow[step] === 'subtipo') && (
                  <div className="flex flex-wrap gap-2">
                    {categoriaOptions.map(c => (
                      <button key={c.id} onClick={() => commit(flow[step], c.id)}
                        className="px-3 py-2 rounded-xl border text-[13px] font-medium cursor-pointer"
                        style={c.id === 'largo'
                          ? { borderColor: '#5B3FA6', background: '#F3EEFA', color: '#5B3FA6', fontWeight: 700 }
                          : form[flow[step]] === c.id
                            ? { borderColor: acc, background: accBg, color: acc }
                            : { borderColor: '#E2E8F0', background: '#fff', color: '#475569' }}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}

                {flow[step] === 'fecha' && (
                  <div className="flex flex-wrap gap-2 items-center">
                    <button onClick={() => commit('fecha', hoyISO())}
                      className="px-3.5 py-2 rounded-xl border text-[13px] font-medium cursor-pointer"
                      style={form.fecha === hoyISO() ? { borderColor: acc, background: accBg, color: acc } : { borderColor: '#E2E8F0', background: '#fff', color: '#475569' }}>
                      Hoy
                    </button>
                    <button onClick={() => commit('fecha', ayerISO())}
                      className="px-3.5 py-2 rounded-xl border text-[13px] font-medium cursor-pointer"
                      style={form.fecha === ayerISO() ? { borderColor: acc, background: accBg, color: acc } : { borderColor: '#E2E8F0', background: '#fff', color: '#475569' }}>
                      Ayer
                    </button>
                    <label className="px-3.5 py-2 rounded-xl border text-[13px] font-medium cursor-pointer" style={{ borderColor: '#E2E8F0', background: '#fff', color: '#475569' }}>
                      Elegir fecha
                      <input type="date" className="hidden" onChange={e => e.target.value && commit('fecha', e.target.value)} />
                    </label>
                  </div>
                )}

                {flow[step] === 'fecha_vencimiento' && (
                  <input type="date" autoFocus min={hoyISO()}
                    value={form.fecha_vencimiento ?? ''} onChange={e => e.target.value && commit('fecha_vencimiento', e.target.value)}
                    className="w-full text-[15px] text-slate-900 outline-none border border-slate-200 rounded-sm px-3 py-2 bg-slate-50" />
                )}

                {flow[step] === 'quien' && (
                  <div className="flex gap-2">
                    {(['ambos', 'Mati', 'Dani'] as Quien[]).map(q => (
                      <button key={q} onClick={() => commit('quien', q)}
                        className="flex-1 py-2.5 rounded-xl text-sm font-medium cursor-pointer border"
                        style={form.quien === q ? { borderColor: acc, background: accBg, color: acc } : { borderColor: '#E2E8F0', background: '#fff', color: '#475569' }}>
                        {q === 'ambos' ? 'Ambos' : q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Resumen final */}
            {step >= flow.length && flow.length > 0 && (
              <>
                {esDeudaLargo && (
                  <p className="text-xs text-slate-400 mb-3 text-center">
                    Se crea con 1 cuota de referencia — para el detalle completo de cuotas y tasa, editala después desde Deudas.
                  </p>
                )}
                {error && <p className="text-xs text-red-500 mb-2 text-center">{error}</p>}
                {guardadoOk ? (
                  <div className="w-full py-3.5 rounded-2xl text-center font-semibold text-white mt-1" style={{ background: acc }}>
                    ✓ Guardado
                  </div>
                ) : (
                  <button onClick={handleGuardar} disabled={!puedeGuardar || guardando}
                    className="w-full py-3.5 rounded-2xl text-center font-semibold text-white border-none cursor-pointer disabled:opacity-40 mt-1"
                    style={{ background: acc }}>
                    {guardando ? 'Guardando...' : esDeudaLargo ? 'Guardar deuda' : `Guardar ${TIPO_INFO[tipo].label.toLowerCase()}`}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Ir al Dashboard — sutil, siempre visible */}
      <div className="text-center py-5">
        <button onClick={() => router.push('/dashboard')}
          className="text-xs text-slate-400 hover:text-slate-600 border-none bg-transparent cursor-pointer transition-colors">
          Ir al Dashboard →
        </button>
      </div>
    </div>
  )
}
