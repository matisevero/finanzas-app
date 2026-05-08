'use client'
import { createContext, useContext, useState, ReactNode } from 'react'

interface PageHeaderValue {
  title: string
  subtitle?: string
  action?: ReactNode
  setHeader: (title: string, subtitle?: string, action?: ReactNode) => void
}

const PageHeaderContext = createContext<PageHeaderValue>({
  title: '', setHeader: () => {}
})

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [title, setTitle]       = useState('')
  const [subtitle, setSubtitle] = useState<string | undefined>()
  const [action, setAction]     = useState<ReactNode>(null)

  const setHeader = (t: string, s?: string, a?: ReactNode) => {
    setTitle(t); setSubtitle(s); setAction(a ?? null)
  }

  return (
    <PageHeaderContext.Provider value={{ title, subtitle, action, setHeader }}>
      {children}
    </PageHeaderContext.Provider>
  )
}

export const usePageHeader = () => useContext(PageHeaderContext)
