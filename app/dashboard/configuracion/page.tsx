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

type ImportResult = { ingresos: number; egresos: number; eventos: number; errores: string[] }

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
  const fileIngRef = useRef<HTMLInputElement>(null)
  const fileEgrRef = useRef<HTMLInputElement>(null)
  const fileDeuRef = useRef<HTMLInputElement>(null)

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

  const handleImport = async () => {
    const fIng = fileIngRef.current?.files?.[0]
    const fEgr = fileEgrRef.current?.files?.[0]
    const fDeu = fileDeuRef.current?.files?.[0]
    if (!fIng && !fEgr && !fDeu) return
    setImporting(true); setImportResult(null)
    const result: ImportResult = { ingresos:0, egresos:0, eventos:0, errores:[] }
    try {
      const {data:{user}} = await sb.auth.getUser()
      if (!user) throw new Error('No autenticado')

      if (fIng) {
        setImportStep('Importando ingresos...')
        const texto = await fIng.text()
        const filas = parseCSV(texto).slice(1)
        const rows = filas.map(f=>{
          const fecha = parseFecha(f[0])
          if (!fecha) return null
          const fechaObj = new Date(fecha)
          return { user_id:user.id, año:fechaObj.getFullYear(), mes:fechaObj.getMonth()+1, tipo:MAPA_TIPO_INGRESO[f[1]]||'otro', descripcion:f[2]||'', monto:parseMonto(f[3]), moneda:'ARS', fecha, quien:'ambos', recurrente:false }
        }).filter(Boolean).filter((r:any)=>r.monto>0)
        if (rows.length>0) {
          const {error} = await sb.from('ingresos').insert(rows as any[])
          if (error) result.errores.push('Ingresos: '+error.message)
          else result.ingresos = rows.length
        }
      }

      if (fEgr) {
        setImportStep('Importando egresos...')
        const texto = await fEgr.text()
        const filas = parseCSV(texto).slice(1)
        const rows = filas.map(f=>{
          const fecha = parseFecha(f[0])
          if (!fecha) return null
          const fechaObj = new Date(fecha)
          return { user_id:user.id, año:fechaObj.getFullYear(), mes:fechaObj.getMonth()+1, categoria:MAPA_CAT_EGRESO[f[1]]||'otro', descripcion:f[2]||'', monto:parseMonto(f[3]), moneda:'ARS', fecha, quien:'ambos', recurrente:false }
        }).filter(Boolean).filter((r:any)=>r.monto>0)
        if (rows.length>0) {
          const {error} = await sb.from('egresos').insert(rows as any[])
          if (error) result.errores.push('Egresos: '+error.message)
          else result.egresos = rows.length
        }
      }

      if (fDeu) {
        setImportStep('Importando vencimientos...')
        const texto = await fDeu.text()
        const filas = parseCSV(texto).slice(1)
        const rows = filas.filter(f=>f[0]==='FALSE').map(f=>{
          const fecha = parseFecha(f[1])
          if (!fecha) return null
          const fechaObj = new Date(fecha)
          const cat = f[2]||''
          const tipo = cat.includes('Tarjeta')?'tarjeta':cat==='Casa'?'casa':cat==='Servicios'?'servicio':cat==='Expensas'?'expensa':cat==='Educación'?'edu':'egreso'
          return { user_id:user.id, dia:fechaObj.getDate(), mes:fechaObj.getMonth()+1, año:fechaObj.getFullYear(), tipo, descripcion:f[3]||'', monto:parseMonto(f[4])||null, moneda:'ARS', recurrente:false, pagado:false }
        }).filter(Boolean).filter((r:any)=>r.descripcion)
        if (rows.length>0) {
          const {error} = await sb.from('eventos_calendario').insert(rows as any[])
          if (error) result.errores.push('Eventos: '+error.message)
          else result.eventos = rows.length
        }
      }
    } catch(e) {
      result.errores.push(e instanceof Error?e.message:'Error inesperado')
    } finally {
      setImporting(false); setImportStep(''); setImportResult(result)
      if (fileIngRef.current) fileIngRef.current.value=''
      if (fileEgrRef.current) fileEgrRef.current.value=''
      if (fileDeuRef.current) fileDeuRef.current.value=''
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
          <p className="text-slate-400 text-sm mb-5">Subí los archivos exportados desde tu Google Sheet. Podés subir uno, dos o los tres a la vez. Los datos se agregan sin borrar lo existente.</p>
          <div className="grid grid-cols-3 gap-4 mb-5">
            {[
              {label:'📥 Ingresos', sub:'..._Ingreso.csv',  ref:fileIngRef, color:'#2D7D2D'},
              {label:'📤 Egresos',  sub:'..._Gasto.csv',    ref:fileEgrRef, color:'#C0392B'},
              {label:'📋 Deudas',   sub:'..._Deudas.csv',   ref:fileDeuRef, color:'#5B3FA6'},
            ].map(f=>(
              <div key={f.label} className="border-2 border-dashed border-slate-200 rounded-2xl p-4 hover:border-slate-300 transition-colors">
                <div className="text-sm font-semibold text-slate-700 mb-1">{f.label}</div>
                <div className="text-slate-400 text-xs mb-3">{f.sub}</div>
                <input ref={f.ref} type="file" accept=".csv" className="text-xs text-slate-500 w-full" />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <button onClick={handleImport} disabled={importing} className="btn-primary disabled:opacity-50">
              {importing?importStep||'Importando...':'⬆ Importar archivos seleccionados'}
            </button>
            {importResult&&(
              <div className={`flex-1 text-sm px-4 py-3 rounded-xl ${importResult.errores.length>0?'bg-red-50 text-red-700':'bg-emerald-50 text-emerald-700'}`}>
                {importResult.errores.length>0
                  ? '⚠ '+importResult.errores.join(' · ')
                  : `✓ Importado — ${[importResult.ingresos>0&&importResult.ingresos+' ingresos', importResult.egresos>0&&importResult.egresos+' egresos', importResult.eventos>0&&importResult.eventos+' eventos'].filter(Boolean).join(' · ')}`
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

      </div>
    </div>
  )
}
