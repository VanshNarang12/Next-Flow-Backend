import { task } from '@trigger.dev/sdk/v3'
import { execSync } from 'child_process'
import { writeFileSync, readFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { v2 as cloudinary } from 'cloudinary'

export const cropImageTask = task({
    id: 'crop-image',
    machine: { preset: 'small-1x' },
    run: async (payload: {
        imageUrl: string
        x: number
        y: number
        w: number
        h: number
        runId: string
        nodeId: string
        workflowId: string
    }) => {
        const startedAt = Date.now()
        const baseUrl = process.env.APP_URL!
        const secret = process.env.TRIGGER_INTERNAL_SECRET!

        // Step 1: notify running
        await fetch(`${baseUrl}/api/internal/node-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
            body: JSON.stringify({ nodeId: payload.nodeId, runId: payload.runId, status: 'running' }),
        })

        try {
            // Step 2: mandatory 30s delay
            await new Promise(resolve => setTimeout(resolve, 30000))

            // Step 3: download image
            const imageResponse = await fetch(payload.imageUrl)
            const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())

            const inputPath = join(tmpdir(), `nf-input-${payload.nodeId}.jpg`)
            const outputPath = join(tmpdir(), `nf-output-${payload.nodeId}.jpg`)
            writeFileSync(inputPath, imageBuffer)

            // Step 4: get dimensions via ffprobe then crop via ffmpeg
            const probeOutput = execSync(
                `ffprobe -v quiet -print_format json -show_streams "${inputPath}"`
            ).toString()
            const probeData = JSON.parse(probeOutput)
            const videoStream = probeData.streams.find((s: any) => s.codec_type === 'video')
            const imgWidth: number = videoStream.width
            const imgHeight: number = videoStream.height

            const cropX = Math.round((payload.x / 100) * imgWidth)
            const cropY = Math.round((payload.y / 100) * imgHeight)
            const cropW = Math.round((payload.w / 100) * imgWidth)
            const cropH = Math.round((payload.h / 100) * imgHeight)

            execSync(
                `ffmpeg -i "${inputPath}" -vf "crop=${cropW}:${cropH}:${cropX}:${cropY}" -y "${outputPath}"`
            )

            const croppedBuffer = readFileSync(outputPath)
            unlinkSync(inputPath)
            unlinkSync(outputPath)

            // Step 5: upload to Cloudinary
            cloudinary.config({
                cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
                api_key: process.env.CLOUDINARY_API_KEY,
                api_secret: process.env.CLOUDINARY_API_SECRET,
            })

            const outputUrl: string = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    { folder: 'next-flow', resource_type: 'image' },
                    (error, result) => {
                        if (error || !result) return reject(error)
                        resolve(result.secure_url)
                    }
                ).end(croppedBuffer)
            })

            const durationMs = Date.now() - startedAt

            // Step 6: notify complete
            await fetch(`${baseUrl}/api/internal/node-complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
                body: JSON.stringify({
                    nodeId: payload.nodeId,
                    runId: payload.runId,
                    status: 'success',
                    output: { outputImage: outputUrl },
                    durationMs,
                }),
            })

            return { outputImage: outputUrl }

        } catch (err: any) {
            await fetch(`${baseUrl}/api/internal/node-complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
                body: JSON.stringify({
                    nodeId: payload.nodeId,
                    runId: payload.runId,
                    status: 'failed',
                    error: err?.message ?? 'Unknown error',
                    durationMs: Date.now() - startedAt,
                }),
            })
            throw err
        }
    },
})
