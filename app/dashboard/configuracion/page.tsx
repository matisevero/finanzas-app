'use client'
import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '@/store/appStore'
import { createClient } from '@/lib/supabase/client'
import { PageHeader, Card, FieldLabel } from '@/components/ui'
import type { Moneda } from '@/types'
import { useRouter } from 'next/navigation'

const MONEDAS_AHORRO: Moneda[] = ['USD','EUR','BTC','ETH','USDT']
const MONEDAS_CRIPTO: Moneda[] = ['BTC','ETH','USDT']

function parseMonto(str: string): number {
  if (!str) return 0
  return parseFloat(str.replace(/\$/g,'').replace(/\s/g,'').replace(/\./g,'').replace(',','.')) || 0
}

function parseFecha(str: string): string | null {
  if (!str) return null
  const MESES: Record<string,string> = {
    ene:'01',feb:'02',mar:'03',abr:'04',may:'05',jun:'06',
    jul:'07',ago:'08',sep:'09',sept:'09',oct:'10',nov:'11',dic:'12'
  }
  const partes = str.trim().split('-')
  if (partes.length !== 3) return null
  const [dia, mesStr, año] = partes
  const mes = MESES[mesStr.toLowerCase()]
  if (!mes) return null
  return `${año}-${mes}-${dia.padStart(2,'0')}`
}

function parseCSV(contenido: string): string[][] {
  const lineas = contenido.split('\n')
  return lineas.map(linea => {
    const campos: string[] = []
    let dentroComillas = false
    let campo = ''
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i]
      if (c === '"') { dentroComillas = !dentroComillas }
      else if (c === ',' && !dentroComillas) { campos.push(campo.trim()); campo = '' }
      else { campo += c }
    }
    campos.push(campo.trim())
    return campos
  }).filter(f => f.some(c => c))
}

const MAPA_TIPO_INGRESO: Record<string,string> = {
  'Salarios':'salario','Freelance':'freelance','Alquiler':'alquiler',
  'Saldo banco anterior':'otro','Promociones':'otro','Devoluciones':'otro',
}

const MAPA_CAT_EGRESO: Record<string,string> = {
  'Tarjeta de Crédito':'tarjeta','Inversiones DOLARES':'usd','Servicios':'servicios',
  'Oli':'oli','Casa':'casa','Social (Bares, Restaurantes y Juntadas)':'social',
  'Expensas':'expensas','Salud':'salud','Supermercado':'super',
  'Impuestos':'impuestos','Viajes':'viajes','Automóvil':'auto',
  'Educación':'educacion','Otros':'otro','Efectivo':'otro',
}

type ImportResult = { ingresos: number; egresos: number; eventos: number; saltados: number; errores: string[] }

// Clave de deduplicación para ingresos/egresos
function claveIngreso(r: { fecha: string; monto: number; descripcion: string }) {
  return `${r.fecha}|${r.monto}|${r.descripcion}`
}
function claveEgreso(r: { fecha: string; monto: number; descripcion: string }) {
  return `${r.fecha}|${r.monto}|${r.descripcion}`
}
function claveEvento(r: { dia: number; mes: number; año: number; descripcion: string; monto: number | null }) {
  return `${r.año}|${r.mes}|${r.dia}|${r.descripcion}|${r.monto}`
}

