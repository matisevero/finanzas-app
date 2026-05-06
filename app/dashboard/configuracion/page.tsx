'use client'
import { useState, useEffect } from 'react'
import { useAppStore } from '@/store/appStore'
import { createClient } from '@/lib/supabase/client'
import { PageHeader, Card, FieldLabel } from '@/components/ui'
import type { Moneda } from '@/types'
import { useRouter } from 'next/navigation'

const MONEDAS_AHORRO:  Moneda[] = ['USD','EUR','BTC','ETH','USDT']
const MONEDAS_CRIPTO:  Moneda[] = ['BTC','ETH','USDT']

export default function ConfiguracionPage() {
  const router = useRouter()
  const sb = createClient()
  const { monedaPrincipal, monedasAhorro, monedasCripto, setMonedaPrincipal, setMonedasAhorro, setMonedasCripto } = useAppStore()

  const [email, setEmail]       = useState('')
  const [nombre, setNombre]     = useState('')
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [passForm, setPassForm] = useState({ actual:'', nueva:'', repetir:'' })
  const [passMsg, setPassMsg]   = useState<{type:'ok'|'err', text:string}|null>(null)

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
      const { data:{user} } = await sb.auth.getUser()
      if (!user) return
      await sb.from('usuarios').update({ nombre, updated_at: new Date().toISOString() }).eq('id', user.id)
      setSaved(true); setTimeout(()=>setSaved(false), 3000)
    } finally { setSaving(false) }
  }

  const savePassword = async () => {
    setPassMsg(null)
    if (passForm.nueva !== passForm.repetir) { setPassMsg({type:'err',text:'Las contraseñas no coinciden'}); return }
    if (passForm.nueva.length < 6) { setPassMsg({type:'err',text:'Mínimo 6 caracteres'}); return }
    try {
      const { error } = await sb.auth.updateUser({ password: passForm.nueva })
      if (error) throw error
      setPassMsg({type:'ok',text:'Contraseña actualizada correctamente'})
      setPassForm({actual:'',nueva:'',repetir:''})
    } catch(e) {
      setPassMsg({type:'err',text:e instanceof Error ? e.message : 'Error al actualizar'})
    }
  }

  const toggleAhorro = (mon: Moneda) => {
    setMonedasAhorro(monedasAhorro.includes(mon) ? monedasAhorro.filter(m=>m!==mon) : [...monedasAhorro, mon])
  }

  const toggleCripto = (mon: Moneda) => {
    setMonedasCripto(monedasCripto.includes(mon) ? monedasCripto.filter(m=>m!==mon) : [...monedasCripto, mon])
  }

  const logout = async () => {
    await sb.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div>
      <PageHeader title="Configuración" subtitle="Preferencias de tu cuenta y la aplicación" />

      <div className="grid grid-cols-2 gap-6">
        {/* Perfil */}
        <Card>
          <div className="text-slate-900 font-semibold text-[15px] mb-5">Perfil</div>
          <div className="flex flex-col gap-4">
            <div>
              <FieldLabel>Nombre</FieldLabel>
              <input value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Tu nombre" className="input-field" />
            </div>
            <div>
              <FieldLabel>Email</FieldLabel>
              <input value={email} disabled className="input-field opacity-50 cursor-not-allowed" />
              <p className="text-slate-400 text-xs mt-1">El email no se puede cambiar desde aquí</p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button onClick={savePerfil} disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
              {saved && <span className="text-emerald-600 text-sm font-medium">✓ Guardado</span>}
            </div>
          </div>
        </Card>

        {/* Contraseña */}
        <Card>
          <div className="text-slate-900 font-semibold text-[15px] mb-5">Cambiar contraseña</div>
          <div className="flex flex-col gap-4">
            <div>
              <FieldLabel>Nueva contraseña</FieldLabel>
              <input type="password" value={passForm.nueva} onChange={e=>setPassForm(p=>({...p,nueva:e.target.value}))} placeholder="••••••••" className="input-field" />
            </div>
            <div>
              <FieldLabel>Repetir contraseña</FieldLabel>
              <input type="password" value={passForm.repetir} onChange={e=>setPassForm(p=>({...p,repetir:e.target.value}))} placeholder="••••••••" className="input-field" />
            </div>
            {passMsg && (
              <div className={`text-sm px-4 py-3 rounded-xl ${passMsg.type==='ok'?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-600'}`}>
                {passMsg.text}
              </div>
            )}
            <button onClick={savePassword} disabled={!passForm.nueva||!passForm.repetir} className="btn-primary disabled:opacity-50 w-fit">
              Actualizar contraseña
            </button>
          </div>
        </Card>

        {/* Monedas */}
        <Card>
          <div className="text-slate-900 font-semibold text-[15px] mb-5">Monedas</div>
          <div className="flex flex-col gap-5">
            <div>
              <FieldLabel>Moneda principal</FieldLabel>
              <p className="text-slate-400 text-xs mb-2">La que se usa para mostrar los totales en el dashboard</p>
              <div className="flex gap-2">
                {(['ARS','USD','EUR'] as Moneda[]).map(mon=>(
                  <button key={mon} onClick={()=>setMonedaPrincipal(mon)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold border-2 cursor-pointer transition-all ${monedaPrincipal===mon?'bg-blue-700 text-white border-blue-700':'bg-transparent text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                    {mon}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel>Monedas de ahorro</FieldLabel>
              <p className="text-slate-400 text-xs mb-2">Se muestran en el TopBar como referencia</p>
              <div className="flex gap-2 flex-wrap">
                {MONEDAS_AHORRO.map(mon=>(
                  <button key={mon} onClick={()=>toggleAhorro(mon)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold border-2 cursor-pointer transition-all ${monedasAhorro.includes(mon)?'bg-emerald-700 text-white border-emerald-700':'bg-transparent text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                    {mon}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel>Criptomonedas</FieldLabel>
              <p className="text-slate-400 text-xs mb-2">Se muestran en el TopBar</p>
              <div className="flex gap-2 flex-wrap">
                {MONEDAS_CRIPTO.map(mon=>(
                  <button key={mon} onClick={()=>toggleCripto(mon)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold border-2 cursor-pointer transition-all ${monedasCripto.includes(mon)?'bg-amber-600 text-white border-amber-600':'bg-transparent text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                    {mon}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Año activo + info */}
        <div className="flex flex-col gap-5">
          <Card>
            <div className="text-slate-900 font-semibold text-[15px] mb-4">Año activo</div>
            <p className="text-slate-400 text-sm mb-4">También podés cambiarlo desde las flechas en el TopBar</p>
            <div className="flex items-center gap-3">
              {[2024,2025,2026,2027].map(y=>(
                <button key={y} onClick={()=>useAppStore.getState().setAñoActivo(y)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold border-2 cursor-pointer transition-all ${useAppStore.getState().añoActivo===y?'bg-slate-900 text-white border-slate-900':'bg-transparent text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                  {y}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <div className="text-slate-900 font-semibold text-[15px] mb-4">Sesión</div>
            <p className="text-slate-400 text-sm mb-4">Al cerrar sesión se borran los datos locales del navegador.</p>
            <button onClick={logout} className="btn-danger">
              Cerrar sesión →
            </button>
          </Card>

          <Card>
            <div className="text-slate-900 font-semibold text-[15px] mb-2">Versión</div>
            <div className="text-slate-400 text-sm space-y-1">
              <div className="flex justify-between"><span>App</span><span className="font-mono text-slate-600">v2.0.0</span></div>
              <div className="flex justify-between"><span>Next.js</span><span className="font-mono text-slate-600">14.2.5</span></div>
              <div className="flex justify-between"><span>Base de datos</span><span className="font-mono text-slate-600">Supabase</span></div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
