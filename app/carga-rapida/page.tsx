'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useCategoriasCustom, useFrecuenciaCategorias, useDescripcionesDistintas, usePersonas } from '@/hooks'
import { createIngreso, createEgreso, createEvento, createDeuda } from '@/lib/queries'
import { TIPOS_INGRESO, TIPOS_EGRESO, TIPOS_EVENTO } from '@/lib/utils/constants'
import { quienOpciones } from '@/lib/utils/quien'
import AutocompleteInput from '@/components/ui/AutocompleteInput'
import type { Moneda, Quien } from '@/types'

type Tipo = 'ingreso' | 'egreso' | 'deuda'
interface CatOpt { id: string; label: string }

const TIPO_INFO: Record<Tipo, { label: string; acc: string; accBg: string; gradEnd: string }> = {
  ingreso: { label: 'Ingreso', acc: '#15803D', accBg: '#EAF6EE', gradEnd: '#0F5132' },
  egreso:  { label: 'Egreso',  acc: '#DC2626', accBg: '#FEF0EF', gradEnd: '#7F1D1D' },
  deuda:   { label: 'Deuda',   acc: '#DC2626', accBg: '#FEF0EF', gradEnd: '#7F1D1D' },
}

function hoyISO() { return new Date().toISOString().split('T')[0] }
function ayerISO() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0] }
function fmtMonto(v: string) { if (!v) return ''; const n = parseFloat(v); return isNaN(n) ? '' : '$' + n.toLocaleString('es-AR') }

// Formateo en vivo con puntos de miles (igual que MontoInput en el resto de la app)
function toDisplay(raw: string): string {
  const clean  = raw.replace(/[^\d,]/g, '')
  const parts  = clean.split(',')
  const entero = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return parts.length > 1 ? entero + ',' + parts[1].slice(0, 2) : entero
}
function toRaw(display: string): string {
  return display.replace(/\./g, '').replace(',', '.')
}
function fromRawValue(value: string): string {
  if (!value) return ''
  const num = parseFloat(value)
  if (isNaN(num)) return ''
  return toDisplay(String(num).replace('.', ','))
}