export default function ConfiguracionPage() {
  const router = useRouter()
  const sb = createClient()
  const { monedaPrincipal, monedasAhorro, monedasCripto, setMonedaPrincipal, setMonedasAhorro, setMonedasCripto, añoActivo, setAñoActivo } = useAppStore()

  const [email, setEmail]     = useState('')
  const [nombre, setNombre]   = useState('')
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [passForm, setPassForm] = useState({ nueva:'', repetir:'' })
  const [passMsg, setPassMsg] = useState<{type:'ok'|'err',text:string}|null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult|null>(null)
  const [importStep, setImportStep] = useState('')
  const [exporting, setExporting] = useState(false)
  const fileMultiRef = useRef<HTMLInputElement>(null)

  // Zona de peligro
  const [deleteStep, setDeleteStep] = useState<'idle'|'confirming'|'deleting'>('idle')
  const [deleteInput, setDeleteInput] = useState('')
  const [deleteMsg, setDeleteMsg] = useState<{type:'ok'|'err',text:string}|null>(null)

  useEffect(()=>{
    sb.auth.getUser().then(({data:{user}})=>{
      if (user) {
        setEmail(user.email||'')
        sb.from('usuarios').select('nombre').eq('id',user.id).single()
          .then(({data})=>{ if(data) setNombre(data.nombre||'') })
      }
    })
  }, [])

  const savePerfil = async () => {
    setSaving(true); setSaved(false)
    try {
      const {data:{user}} = await sb.auth.getUser()
      if (!user) return
      await sb.from('usuarios').update({nombre, updated_at:new Date().toISOString()}).eq('id',user.id)
      setSaved(true); setTimeout(()=>setSaved(false),3000)
    } finally { setSaving(false) }
  }

  const savePassword = async () => {
    setPassMsg(null)
    if (passForm.nueva !== passForm.repetir) { setPassMsg({type:'err',text:'Las contraseñas no coinciden'}); return }
    if (passForm.nueva.length < 6) { setPassMsg({type:'err',text:'Mínimo 6 caracteres'}); return }
    try {
      const {error} = await sb.auth.updateUser({password:passForm.nueva})
      if (error) throw error
      setPassMsg({type:'ok',text:'Contraseña actualizada correctamente'})
      setPassForm({nueva:'',repetir:''})
    } catch(e){ setPassMsg({type:'err',text:e instanceof Error?e.message:'Error'}) }
  }

  const detectarTipo = (header: string): 'ingresos'|'egresos'|'deudas'|null => {
    if (header.includes('Ingreso')) return 'ingresos'
    if (header.includes('Gasto'))   return 'egresos'
    if (header.includes('Deuda') || header.includes('Vencimiento')) return 'deudas'
    return null
  }

  const handleImport = async () => {
    const files = fileMultiRef.current?.files
    if (!files || files.length === 0) return
    setImporting(true); setImportResult(null)
    const result: ImportResult = { ingresos:0, egresos:0, eventos:0, saltados:0, errores:[] }
    try {
      const {data:{user}} = await sb.auth.getUser()
      if (!user) throw new Error('No autenticado')

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const texto = await file.text()
        const todas = parseCSV(texto)
        if (todas.length === 0) continue
        const header = todas[0].join(',')
        const tipo = detectarTipo(header)
        const filas = todas.slice(1)

        if (tipo === 'ingresos') {
          setImportStep(`Importando ${file.name}...`)
          const candidatos = filas.map(f=>{
            const fecha = parseFecha(f[0])
            if (!fecha) return null
            const fechaObj = new Date(fecha)
            return { user_id:user.id, año:fechaObj.getFullYear(), mes:fechaObj.getMonth()+1, tipo:MAPA_TIPO_INGRESO[f[1]]||'otro', descripcion:f[2]||'', monto:parseMonto(f[3]), moneda:'ARS', fecha, quien:'ambos', recurrente:false }
          }).filter(Boolean).filter((r:any)=>r.monto>0) as any[]

          if (candidatos.length > 0) {
            // Traer existentes para deduplicar
            const años = [...new Set(candidatos.map((r:any)=>r.año))]
            const { data: existentes } = await sb.from('ingresos')
              .select('fecha,monto,descripcion')
              .eq('user_id', user.id)
              .in('año', años)
            const existentesSet = new Set((existentes||[]).map((r:any) => claveIngreso(r)))
            const nuevos = candidatos.filter((r:any) => !existentesSet.has(claveIngreso(r)))
            result.saltados += candidatos.length - nuevos.length
            if (nuevos.length > 0) {
              const {error} = await sb.from('ingresos').insert(nuevos)
              if (error) result.errores.push(file.name+': '+error.message)
              else result.ingresos += nuevos.length
            }
          }

        } else if (tipo === 'egresos') {
          setImportStep(`Importando ${file.name}...`)
          const candidatos = filas.map(f=>{
            const fecha = parseFecha(f[0])
            if (!fecha) return null
            const fechaObj = new Date(fecha)
            return { user_id:user.id, año:fechaObj.getFullYear(), mes:fechaObj.getMonth()+1, categoria:MAPA_CAT_EGRESO[f[1]]||'otro', descripcion:f[2]||'', monto:parseMonto(f[3]), moneda:'ARS', fecha, quien:'ambos', recurrente:false }
          }).filter(Boolean).filter((r:any)=>r.monto>0) as any[]

          if (candidatos.length > 0) {
            const años = [...new Set(candidatos.map((r:any)=>r.año))]
            const { data: existentes } = await sb.from('egresos')
              .select('fecha,monto,descripcion')
              .eq('user_id', user.id)
              .in('año', años)
            const existentesSet = new Set((existentes||[]).map((r:any) => claveEgreso(r)))
            const nuevos = candidatos.filter((r:any) => !existentesSet.has(claveEgreso(r)))
            result.saltados += candidatos.length - nuevos.length
            if (nuevos.length > 0) {
              const {error} = await sb.from('egresos').insert(nuevos)
              if (error) result.errores.push(file.name+': '+error.message)
              else result.egresos += nuevos.length
            }
          }

        } else if (tipo === 'deudas') {
          setImportStep(`Importando ${file.name}...`)
          const candidatos = filas.filter(f=>f[0]==='FALSE').map(f=>{
            const fecha = parseFecha(f[1])
            if (!fecha) return null
            const fechaObj = new Date(fecha)
            const cat = f[2]||''
            const tipoEv = cat.includes('Tarjeta')?'tarjeta':cat==='Casa'?'casa':cat==='Servicios'?'servicio':cat==='Expensas'?'expensa':cat==='Educación'?'edu':'egreso'
            return { user_id:user.id, dia:fechaObj.getDate(), mes:fechaObj.getMonth()+1, año:fechaObj.getFullYear(), tipo:tipoEv, descripcion:f[3]||'', monto:parseMonto(f[4])||null, moneda:'ARS', recurrente:false, pagado:false }
          }).filter(Boolean).filter((r:any)=>r.descripcion) as any[]

          if (candidatos.length > 0) {
            const años = [...new Set(candidatos.map((r:any)=>r.año))]
            const { data: existentes } = await sb.from('eventos_calendario')
              .select('dia,mes,año,descripcion,monto')
              .eq('user_id', user.id)
              .in('año', años)
            const existentesSet = new Set((existentes||[]).map((r:any) => claveEvento(r)))
            const nuevos = candidatos.filter((r:any) => !existentesSet.has(claveEvento(r)))
            result.saltados += candidatos.length - nuevos.length
            if (nuevos.length > 0) {
              const {error} = await sb.from('eventos_calendario').insert(nuevos)
              if (error) result.errores.push(file.name+': '+error.message)
              else result.eventos += nuevos.length
            }
          }

        } else {
          result.errores.push(file.name+': no se pudo detectar el tipo de archivo')
        }
      }
    } catch(e) {
      result.errores.push(e instanceof Error?e.message:'Error inesperado')
    } finally {
      setImporting(false); setImportStep(''); setImportResult(result)
      if (fileMultiRef.current) fileMultiRef.current.value=''
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const [ing,egr,deu,met,tar] = await Promise.all([
        sb.from('ingresos').select('*'),
        sb.from('egresos').select('*'),
        sb.from('deudas').select('*'),
        sb.from('metas').select('*'),
        sb.from('tarjetas').select('*'),
      ])
      const backup = { exportado:new Date().toISOString(), version:'2.0', ingresos:ing.data??[], egresos:egr.data??[], deudas:deu.data??[], metas:met.data??[], tarjetas:tar.data??[] }
      const blob = new Blob([JSON.stringify(backup,null,2)],{type:'application/json'})
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href=url; a.download=`finanzas-backup-${new Date().toISOString().slice(0,10)}.json`; a.click()
      URL.revokeObjectURL(url)
    } finally { setExporting(false) }
  }

  const handleBorrarTodo = async () => {
    if (deleteInput !== 'BORRAR') return
    setDeleteStep('deleting')
    setDeleteMsg(null)
    try {
      const {data:{user}} = await sb.auth.getUser()
      if (!user) throw new Error('No autenticado')
      const tablas = ['ingresos','egresos','eventos_calendario','deudas','metas','tarjetas']
      for (const tabla of tablas) {
        const {error} = await sb.from(tabla).delete().eq('user_id', user.id)
        if (error) throw new Error(`Error borrando ${tabla}: ${error.message}`)
      }
      setDeleteMsg({type:'ok', text:'Todos los datos fueron eliminados correctamente.'})
      setDeleteStep('idle')
      setDeleteInput('')
    } catch(e) {
      setDeleteMsg({type:'err', text:e instanceof Error?e.message:'Error inesperado'})
      setDeleteStep('confirming')
    }
  }

  const logout = async () => { await sb.auth.signOut(); router.push('/auth/login') }

  return (
    <div>
      <PageHeader title="Configuración" subtitle="Preferencias de tu cuenta y la aplicación" />
      <div className="grid grid-cols-2 gap-6">

        <Card>
          <div className="text-slate-900 font-semibold text-[15px] mb-5">Perfil</div>
          <div className="flex flex-col gap-4">
            <div><FieldLabel>Nombre</FieldLabel><input value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Tu nombre" className="input-field" /></div>
            <div><FieldLabel>Email</FieldLabel><input value={email} disabled className="input-field opacity-50 cursor-not-allowed" /><p className="text-slate-400 text-xs mt-1">El email no se puede cambiar desde aquí</p></div>
            <div className="flex items-center gap-3 pt-2">
              <button onClick={savePerfil} disabled={saving} className="btn-primary disabled:opacity-50">{saving?'Guardando...':'Guardar cambios'}</button>
              {saved&&<span className="text-emerald-600 text-sm font-medium">✓ Guardado</span>}
            </div>
          </div>
        </Card>

        <Card>
          <div className="text-slate-900 font-semibold text-[15px] mb-5">Cambiar contraseña</div>
          <div className="flex flex-col gap-4">
            <div><FieldLabel>Nueva contraseña</FieldLabel><input type="password" value={passForm.nueva} onChange={e=>setPassForm(p=>({...p,nueva:e.target.value}))} placeholder="••••••••" className="input-field" /></div>
            <div><FieldLabel>Repetir contraseña</FieldLabel><input type="password" value={passForm.repetir} onChange={e=>setPassForm(p=>({...p,repetir:e.target.value}))} placeholder="••••••••" className="input-field" /></div>
            {passMsg&&<div className={`text-sm px-4 py-3 rounded-xl ${passMsg.type==='ok'?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-600'}`}>{passMsg.text}</div>}
            <button onClick={savePassword} disabled={!passForm.nueva||!passForm.repetir} className="btn-primary disabled:opacity-50 w-fit">Actualizar contraseña</button>
          </div>
        </Card>

        <Card>
          <div className="text-slate-900 font-semibold text-[15px] mb-5">Monedas</div>
          <div className="flex flex-col gap-5">
            <div>
              <FieldLabel>Moneda principal</FieldLabel>
              <div className="flex gap-2 mt-1">
                {(['ARS','USD','EUR'] as Moneda[]).map(mon=>(
                  <button key={mon} onClick={()=>setMonedaPrincipal(mon)} className={`px-4 py-2 rounded-xl text-sm font-bold border-2 cursor-pointer transition-all ${monedaPrincipal===mon?'bg-blue-700 text-white border-blue-700':'bg-transparent text-slate-600 border-slate-200 hover:border-slate-400'}`}>{mon}</button>
                ))}
              </div>
            </div>
            <div>
              <FieldLabel>Monedas de ahorro</FieldLabel>
              <div className="flex gap-2 flex-wrap mt-1">
                {MONEDAS_AHORRO.map(mon=>(
                  <button key={mon} onClick={()=>setMonedasAhorro(monedasAhorro.includes(mon)?monedasAhorro.filter(m=>m!==mon):[...monedasAhorro,mon])} className={`px-4 py-2 rounded-xl text-sm font-bold border-2 cursor-pointer transition-all ${monedasAhorro.includes(mon)?'bg-emerald-700 text-white border-emerald-700':'bg-transparent text-slate-600 border-slate-200 hover:border-slate-400'}`}>{mon}</button>
                ))}
              </div>
            </div>
            <div>
              <FieldLabel>Criptomonedas</FieldLabel>
              <div className="flex gap-2 flex-wrap mt-1">
                {MONEDAS_CRIPTO.map(mon=>(
                  <button key={mon} onClick={()=>setMonedasCripto(monedasCripto.includes(mon)?monedasCripto.filter(m=>m!==mon):[...monedasCripto,mon])} className={`px-4 py-2 rounded-xl text-sm font-bold border-2 cursor-pointer transition-all ${monedasCripto.includes(mon)?'bg-amber-600 text-white border-amber-600':'bg-transparent text-slate-600 border-slate-200 hover:border-slate-400'}`}>{mon}</button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <div className="text-slate-900 font-semibold text-[15px] mb-4">Año activo</div>
            <div className="flex gap-2">
              {[2024,2025,2026,2027].map(y=>(
                <button key={y} onClick={()=>setAñoActivo(y)} className={`px-4 py-2 rounded-xl text-sm font-bold border-2 cursor-pointer transition-all ${añoActivo===y?'bg-slate-900 text-white border-slate-900':'bg-transparent text-slate-600 border-slate-200 hover:border-slate-400'}`}>{y}</button>
              ))}
            </div>
          </Card>
          <Card>
            <div className="text-slate-900 font-semibold text-[15px] mb-3">Sesión</div>
            <button onClick={logout} className="btn-danger">Cerrar sesión →</button>
          </Card>
        </div>

        {/* IMPORTAR */}
        <Card className="col-span-2">
          <div className="text-slate-900 font-semibold text-[15px] mb-2">Importar datos desde CSV</div>
          <p className="text-slate-400 text-sm mb-4">
            Seleccioná uno o varios archivos CSV exportados desde tu Google Sheet.
            El sistema detecta automáticamente si es de Ingresos, Gastos o Deudas según el contenido.
            Los registros duplicados (misma fecha, monto y descripción) se saltean automáticamente.
          </p>
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 hover:border-slate-300 transition-colors mb-5 text-center">
            <div className="text-3xl mb-2">📂</div>
            <div className="text-sm font-semibold text-slate-700 mb-1">Seleccioná tus archivos CSV</div>
            <div className="text-slate-400 text-xs mb-4">Podés seleccionar varios a la vez — el sistema detecta el tipo de cada uno automáticamente</div>
            <input ref={fileMultiRef} type="file" accept=".csv" multiple className="text-sm text-slate-500 cursor-pointer" />
          </div>
          <div className="flex items-center gap-4">
            <button onClick={handleImport} disabled={importing} className="btn-primary disabled:opacity-50">
              {importing?importStep||'Importando...':'⬆ Importar archivos seleccionados'}
            </button>
            {importResult&&(
              <div className={`flex-1 text-sm px-4 py-3 rounded-xl ${importResult.errores.length>0?'bg-red-50 text-red-700':'bg-emerald-50 text-emerald-700'}`}>
                {importResult.errores.length>0
                  ? '⚠ '+importResult.errores.join(' · ')
                  : '✓ Importado — '+[
                      importResult.ingresos>0 && importResult.ingresos+' ingresos',
                      importResult.egresos>0  && importResult.egresos+' egresos',
                      importResult.eventos>0  && importResult.eventos+' eventos',
                      importResult.saltados>0 && importResult.saltados+' duplicados salteados',
                    ].filter(Boolean).join(' · ')
                }
              </div>
            )}
          </div>
        </Card>

        {/* EXPORTAR */}
        <Card className="col-span-2">
          <div className="text-slate-900 font-semibold text-[15px] mb-2">Exportar y backup</div>
          <p className="text-slate-400 text-sm mb-5">Descargá todos tus datos en formato JSON. Incluye ingresos, egresos, deudas, metas y tarjetas.</p>
          <div className="flex items-center gap-4">
            <button onClick={handleExport} disabled={exporting} className="btn-primary disabled:opacity-50">
              {exporting?'Preparando backup...':'⬇ Descargar backup completo (JSON)'}
            </button>
            <span className="text-slate-400 text-xs">El archivo se descarga directamente en tu computadora</span>
          </div>
        </Card>

        {/* ZONA DE PELIGRO */}
        <Card className="col-span-2 border border-red-100 bg-red-50/30">
          <div className="text-red-700 font-semibold text-[15px] mb-2">⚠ Zona de peligro</div>
          <p className="text-slate-500 text-sm mb-5">
            Borrá todos los datos de la aplicación (ingresos, egresos, deudas, eventos, metas y tarjetas).
            Esta acción es irreversible. Te recomendamos hacer un backup antes.
          </p>

          {deleteStep === 'idle' && (
            <button
              onClick={()=>{ setDeleteStep('confirming'); setDeleteInput(''); setDeleteMsg(null) }}
              className="px-4 py-2 rounded-xl text-sm font-semibold border-2 border-red-300 text-red-600 hover:bg-red-100 transition-all cursor-pointer"
            >
              Borrar todos los datos
            </button>
          )}

          {deleteStep === 'confirming' && (
            <div className="flex flex-col gap-3 max-w-md">
              <p className="text-sm text-slate-600">
                Para confirmar, escribí <span className="font-bold text-red-600">BORRAR</span> en el campo y presioná el botón.
              </p>
              <input
                value={deleteInput}
                onChange={e=>setDeleteInput(e.target.value)}
                placeholder="Escribí BORRAR para confirmar"
                className="input-field border-red-200 focus:border-red-400"
              />
              <div className="flex gap-3">
                <button
                  onClick={handleBorrarTodo}
                  disabled={deleteInput !== 'BORRAR'}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  Confirmar y borrar todo
                </button>
                <button
                  onClick={()=>{ setDeleteStep('idle'); setDeleteInput('') }}
                  className="px-4 py-2 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-400 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {deleteStep === 'deleting' && (
            <p className="text-sm text-red-500 font-medium">Borrando datos...</p>
          )}

          {deleteMsg && (
            <div className={`mt-3 text-sm px-4 py-3 rounded-xl max-w-md ${deleteMsg.type==='ok'?'bg-emerald-50 text-emerald-700':'bg-red-100 text-red-700'}`}>
              {deleteMsg.type==='ok' ? '✓ ' : '⚠ '}{deleteMsg.text}
            </div>
          )}
        </Card>

      </div>
    </div>
  )
}
