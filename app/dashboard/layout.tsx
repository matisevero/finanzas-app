import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
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
          <Link href="/carga-rapida" aria-label="Carga rápida"
            className="md:hidden fixed z-30 flex items-center justify-center w-14 h-14 rounded-full text-white no-underline"
            style={{ right: 18, bottom: 22, background: 'linear-gradient(135deg,#1D4ED8,#15803D)', boxShadow: '0 4px 14px rgba(15,23,42,0.28)' }}>
            <span className="text-2xl leading-none -mt-0.5">+</span>
          </Link>
        </div>
      </MobileMenuProvider>
    </PageHeaderProvider>
  )
}
