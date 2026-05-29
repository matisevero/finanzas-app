import type { Metadata } from 'next'
import { Roboto, Roboto_Mono } from 'next/font/google'
import './globals.css'

const roboto     = Roboto({ subsets: ['latin'], variable: '--font-syne', weight: ['400','500','700'] })
const robotoMono = Roboto_Mono({ subsets: ['latin'], variable: '--font-space-mono', weight: ['400','700'] })

export const metadata: Metadata = {
  title: 'Finanzas Personal',
  description: 'Tu hub financiero personal',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${roboto.variable} ${robotoMono.variable} font-sans bg-slate-100 antialiased`}>
        {children}
      </body>
    </html>
  )
}
