import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { uploadFile } from '@/lib/services/upload'

export async function POST(req: Request) {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const fieldId = formData.get('fieldId') as string | null
    const nodeId = formData.get('nodeId') as string | null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await uploadFile(buffer, { fieldId: fieldId ?? '', nodeId: nodeId ?? '' })
    return NextResponse.json(result.data, { status: result.status })
}
