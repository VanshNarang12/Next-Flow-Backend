import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createSSEStream } from '@/lib/services/runs'

type Params = { params: Promise<{ id: string }> }

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://next-flow-frontend.vercel.app',
]

export async function GET(req: Request, { params }: Params) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const result = await createSSEStream(id, userId)

  if (!result.stream) return NextResponse.json(result.data, { status: result.status })

  const origin = req.headers.get('origin') ?? ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]

  return new Response(result.stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Credentials': 'true',
    },
  })
}
