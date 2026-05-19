import { prisma } from '@/lib/db'
import { z } from 'zod'
import { buildDependencyMaps, hasCycle, type AnyNode, type AnyEdge } from '@/lib/dag'

const createWorkflowSchema = z.object({
    name: z.string().min(1).max(100)
})

const DEFAULT_NODES = [
    {
        id: 'node-request-inputs',
        type: 'requestInputs',
        position: { x: 100, y: 250 },
        deletable: false,
        data: {
            label: 'Request-Inputs',
            deletable: false,
            fields: [],
            status: 'idle',
        },
    },
    {
        id: 'node-response',
        type: 'response',
        position: { x: 800, y: 250 },
        deletable: false,
        data: {
            label: 'Response',
            deletable: false,
            inputs: {
                input: { value: null, connectedFrom: null },
            },
            status: 'idle',
        },
    },
]
// ─────────────────────────────────────────────────────────────────────────────
// Sample: Product Marketing Flow
// ─────────────────────────────────────────────────────────────────────────────

export const SAMPLE_WORKFLOW_NODES = [
    {
        id: 'node-request-inputs',
        type: 'requestInputs',
        position: { x: 50, y: 300 },
        deletable: false,
        data: {
            label: 'Request-Inputs',
            deletable: false,
            fields: [
                {
                    id: 'field-text-1',
                    type: 'text_field',
                    label: 'text_field',
                    value:
                        'Product: Wireless Bluetooth Headphones. Features: 30-hour battery, active noise cancellation, premium sound quality. Price: $199.',
                },
                {
                    id: 'field-image-1',
                    type: 'image_field',
                    label: 'image_field',
                    value: null,
                    previewUrl: null,
                    fileName: null,
                    mimeType: null,
                },
            ],
            status: 'idle',
        },
    },
    {
        id: 'node-crop-1',
        type: 'cropImage',
        position: { x: 500, y: 60 },
        deletable: true,
        data: {
            label: 'Crop Image #1',
            deletable: true,
            inputs: {
                inputImage: {
                    value: null,
                    connectedFrom: { nodeId: 'node-request-inputs', handleId: 'field-field-image-1' },
                },
                x:      { value: 20,  connectedFrom: null },
                y:      { value: 20,  connectedFrom: null },
                width:  { value: 60,  connectedFrom: null },
                height: { value: 60,  connectedFrom: null },
            },
            outputs: { outputImage: null },
            status: 'idle',
            triggerDevRunId: null,
        },
    },
    {
        id: 'node-crop-2',
        type: 'cropImage',
        position: { x: 500, y: 360 },
        deletable: true,
        data: {
            label: 'Crop Image #2',
            deletable: true,
            inputs: {
                inputImage: {
                    value: null,
                    connectedFrom: { nodeId: 'node-request-inputs', handleId: 'field-field-image-1' },
                },
                x:      { value: 0,   connectedFrom: null },
                y:      { value: 0,   connectedFrom: null },
                width:  { value: 100, connectedFrom: null },
                height: { value: 50,  connectedFrom: null },
            },
            outputs: { outputImage: null },
            status: 'idle',
            triggerDevRunId: null,
        },
    },
    {
        id: 'node-gemini-1',
        type: 'gemini',
        position: { x: 500, y: 640 },
        deletable: true,
        data: {
            label: 'Gemini #1',
            deletable: true,
            model: 'gemini-2.5-pro',
            inputs: {
                prompt: {
                    value: null,
                    connectedFrom: { nodeId: 'node-request-inputs', handleId: 'field-field-text-1' },
                },
                systemPrompt: {
                    value: 'You are a marketing copywriter. Write a compelling one-paragraph product description that highlights the key features and benefits.',
                    connectedFrom: null,
                },
                visionImages: [],
            },
            numVisionSlots: 1,
            settings: { temperature: 0.7, maxTokens: 1024, topP: 0.95, topK: 40 },
            outputs: { response: null },
            status: 'idle',
            triggerDevRunId: null,
        },
    },
    {
        id: 'node-gemini-2',
        type: 'gemini',
        position: { x: 950, y: 640 },
        deletable: true,
        data: {
            label: 'Gemini #2',
            deletable: true,
            model: 'gemini-2.5-pro',
            inputs: {
                prompt: {
                    value: null,
                    connectedFrom: { nodeId: 'node-gemini-1', handleId: 'response' },
                },
                systemPrompt: {
                    value: 'Condense the following product description into a punchy tweet (max 280 characters) with relevant hashtags.',
                    connectedFrom: null,
                },
                visionImages: [],
            },
            numVisionSlots: 1,
            settings: { temperature: 0.7, maxTokens: 512, topP: 0.95, topK: 40 },
            outputs: { response: null },
            status: 'idle',
            triggerDevRunId: null,
        },
    },
    {
        id: 'node-gemini-final',
        type: 'gemini',
        position: { x: 950, y: 180 },
        deletable: true,
        data: {
            label: 'Final Gemini',
            deletable: true,
            model: 'gemini-2.5-pro',
            inputs: {
                prompt: {
                    value: null,
                    connectedFrom: { nodeId: 'node-gemini-2', handleId: 'response' },
                },
                systemPrompt: {
                    value: 'You are a social media expert. Using the tweet text and the provided product images, craft a complete Instagram-ready marketing post. Include the tweet text, a detailed image description, and a call-to-action.',
                    connectedFrom: null,
                },
                visionImages: [
                    { connectedFrom: { nodeId: 'node-crop-1', handleId: 'outputImage' } },
                    { connectedFrom: { nodeId: 'node-crop-2', handleId: 'outputImage' } },
                ],
            },
            numVisionSlots: 2,
            settings: { temperature: 0.7, maxTokens: 2048, topP: 0.95, topK: 40 },
            outputs: { response: null },
            status: 'idle',
            triggerDevRunId: null,
        },
    },
    {
        id: 'node-response',
        type: 'response',
        position: { x: 1380, y: 300 },
        deletable: false,
        data: {
            label: 'Response',
            deletable: false,
            inputs: {
                input: {
                    value: null,
                    connectedFrom: { nodeId: 'node-gemini-final', handleId: 'response' },
                },
            },
            status: 'idle',
        },
    },
]

