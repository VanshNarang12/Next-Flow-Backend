import { NextResponse } from 'next/server'
import { handleNodeComplete } from '@/lib/services/execution'

export async function POST(req: Request) {
  const secret = req.headers.get('x-internal-secret')
  const body = await req.json()
  const result = await handleNodeComplete(secret, body)
  return NextResponse.json(result.data, { status: result.status })
}
