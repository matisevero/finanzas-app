import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import TopBar  from '@/components/layout/TopBar'
import { PageHeaderProvider } from '@/context/PageHeaderContext'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return (
    <PageHeaderProvider>
      <div className="flex h-screen overflow-hidden bg-slate-100">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-auto p-8">
            {children}
          </main>
        </div>
      </div>
    </PageHeaderProvider>
  )
}
