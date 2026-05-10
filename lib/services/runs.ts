import { prisma } from '@/lib/db'
import { addSSEClient, removeSSEClient } from '@/lib/sse'

export async function listRuns(workflowId: string, userId: string, searchParams: URLSearchParams) {

    const page = Math.max(1, Number(searchParams.get('page') ?? 1));
    const limit = Math.min(Number(searchParams.get('limit') ?? 20), 100);

    const skip = (page - 1) * limit;

    const runns = await prisma.workflowRun.findMany({
        where: {
            workflowId: workflowId
        },
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit + 1,
    })
    let isNextPresent = false;

    if (runns.length > limit) {
        isNextPresent = true;
        runns.pop()
    }

    return {
        data: {
            runns,
            isNextPresent,
            page,
            limit,
        },
        status: 200
    }

}

export async function getRun(workflowId: string, runId: string, userId: string) {

    const workflow = await prisma.workflow.findUnique({
        where: {
            id: workflowId
        }
    })

    if (!workflow || workflow.clerkUserId !== userId) {
        return { data: { error: 'Not found' }, status: 404 }
    }

    const workflowRun = await prisma.workflowRun.findUnique({
        where: {
            id: runId,
            workflowId: workflowId
        },
        include: {
            nodeExecutions: {
                orderBy: { startedAt: 'asc' }
            }
        }
    })

    if (!workflowRun) {
        return { data: { error: 'Run Not found' }, status: 400 }
    }

    return {
        data: { workflowRun },
        status: 200
    }

}

export async function createSSEStream(workflowId: string, userId: string) {
    const workflow = await prisma.workflow.findUnique({
        where: { id: workflowId },
        select: { clerkUserId: true },
    })

    if (!workflow || workflow.clerkUserId !== userId) {
        return { data: { error: 'Not found' }, status: 404, stream: null }
    }

    let controller: ReadableStreamDefaultController<Uint8Array>

    const stream = new ReadableStream<Uint8Array>({
        start(c) {
            controller = c
            addSSEClient(workflowId, controller)
            controller.enqueue(new TextEncoder().encode(': keepalive\n\n'))
        },
        cancel() {
            removeSSEClient(workflowId, controller)
        },
    })

    return { data: null, status: 200, stream }
}
