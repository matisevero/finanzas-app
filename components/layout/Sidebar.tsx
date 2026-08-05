'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { NAV_ITEMS } from '@/lib/utils/constants'
import { createClient } from '@/lib/supabase/client'
import { useMobileMenu } from '@/context/MobileMenuContext'

export default function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const { open, close } = useMobileMenu()

  const logout = async () => {
    await createClient().auth.signOut()
    router.push('/auth/login')
  }

  return (
    <>
      {/* Backdrop mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-30 md:hidden"
          onClick={close}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 flex flex-col shadow-sm
        transform transition-transform duration-200 ease-out
        md:static md:z-auto md:w-56 md:flex-shrink-0 md:translate-x-0
        ${open ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="px-6 py-7 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="font-serif text-xl text-slate-900 tracking-tight">Finanzas</div>
            <div className="text-[10px] text-blue-700 font-bold tracking-widest uppercase mt-0.5">Personal Hub</div>
          </div>
          <button
            onClick={close}
            aria-label="Cerrar menú"
            className="md:hidden w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 text-xl leading-none border-none bg-transparent cursor-pointer">
            ×
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_ITEMS.map(item => {
            const active = item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link key={item.id} href={item.href} onClick={close}
                className={`
                  flex items-center gap-3 px-5 py-2.5 text-[13px] font-medium no-underline
                  border-r-[3px] transition-all
                  ${active
                    ? 'bg-blue-50 text-slate-900 font-semibold border-blue-700'
                    : 'text-slate-500 border-transparent hover:text-slate-900 hover:bg-slate-50'
                  }
                `}>
                <span className="text-sm w-4 text-center opacity-70">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100">
          <Link href="/dashboard/configuracion" onClick={close}
            className={`flex items-center gap-3 mb-3 no-underline -mx-2 px-2 py-1.5 rounded-lg transition-colors ${pathname === '/dashboard/configuracion' ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-700 to-green-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              M
            </div>
            <div className="min-w-0">
              <div className="text-slate-900 text-xs font-semibold truncate">Mi perfil</div>
              <div className="text-blue-700 text-[10px]">Configuración →</div>
            </div>
          </Link>
          <button onClick={logout} className="w-full text-left text-xs text-slate-400 hover:text-red-500 transition-colors py-1">
            Cerrar sesión →
          </button>
        </div>
      </aside>
    </>
  )
}
