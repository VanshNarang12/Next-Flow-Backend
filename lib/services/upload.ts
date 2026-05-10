import { v2 as cloudinary } from 'cloudinary'
import { z } from 'zod'

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
})

const uploadSchema = z.object({
    fieldId: z.string(),
    nodeId: z.string(),
})

export async function uploadFile(file: Buffer, body: any) {
    const parsed = uploadSchema.safeParse(body)
    if (!parsed.success) {
        return { data: { error: 'Validation failed', details: parsed.error.issues }, status: 400 }
    }

    const url = await new Promise<string>((resolve, reject) => {
        cloudinary.uploader.upload_stream(
            { folder: 'next-flow', resource_type: 'image' },
            (error, result) => {
                if (error || !result) return reject(error)
                resolve(result.secure_url)
            }
        ).end(file)
    })

    return { data: { url }, status: 200 }
}
