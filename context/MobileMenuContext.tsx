'use client'
import { createContext, useContext, useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

interface MobileMenuCtx {
  open: boolean
  toggle: () => void
  close: () => void
}

const MobileMenuContext = createContext<MobileMenuCtx | null>(null)

export function MobileMenuProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Cierra el drawer automáticamente al navegar a otra pantalla
  useEffect(() => { setOpen(false) }, [pathname])

  return (
    <MobileMenuContext.Provider value={{ open, toggle: () => setOpen(v => !v), close: () => setOpen(false) }}>
      {children}
    </MobileMenuContext.Provider>
  )
}

export function useMobileMenu() {
  const ctx = useContext(MobileMenuContext)
  if (!ctx) throw new Error('useMobileMenu debe usarse dentro de MobileMenuProvider')
  return ctx
}