export const SAMPLE_WORKFLOW_EDGES = [
    {
        id: 'edge-req-image-to-crop1',
        source: 'node-request-inputs',
        sourceHandle: 'field-field-image-1',
        target: 'node-crop-1',
        targetHandle: 'inputImage',
        type: 'default',
        animated: true,
        style: { stroke: '#8b5cf6', strokeWidth: 2 },
        markerEnd: { type: 'ArrowClosed', color: '#8b5cf6' },
        data: { sourceType: 'image', targetType: 'image' },
    },
    {
        id: 'edge-req-image-to-crop2',
        source: 'node-request-inputs',
        sourceHandle: 'field-field-image-1',
        target: 'node-crop-2',
        targetHandle: 'inputImage',
        type: 'default',
        animated: true,
        style: { stroke: '#8b5cf6', strokeWidth: 2 },
        markerEnd: { type: 'ArrowClosed', color: '#8b5cf6' },
        data: { sourceType: 'image', targetType: 'image' },
    },
    {
        id: 'edge-req-text-to-gemini1',
        source: 'node-request-inputs',
        sourceHandle: 'field-field-text-1',
        target: 'node-gemini-1',
        targetHandle: 'prompt',
        type: 'default',
        animated: true,
        style: { stroke: '#8b5cf6', strokeWidth: 2 },
        markerEnd: { type: 'ArrowClosed', color: '#8b5cf6' },
        data: { sourceType: 'text', targetType: 'text' },
    },
    {
        id: 'edge-gemini1-to-gemini2',
        source: 'node-gemini-1',
        sourceHandle: 'response',
        target: 'node-gemini-2',
        targetHandle: 'prompt',
        type: 'default',
        animated: true,
        style: { stroke: '#8b5cf6', strokeWidth: 2 },
        markerEnd: { type: 'ArrowClosed', color: '#8b5cf6' },
        data: { sourceType: 'text', targetType: 'text' },
    },
    {
        id: 'edge-crop1-to-gemini-final',
        source: 'node-crop-1',
        sourceHandle: 'outputImage',
        target: 'node-gemini-final',
        targetHandle: 'visionImages-0',
        type: 'default',
        animated: true,
        style: { stroke: '#8b5cf6', strokeWidth: 2 },
        markerEnd: { type: 'ArrowClosed', color: '#8b5cf6' },
        data: { sourceType: 'image', targetType: 'image' },
    },
    {
        id: 'edge-crop2-to-gemini-final',
        source: 'node-crop-2',
        sourceHandle: 'outputImage',
        target: 'node-gemini-final',
        targetHandle: 'visionImages-1',
        type: 'default',
        animated: true,
        style: { stroke: '#8b5cf6', strokeWidth: 2 },
        markerEnd: { type: 'ArrowClosed', color: '#8b5cf6' },
        data: { sourceType: 'image', targetType: 'image' },
    },
    {
        id: 'edge-gemini2-to-gemini-final',
        source: 'node-gemini-2',
        sourceHandle: 'response',
        target: 'node-gemini-final',
        targetHandle: 'prompt',
        type: 'default',
        animated: true,
        style: { stroke: '#8b5cf6', strokeWidth: 2 },
        markerEnd: { type: 'ArrowClosed', color: '#8b5cf6' },
        data: { sourceType: 'text', targetType: 'text' },
    },
    {
        id: 'edge-gemini-final-to-response',
        source: 'node-gemini-final',
        sourceHandle: 'response',
        target: 'node-response',
        targetHandle: 'input',
        type: 'default',
        animated: true,
        style: { stroke: '#8b5cf6', strokeWidth: 2 },
        markerEnd: { type: 'ArrowClosed', color: '#8b5cf6' },
        data: { sourceType: 'text', targetType: 'text' },
    },
]

