import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import TopBar  from '@/components/layout/TopBar'
import { PageHeaderProvider } from '@/context/PageHeaderContext'
import { MobileMenuProvider } from '@/context/MobileMenuContext'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return (
    <PageHeaderProvider>
      <MobileMenuProvider>
        <div className="flex h-screen overflow-hidden bg-slate-100">
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            <TopBar />
            <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8">
              {children}
            </main>
          </div>
        </div>
      </MobileMenuProvider>
    </PageHeaderProvider>
  )
}
