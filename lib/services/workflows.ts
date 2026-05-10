import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
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
                result: { value: null, connectedFrom: null },
            },
            status: 'idle',
        },
    },
]
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

    return {
        data: workflows.map((w) => ({
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
            ...(parsed.data.nodes !== undefined && { nodes: parsed.data.nodes as Prisma.JsonArray }),
            ...(parsed.data.edges !== undefined && { edges: parsed.data.edges as Prisma.JsonArray }),
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