function fmtFechaCorta(iso: string) {
  if (!iso) return ''
  if (iso === hoyISO()) return 'Hoy'
  if (iso === ayerISO()) return 'Ayer'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}`
}
function fmtFechaLarga(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function CargaRapidaPage() {
  const router = useRouter()
  const [tipo, setTipo]   = useState<Tipo | null>(null)
  const [step, setStep]   = useState(0) // 0 monto, 1 tipo, 2 subtipo(solo deuda) / grupo, 3 grupo-deuda / fecha
  const [form, setForm]   = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [guardando, setGuardando] = useState(false)
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
  const { data: personas } = usePersonas()
  const quienOpts = useMemo(() => quienOpciones(personas), [personas])
  const frecuenciaQ = useFrecuenciaCategorias((modulo ?? 'ingresos') as 'ingresos' | 'egresos')
  const descripcionesQ = useDescripcionesDistintas(tipo === 'deuda' ? 'eventos_calendario' : (modulo ?? 'ingresos'))

  const esDeudaLargo = tipo === 'deuda' && form.categoria === 'largo'
  const theme = tipo ? TIPO_INFO[tipo] : { label: '', acc: '#0F172A', accBg: '#F1F5F9', gradEnd: '#0F172A' }

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

  const [montoDisplay, setMontoDisplay] = useState('')
  const [cuotaDisplay, setCuotaDisplay] = useState('')

  useEffect(() => {
    const numActual = parseFloat(toRaw(montoDisplay))
    const numNuevo  = parseFloat(form.monto || '')
    const mismosVacios = toRaw(montoDisplay) === '' && !form.monto
    if (mismosVacios || numActual === numNuevo) return
    setMontoDisplay(fromRawValue(form.monto || ''))
  }, [form.monto]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const numActual = parseFloat(toRaw(cuotaDisplay))
    const numNuevo  = parseFloat(form.cuota_mensual || '')
    const mismosVacios = toRaw(cuotaDisplay) === '' && !form.cuota_mensual
    if (mismosVacios || numActual === numNuevo) return
    setCuotaDisplay(fromRawValue(form.cuota_mensual || ''))
  }, [form.cuota_mensual]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleMontoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input  = e.target.value.replace(/[^\d,]/g, '')
    const commas = (input.match(/,/g) || []).length
    if (commas > 1) return
    const formatted = toDisplay(input)
    setMontoDisplay(formatted)
    set('monto', toRaw(formatted))
  }

  function handleCuotaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input  = e.target.value.replace(/[^\d,]/g, '')
    const commas = (input.match(/,/g) || []).length
    if (commas > 1) return
    const formatted = toDisplay(input)
    setCuotaDisplay(formatted)
    set('cuota_mensual', toRaw(formatted))
  }

  function reset() {
    setTipo(null); setStep(0); setForm({}); setError(''); setAnalizError(''); setSaved(false)
  }
  function chooseTipo(t: Tipo) { setTipo(t); setForm(p => ({ monto: p.monto })); setStep(t === 'deuda' ? 2 : 3) }
  function chooseSubtipo(id: string) { setForm(p => ({ ...p, categoria: id })); setStep(id === 'largo' ? 4 : 3) }
  function set(field: string, value: string) { setForm(p => ({ ...p, [field]: value })) }

  // ── Campos ya obligatorios cumplidos → habilita Guardar ──
  const puedeGuardar = useMemo(() => {
    if (!tipo || !form.monto) return false
    if (tipo === 'deuda') {
      if (!form.categoria) return false
      if (form.categoria === 'largo') return !!form.fecha_vencimiento
      return true
    }
    return true
  }, [tipo, form])

  async function handleGuardar() {
    if (!tipo || !puedeGuardar) return
    setGuardando(true); setError('')
    try {
      if (tipo === 'ingreso' || tipo === 'egreso') {
        const catLabel = categoriaOptions.find(c => c.id === form.categoria)?.label
        const descripcion = form.descripcion || catLabel || TIPO_INFO[tipo].label
        const fecha = form.fecha || hoyISO()
        const quien = (form.quien || 'ambos') as Quien
        if (tipo === 'ingreso') {
          await createIngreso({ tipo: form.categoria || 'otro', descripcion, monto: parseFloat(form.monto), moneda: 'ARS' as Moneda, fecha, quien, recurrente: false, etiqueta: null })
        } else {
          await createEgreso({ categoria: form.categoria || 'otro', descripcion, monto: parseFloat(form.monto), moneda: 'ARS' as Moneda, fecha, quien, recurrente: false, etiqueta: null })
        }
      } else if (esDeudaLargo) {
        await createDeuda({
          nombre: form.nombre || 'Deuda nueva a largo plazo', banco: '',
          total_original: parseFloat(form.monto), pendiente: parseFloat(form.monto),
          cuota_mensual: parseFloat(form.cuota_mensual) || 0, tasa_interes: 0,
          moneda: 'ARS' as Moneda, fecha_inicio: hoyISO(), fecha_vencimiento: form.fecha_vencimiento,
          cuota_actual: 1, cuota_total: 1, color: '#5B3FA6', activa: true, etiqueta: null,
        })
      } else {
        const fecha = form.fecha || hoyISO()
        const [y, m, d] = fecha.split('-').map(Number)
        const subLabel = categoriaOptions.find(c => c.id === form.categoria)?.label
        await createEvento({
          dia: d, mes: m, año: y, tipo: form.categoria as any, descripcion: form.descripcion || subLabel || '',
          monto: parseFloat(form.monto), moneda: 'ARS' as Moneda, recurrente: false, pagado: false,
        })
      }
      setSaved(true)
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

      setForm(p => ({
        ...p,
        ...(parsed.descripcion ? { descripcion: parsed.descripcion } : {}),
        ...(parsed.monto ? { monto: String(parsed.monto) } : {}),
        ...(parsed.fecha ? { fecha: parsed.fecha } : {}),
        ...(catMatch ? { categoria: catMatch.id } : {}),
      }))
      setStep(3)
    } catch (err: any) {
      setAnalizError(err?.message ? `No pude leerlo: ${err.message}` : 'No pude leer el archivo — seguí completando a mano.')
    } finally {
      setAnalizando(false)
    }
  }

  useEffect(() => {
    if (step === 0) setTimeout(() => montoRef.current?.focus(), 50)
    if (step === 3) setTimeout(() => descRef.current?.focus(), 50)
  }, [step])

  function catLabel(id: string) { return categoriaOptions.find(c => c.id === id)?.label ?? id }

  const chipStyle = (active: boolean) => active
    ? { borderColor: theme.acc, background: theme.accBg, color: theme.acc, fontWeight: 700 as const }
    : { borderColor: '#E2E8F0', background: '#fff', color: '#475569' }

  // ── Pantalla de éxito: degradé + detalle completo ──
  if (saved && tipo) {
    const rows: [string, string][] = [['Tipo', esDeudaLargo ? 'Deuda a largo plazo' : tipo === 'deuda' ? catLabel(form.categoria) : TIPO_INFO[tipo].label]]
    rows.push(['Monto', fmtMonto(form.monto)])
    if (!esDeudaLargo && form.categoria && tipo !== 'deuda') rows.push(['Categoría', catLabel(form.categoria)])
    if (esDeudaLargo && form.nombre) rows.push(['Nombre', form.nombre])
    if (form.descripcion) rows.push(['Descripción', form.descripcion])
    if (tipo !== 'deuda' && form.quien) rows.push(['Quién', form.quien === 'ambos' ? 'Todos' : form.quien])
    if (esDeudaLargo) rows.push(['Vencimiento', fmtFechaLarga(form.fecha_vencimiento)])
    else rows.push(['Fecha', fmtFechaCorta(form.fecha || hoyISO())])

    return (
      <div className="max-w-md mx-auto min-h-screen flex flex-col p-6" style={{ background: `linear-gradient(160deg, ${theme.acc}, ${theme.gradEnd})` }}>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-[76px] h-[76px] rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.18)' }}>
            <div className="w-[52px] h-[52px] rounded-full bg-white flex items-center justify-center">
              <span className="text-2xl font-bold" style={{ color: theme.acc }}>✓</span>
            </div>
          </div>
          <div className="text-white/85 text-sm font-semibold mt-4">Guardado</div>
          <div className="text-white text-4xl font-bold font-mono mt-1">{fmtMonto(form.monto)}</div>

          <div className="w-full rounded-2xl px-4 mt-6" style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)' }}>
            {rows.map(([label, value], i) => (
              <div key={label} className={`flex items-center justify-between py-2.5 ${i < rows.length - 1 ? 'border-b border-white/15' : ''}`}>
                <span className="text-white/60 text-[12.5px] font-semibold">{label}</span>
                <span className="text-white text-sm font-bold">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={reset} className="w-full py-3.5 rounded-2xl font-semibold text-sm border-none cursor-pointer" style={{ background: '#fff', color: theme.acc }}>
          Cargar otro
        </button>
        <button onClick={() => router.push('/dashboard')} className="text-white/65 text-xs underline border-none bg-transparent cursor-pointer mt-3 mx-auto">
          Ir al Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col pb-6" style={{ background: tipo ? theme.accBg : undefined }}>
      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <button onClick={tipo ? reset : () => router.push('/dashboard')}
          className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 text-lg cursor-pointer flex-shrink-0">
          ‹
        </button>
        <h1 className="text-lg font-semibold text-slate-900">Carga rápida</h1>
      </div>

      <div className="px-4 flex-1">
        {/* Monto — siempre primero */}
        {step > 0 && (
          <div onClick={() => setStep(0)} className="flex items-center justify-between px-3.5 py-3 bg-white border border-slate-200 rounded-sm mb-2 cursor-pointer">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Monto</span>
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">{fmtMonto(form.monto)}</span>
              <span className="text-slate-300 text-xs">✎</span>
            </span>
          </div>
        )}
        {step === 0 && (
          <div className="bg-white border rounded-sm p-4" style={{ borderColor: theme.acc }}>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Monto</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-slate-900">$</span>
              <input ref={montoRef} type="text" inputMode="decimal" placeholder="0" value={montoDisplay}
                onChange={handleMontoChange}
                onKeyDown={e => { if (e.key === 'Enter' && form.monto) setStep(1) }}
                className="text-2xl font-bold font-mono text-slate-900 outline-none border-none w-full bg-transparent" />
            </div>
            <button onClick={() => form.monto && setStep(1)} disabled={!form.monto}
              className="w-full mt-3 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer disabled:opacity-40" style={{ background: '#0F172A' }}>
              Continuar
            </button>
          </div>
        )}

        {/* Tipo */}
        {step > 1 && tipo && (
          <div onClick={() => setStep(1)} className="flex items-center justify-between px-3.5 py-3 bg-white border border-slate-200 rounded-sm mb-2 cursor-pointer">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Tipo</span>
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">{TIPO_INFO[tipo].label}</span>
              <span className="text-slate-300 text-xs">✎</span>
            </span>
          </div>
        )}
        {step === 1 && (
          <div className="bg-white border border-slate-200 rounded-sm p-4">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">¿Qué es?</div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => chooseTipo('ingreso')} className="px-4 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer" style={{ borderColor: '#15803D', background: '#EAF6EE', color: '#15803D' }}>Ingreso</button>
              <button onClick={() => chooseTipo('egreso')} className="px-4 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer" style={{ borderColor: '#DC2626', background: '#FEF0EF', color: '#DC2626' }}>Egreso</button>
              <button onClick={() => chooseTipo('deuda')} className="px-4 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer" style={{ borderColor: '#DC2626', background: '#FEF0EF', color: '#DC2626' }}>Deuda</button>
            </div>
          </div>
        )}

        {tipo && step > 1 && (
          <>
            {/* Subtipo de deuda — requerido, define qué se guarda */}
            {tipo === 'deuda' && (
              <>
                {form.categoria && step > 2 && (
                  <div onClick={() => setStep(2)} className="flex items-center justify-between px-3.5 py-3 bg-white border border-slate-200 rounded-sm mb-2 cursor-pointer">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Tipo de deuda</span>
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{catLabel(form.categoria)}</span>
                      <span className="text-slate-300 text-xs">✎</span>
                    </span>
                  </div>
                )}
                {step === 2 && (
                  <div className="bg-white border rounded-sm p-4" style={{ borderColor: theme.acc }}>
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">¿Vencimiento o deuda nueva?</div>
                    <div className="flex flex-wrap gap-2">
                      {categoriaOptions.map(c => (
                        <button key={c.id} onClick={() => chooseSubtipo(c.id)}
                          className="px-3 py-2 rounded-xl border text-[13px] cursor-pointer"
                          style={c.id === 'largo' ? { borderColor: '#5B3FA6', background: '#F3EEFA', color: '#5B3FA6', fontWeight: 700 } : chipStyle(false)}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Rama: Deuda a largo plazo */}
            {esDeudaLargo && step >= 3 && (
              <>
                {form.nombre && step > 3 && (
                  <div onClick={() => setStep(3)} className="flex items-center justify-between px-3.5 py-3 bg-white border border-slate-200 rounded-sm mb-2 cursor-pointer">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Nombre</span>
                    <span className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-900">{form.nombre}</span><span className="text-slate-300 text-xs">✎</span></span>
                  </div>
                )}
                {step === 3 && (
                  <div className="bg-white border rounded-sm p-4" style={{ borderColor: theme.acc }}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Nombre <span className="normal-case font-normal text-slate-300">— opcional</span></div>
                      <button onClick={() => setStep(4)} className="text-[12.5px] font-bold border-none bg-transparent cursor-pointer flex items-center gap-0.5" style={{ color: theme.acc }}>
                        Saltear <span className="text-sm leading-none">›</span>
                      </button>
                    </div>
                    <input ref={descRef} type="text" placeholder="Ej: Préstamo auto, Tarjeta Visa..." value={form.nombre ?? ''}
                      onChange={e => set('nombre', e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') setStep(4) }}
                      className="w-full text-base text-slate-900 outline-none border-none bg-transparent mt-1.5" />
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-4 mb-1">Cuota mensual <span className="normal-case font-normal text-slate-300">— opcional</span></div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-lg font-bold font-mono text-slate-900">$</span>
                      <input type="text" inputMode="decimal" placeholder="0" value={cuotaDisplay}
                        onChange={handleCuotaChange}
                        className="text-lg font-bold font-mono text-slate-900 outline-none border-none w-full bg-transparent" />
                    </div>
                  </div>
                )}

                {step === 4 && (
                  <div className="bg-white border rounded-sm p-4" style={{ borderColor: theme.acc }}>
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Vencimiento</div>
                    <input type="date" autoFocus min={hoyISO()} value={form.fecha_vencimiento ?? ''}
                      onChange={e => set('fecha_vencimiento', e.target.value)}
                      className="w-full text-base text-slate-900 outline-none border border-slate-200 rounded-sm px-3 py-2 bg-slate-50" />
                  </div>
                )}
              </>
            )}

            {/* Rama: Ingreso / Egreso / Vencimiento de deuda */}
            {!esDeudaLargo && tipo !== 'deuda' && step >= 3 && (
              <>
                {(tipo === 'ingreso' || tipo === 'egreso') && step === 3 && !form.descripcion && !form.categoria && (
                  <div className="mb-3">
                    <input ref={fileRef} type="file" accept="image/*,.pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) handleArchivo(f) }} />
                    <button onClick={() => fileRef.current?.click()} disabled={analizando || !iaDisponible}
                      className="w-full border border-dashed border-slate-300 rounded-2xl py-2.5 flex items-center justify-center gap-2 bg-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-[13px] text-slate-600">
                      <span>{iaDisponible === false ? 'Análisis de foto — próximamente' : analizando ? 'Leyendo comprobante...' : 'Completar desde una foto o PDF'}</span>
                    </button>
                    {analizError && <p className="text-xs text-red-500 mt-2 text-center">{analizError}</p>}
                  </div>
                )}

                {(form.descripcion || form.categoria || form.quien) && step > 3 && (
                  <>
                    {form.descripcion && <div onClick={() => setStep(3)} className="flex items-center justify-between px-3.5 py-3 bg-white border border-slate-200 rounded-sm mb-2 cursor-pointer"><span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Descripción</span><span className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-900">{form.descripcion}</span><span className="text-slate-300 text-xs">✎</span></span></div>}
                    {form.categoria && <div onClick={() => setStep(3)} className="flex items-center justify-between px-3.5 py-3 bg-white border border-slate-200 rounded-sm mb-2 cursor-pointer"><span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Categoría</span><span className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-900">{catLabel(form.categoria)}</span><span className="text-slate-300 text-xs">✎</span></span></div>}
                    {form.quien && <div onClick={() => setStep(3)} className="flex items-center justify-between px-3.5 py-3 bg-white border border-slate-200 rounded-sm mb-2 cursor-pointer"><span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Quién</span><span className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-900">{form.quien === 'ambos' ? 'Todos' : form.quien}</span><span className="text-slate-300 text-xs">✎</span></span></div>}
                  </>
                )}
                {step === 3 && (
                  <div className="bg-white border rounded-sm p-4" style={{ borderColor: theme.acc }}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                        Descripción, categoría y quién <span className="normal-case font-normal text-slate-300">— opcional</span>
                      </div>
                      <button onClick={() => setStep(4)} className="text-[12.5px] font-bold border-none bg-transparent cursor-pointer flex items-center gap-0.5 flex-shrink-0 ml-2" style={{ color: theme.acc }}>
                        Saltear <span className="text-sm leading-none">›</span>
                      </button>
                    </div>
                    <AutocompleteInput value={form.descripcion ?? ''} onChange={v => set('descripcion', v)}
                      suggestions={descripcionesQ.data ?? []} placeholder="Ej: Supermercado, sueldo julio..." autoFocus
                      className="w-full text-base text-slate-900 outline-none border-none bg-transparent pb-3 mb-3 border-b border-slate-200 mt-1.5" />
                    {(
                      <>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {categoriaOptions.map(c => (
                            <button key={c.id} onClick={() => set('categoria', c.id)} className="px-3 py-2 rounded-xl border text-[12.5px] cursor-pointer" style={chipStyle(form.categoria === c.id)}>
                              {c.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {quienOpts.map(o => (
                            <button key={o.key} onClick={() => set('quien', o.key as Quien)} className="px-3 py-2 rounded-xl border text-[12.5px] cursor-pointer" style={chipStyle(form.quien === o.key)}>
                              {o.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {form.fecha && step > 4 && (
                  <div onClick={() => setStep(4)} className="flex items-center justify-between px-3.5 py-3 bg-white border border-slate-200 rounded-sm mb-2 cursor-pointer">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Fecha</span>
                    <span className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-900">{fmtFechaCorta(form.fecha)}</span><span className="text-slate-300 text-xs">✎</span></span>
                  </div>
                )}
                {step === 4 && (
                  <div className="bg-white border rounded-sm p-4" style={{ borderColor: theme.acc }}>
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Fecha <span className="normal-case font-normal text-slate-300">— opcional</span></div>
                    <div className="flex flex-wrap gap-2 items-center">
                      <button onClick={() => set('fecha', hoyISO())} className="px-3.5 py-2 rounded-xl border text-[13px] font-medium cursor-pointer" style={chipStyle(form.fecha === hoyISO())}>Hoy</button>
                      <button onClick={() => set('fecha', ayerISO())} className="px-3.5 py-2 rounded-xl border text-[13px] font-medium cursor-pointer" style={chipStyle(form.fecha === ayerISO())}>Ayer</button>
                      <label className="px-3.5 py-2 rounded-xl border text-[13px] font-medium cursor-pointer" style={chipStyle(false)}>
                        Elegir fecha
                        <input type="date" className="hidden" onChange={e => e.target.value && set('fecha', e.target.value)} />
                      </label>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Guardar — visible apenas se puede, sin importar cuánto falta completar */}
            {puedeGuardar && (
              <>
                {esDeudaLargo && (
                  <p className="text-xs text-slate-400 mt-3 mb-1 text-center">
                    Se crea con 1 cuota de referencia — para el detalle completo, editala después desde Deudas.
                  </p>
                )}
                {error && <p className="text-xs text-red-500 mt-2 mb-1 text-center">{error}</p>}
                <button onClick={handleGuardar} disabled={guardando}
                  className="w-full mt-3 py-3.5 rounded-2xl text-center font-semibold text-white border-none cursor-pointer disabled:opacity-60"
                  style={{ background: theme.acc }}>
                  {guardando ? 'Guardando...' : `Guardar ${esDeudaLargo ? 'deuda' : tipo === 'deuda' ? 'vencimiento' : theme.label.toLowerCase()}`}
                </button>
              </>
            )}
          </>
        )}
      </div>

      <div className="text-center py-5">
        <button onClick={() => router.push('/dashboard')} className="text-xs text-slate-400 hover:text-slate-600 border-none bg-transparent cursor-pointer transition-colors">
          Ir al Dashboard →
        </button>
      </div>
    </div>
  )
}
