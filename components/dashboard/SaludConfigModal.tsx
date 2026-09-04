'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  useSaludCategorias, useSaludOverridesMes, useCategoriasCustom, useAhorros, useMetas,
} from '@/hooks'
import {
  createSaludCategoria, updateSaludCategoria, deleteSaludCategoria,
  upsertSaludOverrideMes, deleteSaludOverrideMes,
} from '@/lib/queries'
import { Modal, ChartToggle, FieldLabel, LoadingSpinner } from '@/components/ui'
import type { SaludCategoriaConfig, SaludFuenteTipo, SaludOverrideMes } from '@/types'

const FUENTES: { value: SaludFuenteTipo; label: string; unidad: '%' | 'meses' }[] = [
  { value: 'deuda_cuotas',       label: 'Cuotas de Deudas activas',        unidad: '%' },
  { value: 'ratio_ahorro_libre', label: 'Ingreso − Egresos − Cuotas',      unidad: '%' },
  { value: 'tarjeta_uso',        label: 'Uso de Tarjetas vs límite real',  unidad: '%' },
  { value: 'ratio_gasto',        label: 'Egresos totales vs ingreso',      unidad: '%' },
  { value: 'egreso_recurrente',  label: 'Egresos marcados "recurrente"',   unidad: '%' },
  { value: 'egreso_categoria',   label: 'Egresos de categoría(s) elegida', unidad: '%' },
  { value: 'ahorro_metas',       label: 'Ahorros/Metas elegidos',          unidad: 'meses' },
]

// Defaults sensatos por fuente — al agregar o cambiar de fuente, evita que quede
// pegado un umbral/comparación que no tiene sentido para la fuente nueva (ej.
// "menor a 36%" en una categoría de Ahorro, que debería ser "mayor a").
const DEFAULTS_FUENTE: Record<SaludFuenteTipo, { comparacion: 'menor_que'|'mayor_que'; umbral: number }> = {
  deuda_cuotas:       { comparacion: 'menor_que', umbral: 36 },
  ratio_ahorro_libre: { comparacion: 'mayor_que', umbral: 20 },
  tarjeta_uso:        { comparacion: 'menor_que', umbral: 30 },
  ratio_gasto:        { comparacion: 'menor_que', umbral: 70 },
  egreso_recurrente:  { comparacion: 'menor_que', umbral: 50 },
  egreso_categoria:   { comparacion: 'menor_que', umbral: 10 },
  ahorro_metas:        { comparacion: 'mayor_que', umbral: 6 },
}

// Categorías sugeridas para "+ Agregar" — evita arrancar de un formulario en
// blanco sin saber qué fuente/umbral tiene sentido.
const SUGERENCIAS: { nombre: string; icono: string; color: string; fuente_tipo: SaludFuenteTipo }[] = [
  { nombre: 'Suscripciones', icono: '🔁', color: '#1A5E9E', fuente_tipo: 'egreso_categoria' },
  { nombre: 'Social',        icono: '🍻', color: '#D85A30', fuente_tipo: 'egreso_categoria' },
  { nombre: 'Gastos fijos',  icono: '🏠', color: '#E8A020', fuente_tipo: 'egreso_recurrente' },
  { nombre: 'Ahorro real',   icono: '💰', color: '#40B046', fuente_tipo: 'ahorro_metas' },
]

let tmpSeq = 0
const tmpId = () => `tmp-${Date.now()}-${tmpSeq++}`

type CatDraft = Omit<SaludCategoriaConfig, 'user_id' | 'created_at'> & { _tmp?: boolean; _eliminar?: boolean }

