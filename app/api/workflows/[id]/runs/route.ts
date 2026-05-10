import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { listRuns } from '@/lib/services/runs'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Params) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const result = await listRuns(id, userId, searchParams)
  return NextResponse.json(result.data, { status: result.status })
}
