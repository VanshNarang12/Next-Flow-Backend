import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createSampleWorkflow } from '@/lib/services/workflows'

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await createSampleWorkflow(userId)
  return NextResponse.json(result.data, { status: result.status })
}
