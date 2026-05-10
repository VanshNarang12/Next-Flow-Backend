import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getWorkflow, updateWorkflow, deleteWorkflow } from '@/lib/services/workflows'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const result = await getWorkflow(id, userId)
  return NextResponse.json(result.data, { status: result.status })
}

export async function PATCH(req: Request, { params }: Params) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const result = await updateWorkflow(id, userId, body)
  return NextResponse.json(result.data, { status: result.status })
}

export async function DELETE(_req: Request, { params }: Params) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const result = await deleteWorkflow(id, userId)
  return NextResponse.json(result.data, { status: result.status })
}
