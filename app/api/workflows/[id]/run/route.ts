import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { triggerRun } from '@/lib/services/execution'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const result = await triggerRun(id, userId, body)
  return NextResponse.json(result.data, { status: result.status })
}
