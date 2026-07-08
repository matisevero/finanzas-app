import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 60

// Recibe un archivo (imagen o PDF) en base64 + un prompt, llama a la API de Claude
// del lado del servidor (acá vive la API key real, nunca llega al navegador) y devuelve
// el texto de la respuesta tal cual para que quien llame lo parsee.
// Chequeo liviano: ¿está la API key configurada? No llama a Anthropic, no genera costo.
// El frontend lo usa para mostrar el botón de foto habilitado o no.
export async function GET() {
  return NextResponse.json({ disponible: !!process.env.ANTHROPIC_API_KEY })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Falta configurar ANTHROPIC_API_KEY en las variables de entorno del proyecto.' }, { status: 500 })
  }

  try {
    const { base64, mediaType, esPdf, prompt, maxTokens } = await req.json()
    if (!base64 || !prompt) {
      return NextResponse.json({ error: 'Faltan datos: base64 y prompt son obligatorios.' }, { status: 400 })
    }

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens ?? 1500,
        messages: [{
          role: 'user',
          content: [
            { type: esPdf ? 'document' : 'image', source: { type: 'base64', media_type: esPdf ? 'application/pdf' : (mediaType || 'image/jpeg'), data: base64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    })

    const data = await resp.json()

    if (!resp.ok) {
      return NextResponse.json({ error: data?.error?.message || 'Error llamando a la API de Claude.' }, { status: resp.status })
    }

    const text = data.content?.map((b: any) => b.text || '').join('') ?? ''
    return NextResponse.json({ text })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Error inesperado procesando el archivo.' }, { status: 500 })
  }
}
