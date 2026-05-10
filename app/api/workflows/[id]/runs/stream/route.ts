import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createSSEStream } from '@/lib/services/runs'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const result = await createSSEStream(id, userId)

  if (!result.stream) return NextResponse.json(result.data, { status: result.status })

  return new Response(result.stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
