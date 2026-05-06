'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { NAV_ITEMS } from '@/lib/utils/constants'
import { createClient } from '@/lib/supabase/client'

export default function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()

  const logout = async () => {
    await createClient().auth.signOut()
    router.push('/auth/login')
  }

  return (
    <aside className="w-56 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 shadow-sm">
      {/* Logo */}
      <div className="px-6 py-7 border-b border-slate-100">
        <div className="font-serif text-xl text-slate-900 tracking-tight">Finanzas</div>
        <div className="text-[10px] text-blue-700 font-bold tracking-widest uppercase mt-0.5">Personal Hub</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link key={item.id} href={item.href}
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
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-700 to-green-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            M
          </div>
          <div className="min-w-0">
            <div className="text-slate-900 text-xs font-semibold truncate">Mi cuenta</div>
            <div className="text-blue-700 text-[10px]">Pro Plan</div>
          </div>
        </div>
        <button onClick={logout} className="w-full text-left text-xs text-slate-400 hover:text-red-500 transition-colors py-1">
          Cerrar sesión →
        </button>
      </div>
    </aside>
  )
}
