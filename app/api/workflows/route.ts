import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { listWorkflows, createWorkflow } from '@/lib/services/workflows'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workflows = await listWorkflows(userId)
  return NextResponse.json(workflows)
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const result = await createWorkflow(userId, body)
  return NextResponse.json(result.data, { status: result.status })
}
