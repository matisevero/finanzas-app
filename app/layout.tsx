import type { Metadata } from 'next'
import { Syne, Space_Mono, DM_Serif_Display } from 'next/font/google'
import './globals.css'

const syne      = Syne({ subsets: ['latin'], variable: '--font-syne', weight: ['400','500','600','700','800'] })
const spaceMono = Space_Mono({ subsets: ['latin'], variable: '--font-space-mono', weight: ['400','700'] })
const dmSerif   = DM_Serif_Display({ subsets: ['latin'], variable: '--font-dm-serif', weight: '400' })

export const metadata: Metadata = {
  title: 'Finanzas Personal',
  description: 'Tu hub financiero personal',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${syne.variable} ${spaceMono.variable} ${dmSerif.variable} font-sans bg-slate-100 antialiased`}>
        {children}
      </body>
    </html>
  )
}
