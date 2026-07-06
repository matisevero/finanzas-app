import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function CargaRapidaLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return (
    <div className="min-h-screen bg-slate-50">
      {children}
    </div>
  )
}
