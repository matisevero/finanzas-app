'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Mode = 'login' | 'register' | 'forgot'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode]         = useState<Mode>('login')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState<string | null>(null)
  const router   = useRouter()
  const supabase = createClient()

  const handle = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError(null); setSuccess(null)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/dashboard'); router.refresh()
      } else if (mode === 'register') {
        const { error } = await supabase.auth.signUp({ email, password,
          options: { emailRedirectTo: `${location.origin}/auth/callback` } })
        if (error) throw error
        setSuccess('Revisá tu email para confirmar tu cuenta.')
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/auth/callback` })
        if (error) throw error
        setSuccess('Te enviamos un link para restablecer tu contraseña.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-modal p-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="font-serif text-3xl text-slate-900 tracking-tight">Finanzas</div>
          <div className="text-xs text-blue-700 font-bold tracking-widest uppercase mt-1">Personal Hub</div>
        </div>
        {mode !== 'forgot' && (
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-8">
            {(['login','register'] as Mode[]).map(m => (
              <button key={m} onClick={() => { setMode(m); setError(null); setSuccess(null) }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all border-none cursor-pointer ${mode===m?'bg-white text-slate-900 shadow-sm':'bg-transparent text-slate-500'}`}>
                {m === 'login' ? 'Iniciar sesión' : 'Registrarse'}
              </button>
            ))}
          </div>
        )}
        {mode === 'forgot' && (
          <div className="mb-6">
            <button onClick={() => { setMode('login'); setError(null); setSuccess(null) }}
              className="text-slate-400 text-sm hover:text-slate-600 flex items-center gap-1 border-none bg-transparent cursor-pointer mb-4">
              ← Volver al login
            </button>
            <div className="text-slate-900 font-semibold text-lg">Recuperar contraseña</div>
            <div className="text-slate-400 text-sm mt-1">Te enviamos un link a tu email para crear una nueva.</div>
          </div>
        )}
        <form onSubmit={handle} className="flex flex-col gap-4">
          <div>
            <label className="label mb-1.5 block">Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
              placeholder="tu@email.com" required className="input-field" />
          </div>
          {mode !== 'forgot' && (
            <div>
              <label className="label mb-1.5 block">Contraseña</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
                placeholder="••••••••" required minLength={6} className="input-field" />
            </div>
          )}
          {error   && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
          {success && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm">{success}</div>}
          <button type="submit" disabled={loading} className="btn-primary mt-1 py-3 text-base">
            {loading ? 'Cargando...' : mode==='login' ? 'Entrar' : mode==='register' ? 'Crear cuenta' : 'Enviar link'}
          </button>
          {mode === 'login' && (
            <button type="button" onClick={() => { setMode('forgot'); setError(null); setSuccess(null) }}
              className="text-slate-400 text-xs text-center hover:text-slate-600 transition-colors border-none bg-transparent cursor-pointer">
              ¿Olvidaste tu contraseña?
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
