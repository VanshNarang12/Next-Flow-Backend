import { NextResponse } from 'next/server'
import { handleNodeStatus } from '@/lib/services/execution'

export async function POST(req: Request) {
  const secret = req.headers.get('x-internal-secret')
  const body = await req.json()
  const result = await handleNodeStatus(secret, body)
  if(!result) {
    throw new Error("Error in fetching node status")
  }
  return NextResponse.json(result.data, { status: result.status })
}