export default function SaludConfigModal({
  open, onClose, año, mes, onSaved,
}: { open: boolean; onClose: () => void; año: number; mes: number; onSaved: () => void }) {
  const { data: categoriasDb, loading: lc } = useSaludCategorias()
  const { data: overridesDb,  loading: lo } = useSaludOverridesMes(año, mes)
  const { data: catsEgreso }  = useCategoriasCustom('egresos')
  const { data: ahorros }     = useAhorros()
  const { data: metas }       = useMetas()

  const [modoMes, setModoMes] = useState(false)
  const [draft, setDraft] = useState<CatDraft[]>([])
  const [overrides, setOverrides] = useState<Record<string, { peso?: number; umbral?: number }>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setModoMes(false)
    if (categoriasDb) setDraft(categoriasDb.map(c => ({ ...c })))
  }, [open, categoriasDb])

  useEffect(() => {
    if (!overridesDb) return
    const m: Record<string, { peso?: number; umbral?: number }> = {}
    overridesDb.forEach(o => { m[o.categoria_id] = { peso: o.peso ?? undefined, umbral: o.umbral ?? undefined } })
    setOverrides(m)
  }, [overridesDb])

  const activos = useMemo(() => draft.filter(c => !c._eliminar), [draft])
  const pesoTotal = useMemo(() =>
    activos.reduce((s, c) => s + (modoMes ? (overrides[c.id]?.peso ?? c.peso) : c.peso), 0)
  , [activos, overrides, modoMes])

  // Ya NO se auto-reparte: mover un slider solo cambia ESE peso. El cartel de
  // arriba (pesoTotal) avisa si no suma 100 — vos decidís a cuál bajarle.
  const setPesoGeneral = (id: string, nuevoPeso: number) => updateDraft(id, { peso: nuevoPeso })

  const setOverridePeso = (id: string, peso: number) => setOverrides(prev => ({ ...prev, [id]: { ...prev[id], peso } }))
  const setOverrideUmbral = (id: string, umbral: number) => setOverrides(prev => ({ ...prev, [id]: { ...prev[id], umbral } }))
  const quitarOverride = (id: string) => setOverrides(prev => { const n = { ...prev }; delete n[id]; return n })

  const updateDraft = (id: string, patch: Partial<CatDraft>) =>
    setDraft(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))

  const addCategoria = (sug?: typeof SUGERENCIAS[number]) => {
    const fuente_tipo = sug?.fuente_tipo ?? 'egreso_categoria'
    const d = DEFAULTS_FUENTE[fuente_tipo]
    setDraft(prev => [...prev, {
      id: tmpId(), nombre: sug?.nombre ?? 'Nueva categoría', icono: sug?.icono ?? '📌', color: sug?.color ?? '#1A5E9E',
      peso: 0, umbral: d.umbral, comparacion: d.comparacion, fuente_tipo,
      fuente_config: {}, orden: prev.length, activa: true, _tmp: true,
    }])
  }

  const marcarEliminar = (id: string) => updateDraft(id, { _eliminar: true })

  const toggleCategoriaEnConfig = (id: string, campo: 'categorias' | 'ahorro_ids' | 'meta_ids', valor: string) => {
    setDraft(prev => prev.map(c => {
      if (c.id !== id) return c
      const actuales = new Set((c.fuente_config[campo] as string[] | undefined) ?? [])
      actuales.has(valor) ? actuales.delete(valor) : actuales.add(valor)
      return { ...c, fuente_config: { ...c.fuente_config, [campo]: Array.from(actuales) } }
    }))
  }

  const guardar = async () => {
    setSaving(true)
    try {
      for (const c of draft) {
        if (c._eliminar) { if (!c._tmp) await deleteSaludCategoria(c.id); continue }
        if (c._tmp) {
          await createSaludCategoria({
            nombre: c.nombre, icono: c.icono, color: c.color, peso: c.peso, umbral: c.umbral,
            comparacion: c.comparacion, fuente_tipo: c.fuente_tipo, fuente_config: c.fuente_config,
            orden: c.orden, activa: c.activa,
          })
        } else {
          await updateSaludCategoria(c.id, {
            nombre: c.nombre, icono: c.icono, color: c.color, peso: c.peso, umbral: c.umbral,
            comparacion: c.comparacion, fuente_tipo: c.fuente_tipo, fuente_config: c.fuente_config,
          })
        }
      }
      for (const c of activos) {
        const ov = overrides[c.id]
        if (ov && (ov.peso !== undefined || ov.umbral !== undefined)) {
          await upsertSaludOverrideMes({ categoria_id: c.id, año, mes, peso: ov.peso ?? null, umbral: ov.umbral ?? null })
        } else {
          await deleteSaludOverrideMes(c.id, año, mes).catch(() => {})
        }
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Configurar Salud Financiera" wide>
      {(lc && !categoriasDb) ? <LoadingSpinner /> : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <ChartToggle
              options={[{ value: 'general', label: 'Config general (anual)' }, { value: 'mes', label: `Override este mes` }]}
              value={modoMes ? 'mes' : 'general'}
              onChange={v => setModoMes(v === 'mes')}
            />
            <button onClick={() => addCategoria()} className="px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-medium border-none cursor-pointer hover:opacity-90">
              + Categoría en blanco
            </button>
          </div>

          {!modoMes && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[11px] text-slate-400">Sugeridas:</span>
              {SUGERENCIAS.filter(s => !activos.some(c => c.nombre === s.nombre)).map(s => (
                <button key={s.nombre} onClick={() => addCategoria(s)}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border-none cursor-pointer font-medium hover:bg-slate-200">
                  + {s.icono} {s.nombre}
                </button>
              ))}
            </div>
          )}

          <div className={`text-xs rounded-lg px-3 py-2 border ${Math.round(pesoTotal) === 100 ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-red-50 border-red-200 text-red-600'}`}>
            Suma de pesos{modoMes ? ' (con overrides de este mes)' : ''}: <span className="font-mono font-bold">{Math.round(pesoTotal * 10) / 10}%</span>
            {Math.round(pesoTotal) !== 100 && ' — bajá alguna para que sume 100 (no se reparte solo)'}
          </div>

          <div className="flex flex-col gap-3 max-h-[55vh] overflow-y-auto pr-1">
            {activos.map(c => {
              const fuente = FUENTES.find(f => f.value === c.fuente_tipo)!
              const ov = overrides[c.id]
              const pesoMostrado = modoMes ? (ov?.peso ?? c.peso) : c.peso
              const umbralMostrado = modoMes ? (ov?.umbral ?? c.umbral) : c.umbral
              return (
                <div key={c.id} className="border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input value={c.icono} onChange={e => updateDraft(c.id, { icono: e.target.value })}
                        className="w-9 text-center input-field !p-1" maxLength={4} />
                      <input value={c.nombre} onChange={e => updateDraft(c.id, { nombre: e.target.value })}
                        className="input-field flex-1 !py-1.5 text-sm font-semibold" />
                    </div>
                    <span className="font-mono text-xs font-bold text-slate-700 w-12 text-right flex-shrink-0">{pesoMostrado.toFixed(1)}%</span>
                    <button onClick={() => marcarEliminar(c.id)} title="Eliminar categoría"
                      className="text-red-400 hover:text-red-600 border-none bg-transparent cursor-pointer text-sm flex-shrink-0">✕</button>
                  </div>

                  <input type="range" min={0} max={100} step={0.5} value={pesoMostrado}
                    onChange={e => modoMes ? setOverridePeso(c.id, parseFloat(e.target.value)) : setPesoGeneral(c.id, parseFloat(e.target.value))}
                    className="w-full mb-2" />

                  <div className="flex gap-2 flex-wrap items-center mb-2">
                    <select value={c.fuente_tipo} onChange={e => {
                        const ft = e.target.value as SaludFuenteTipo
                        const d = DEFAULTS_FUENTE[ft]
                        updateDraft(c.id, { fuente_tipo: ft, fuente_config: {}, comparacion: d.comparacion, umbral: d.umbral })
                      }}
                      disabled={modoMes} className="input-field !py-1 text-xs flex-1 min-w-[180px] disabled:opacity-50">
                      {FUENTES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    <select value={c.comparacion} onChange={e => updateDraft(c.id, { comparacion: e.target.value as 'menor_que'|'mayor_que' })}
                      disabled={modoMes} className="input-field !py-1 text-xs disabled:opacity-50">
                      <option value="menor_que">Ideal: menor a</option>
                      <option value="mayor_que">Ideal: mayor a</option>
                    </select>
                    <input type="number" value={umbralMostrado}
                      onChange={e => modoMes ? setOverrideUmbral(c.id, parseFloat(e.target.value) || 0) : updateDraft(c.id, { umbral: parseFloat(e.target.value) || 0 })}
                      className="input-field !py-1 text-xs w-20 font-mono" />
                    <span className="text-xs text-slate-400">{fuente.unidad === '%' ? '% del ingreso' : 'meses'}</span>
                    {modoMes && ov && (ov.peso !== undefined || ov.umbral !== undefined) && (
                      <button onClick={() => quitarOverride(c.id)} className="text-[10px] text-blue-600 border-none bg-transparent cursor-pointer underline">
                        quitar override
                      </button>
                    )}
                  </div>

                  {!modoMes && c.fuente_tipo === 'egreso_categoria' && (
                    <div className="flex flex-wrap gap-1.5">
                      {(catsEgreso ?? []).map(cat => {
                        const activo = (c.fuente_config.categorias ?? []).includes(cat.nombre)
                        return (
                          <button key={cat.id} onClick={() => toggleCategoriaEnConfig(c.id, 'categorias', cat.nombre)}
                            className={`text-[10px] px-2 py-1 rounded-full border-none cursor-pointer font-medium ${activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                            {activo ? '✓ ' : '+ '}{cat.nombre}
                          </button>
                        )
                      })}
                      {(catsEgreso ?? []).length === 0 && <span className="text-[11px] text-slate-300">No tenés categorías de Egresos cargadas todavía.</span>}
                    </div>
                  )}

                  {!modoMes && c.fuente_tipo === 'ahorro_metas' && (
                    <div className="flex flex-wrap gap-1.5">
                      {(ahorros ?? []).map(a => {
                        const activo = (c.fuente_config.ahorro_ids ?? []).includes(a.id)
                        return (
                          <button key={a.id} onClick={() => toggleCategoriaEnConfig(c.id, 'ahorro_ids', a.id)}
                            className={`text-[10px] px-2 py-1 rounded-full border-none cursor-pointer font-medium ${activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                            {activo ? '✓ ' : '+ '}{a.nombre}
                          </button>
                        )
                      })}
                      {(metas ?? []).map(mt => {
                        const activo = (c.fuente_config.meta_ids ?? []).includes(mt.id)
                        return (
                          <button key={mt.id} onClick={() => toggleCategoriaEnConfig(c.id, 'meta_ids', mt.id)}
                            className={`text-[10px] px-2 py-1 rounded-full border-none cursor-pointer font-medium ${activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                            {activo ? '✓ ' : '+ '}{mt.nombre}
                          </button>
                        )
                      })}
                      {(ahorros ?? []).length === 0 && (metas ?? []).length === 0 && (
                        <span className="text-[11px] text-slate-300">No tenés Ahorros ni Metas cargados todavía.</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={guardar} disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
