import { task } from '@trigger.dev/sdk/v3'
import { GoogleGenerativeAI, type Part } from '@google/generative-ai'

export const runGeminiTask = task({
    id: 'run-gemini',
    machine: { preset: 'small-1x' },
    run: async (payload: {
        prompt: string
        systemPrompt?: string
        visionImages?: string[]
        model?: string
        settings?: Record<string, unknown>
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
            // Step 2: build multimodal parts — images first, then text prompt
            const parts: Part[] = []

            if (payload.visionImages && payload.visionImages.length > 0) {
                for (const imageUrl of payload.visionImages) {
                    const imageRes = await fetch(imageUrl)
                    const imageBuffer = Buffer.from(await imageRes.arrayBuffer())
                    const mimeType = (imageRes.headers.get('content-type') ?? 'image/jpeg') as string
                    parts.push({
                        inlineData: {
                            data: imageBuffer.toString('base64'),
                            mimeType,
                        },
                    })
                }
            }

            parts.push({ text: payload.prompt })

            // Step 3: call Gemini API
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
            const geminiModel = genAI.getGenerativeModel({
                model: payload.model ?? 'gemini-2.5-pro',
                ...(payload.systemPrompt && { systemInstruction: payload.systemPrompt }),
            })

            const result = await geminiModel.generateContent(parts)
            const responseText = result.response.text()

            const durationMs = Date.now() - startedAt

            // Step 4: notify complete
            await fetch(`${baseUrl}/api/internal/node-complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
                body: JSON.stringify({
                    nodeId: payload.nodeId,
                    runId: payload.runId,
                    status: 'success',
                    output: { response: responseText },
                    durationMs,
                }),
            })

            return { response: responseText }

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
