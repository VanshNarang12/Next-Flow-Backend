import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getRun } from '@/lib/services/runs'

type Params = { params: Promise<{ id: string; runId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, runId } = await params
  const result = await getRun(id, runId, userId)
  return NextResponse.json(result.data, { status: result.status })
}