export async function createSampleWorkflow(userId: string) {
    if (!userId) throw new Error('User Id must be present')

    const workflow = await prisma.workflow.create({
        data: {
            clerkUserId: userId,
            name: 'Sample: Product Marketing Flow',
            nodes: SAMPLE_WORKFLOW_NODES,
            edges: SAMPLE_WORKFLOW_EDGES,
        },
    })

    return { data: workflow, status: 201 }
}

export async function listWorkflows(userId: string) {

    if(!userId) {
        throw new Error(
            "User Id must be present"
        );
    }

    const workflows = await prisma.workflow.findMany({
        where: { clerkUserId: userId },
        orderBy: { updatedAt: 'desc' },
        select: {
            id: true,
            name: true,
            createdAt: true,
            updatedAt: true,
            runs: {
                where: { status: 'running' },
                take: 1,
                select: { status: true },
            },
        },
    })

    type WorkflowItem = { id: string; name: string; createdAt: Date; updatedAt: Date; runs: { status: string }[] }
    return {
        data: (workflows as WorkflowItem[]).map((w) => ({
            id: w.id,
            name: w.name,
            createdAt: w.createdAt,
            updatedAt: w.updatedAt,
            activeRunStatus: w.runs.length > 0 ? 'running' : 'idle',
        })),
        status: 200,
    }
}

export async function createWorkflow(userId: string, body: any) {

    if(!userId) {
        throw new Error(
            "User Id must be present"
        );
    }

    const parsed = createWorkflowSchema.safeParse(body)
    if (!parsed.success) {
        return { data: { error: 'Validation failed', details: parsed.error.issues }, status: 400 }
    }

    const workflow = await prisma.workflow.create({
        data: {
            clerkUserId: userId,
            name: parsed.data.name,
            nodes: DEFAULT_NODES,
            edges: [],
        },
    })

    return { data: workflow, status: 201 }
}

export async function getWorkflow(id: string, userId: string) {
    const workflow = await prisma.workflow.findUnique({
        where: { id },
    })

    if (!workflow || workflow.clerkUserId !== userId) {
        return { data: { error: 'Not found' }, status: 404 }
    }

    return { data: workflow, status: 200 }

}

const updateWorkflowSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    nodes: z.array(z.record(z.unknown())).optional(),
    edges: z.array(z.record(z.unknown())).optional(),
}).refine(
    (d) => d.name || d.nodes !== undefined,
    { message: 'Must provide at least name or nodes/edges' }
)

export async function updateWorkflow(id: string, userId: string, body: any) {
    const workflow = await prisma.workflow.findUnique({ where: { id } })
    if (!workflow || workflow.clerkUserId !== userId) {
        return { data: { error: 'Not found' }, status: 404 }
    }

    const parsed = updateWorkflowSchema.safeParse(body)
    if (!parsed.success) {
        return { data: { error: 'Validation failed', details: parsed.error.issues }, status: 400 }
    }

    if (parsed.data.edges) {
        const edges = parsed.data.edges as AnyEdge[]
        const nodes = (parsed.data.nodes ?? workflow.nodes) as AnyNode[]
        const { deps } = buildDependencyMaps(edges)
        if (hasCycle(nodes.map((n) => n.id), deps)) {
            return { data: { error: 'Edges form a cycle' }, status: 400 }
        }
    }

    const updated = await prisma.workflow.update({
        where: { id },
        data: {
            ...(parsed.data.name && { name: parsed.data.name }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(parsed.data.nodes !== undefined && { nodes: parsed.data.nodes as any }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(parsed.data.edges !== undefined && { edges: parsed.data.edges as any }),
        },
        select: { id: true, updatedAt: true },
    })

    return { data: updated, status: 200 }
}

export async function deleteWorkflow(id: string, userId: string) {
    
    const workflow = await prisma.workflow.findUnique({
        where: { id },
        select: { id: true, clerkUserId: true },
      })
    
      if (!workflow || workflow.clerkUserId !== userId) {
        return { data: { error: "Not found" }, status: 404 }
      }
    
      await prisma.workflow.delete({
        where: { id },
      })
    
      return { data: { success: true }, status: 200 }
}
