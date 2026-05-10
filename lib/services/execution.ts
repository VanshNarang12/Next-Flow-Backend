import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { tasks } from '@trigger.dev/sdk/v3'
import { prisma } from '@/lib/db'
import crypto from 'crypto'
import {
    buildDependencyMaps,
    getUnblockedNodes,
    getTransitiveDeps,
    resolveNodeInputs,
    getDownstreamNodes,
    type AnyNode,
    type AnyEdge,
} from '@/lib/dag'

import { broadcastToWorkflow } from '@/lib/sse'


const runSchema = z.discriminatedUnion('scope', [
    z.object({ scope: z.literal('full') }),
    z.object({ scope: z.literal('single'), nodeId: z.string() }),
    z.object({ scope: z.literal('partial'), nodeIds: z.array(z.string()).min(1) }),
])

const NODE_TYPE_MAP: Record<string, 'request_inputs' | 'crop_image' | 'gemini' | 'response'> = {
    requestInputs: 'request_inputs',
    cropImage: 'crop_image',
    gemini: 'gemini',
    response: 'response',
}

export async function triggerRun(workflowId: string, userId: string, body: any) {

    if (!workflowId || !userId || !body) {
        return {
            data: {
                error: 'Request details missing', status: 500
            }
        }
    }

    const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } })
    if (!workflow || workflow.clerkUserId !== userId) {
        return { data: { error: 'Workflow Not found' }, status: 500 }
    }

    const parsed = runSchema.safeParse(body)
    if (!parsed.success) {
        return { data: { error: 'Validation failed', details: parsed.error.issues }, status: 400 }
    }

    const allNodes = workflow.nodes as AnyNode[]
    const allEdges = workflow.edges as AnyEdge[]
    const { deps } = buildDependencyMaps(allEdges)

    let scopedNodeIds: string[]
    if (parsed.data.scope === 'full') {
        scopedNodeIds = allNodes.map((n) => n.id)
    } else if (parsed.data.scope === 'single') {
        scopedNodeIds = [...getTransitiveDeps([parsed.data.nodeId], deps)]
    } else {
        scopedNodeIds = [...getTransitiveDeps(parsed.data.nodeIds, deps)]
    }

    const scopedNodes = allNodes.filter((n) => scopedNodeIds.includes(n.id))

    const run = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const count = await tx.workflowRun.count({ where: { workflowId } })
        return tx.workflowRun.create({
            data: {
                workflowId,
                runNumber: count + 1,
                scope: parsed.data.scope,
                status: 'running',
                triggeredBy: userId,
                includedNodeIds: scopedNodeIds,
                nodeExecutions: {
                    create: scopedNodes.map((n) => ({
                        nodeId: n.id,
                        nodeType: NODE_TYPE_MAP[n.type] ?? 'request_inputs',
                        nodeName: (n.data.label as string) ?? n.id,
                        status: 'pending',
                        inputsUsed: {},
                    })),
                },
            },
        })
    })

    const requestInputsNode = scopedNodes.find((n) => n.type === 'requestInputs')
    const nodeOutputs: Record<string, Record<string, unknown>> = {}

    if (requestInputsNode) {
        const fields = (requestInputsNode.data.fields as Array<{ id: string; value: unknown }>) ?? []
        const output = Object.fromEntries(fields.map((f) => [f.id, f.value]))
        nodeOutputs[requestInputsNode.id] = output

        await prisma.nodeExecution.updateMany({
            where: { runId: run.id, nodeId: requestInputsNode.id },
            data: {
                status: 'success',
                inputsUsed: {},
                output: output as object,
                completedAt: new Date(),
                durationMs: 0,
            },
        })
    }

    const resolvedIds = new Set(requestInputsNode ? [requestInputsNode.id] : [])
    const candidates = scopedNodes
        .filter((n) => n.type !== 'requestInputs' && n.type !== 'response')
        .map((n) => n.id)

    const toTrigger = getUnblockedNodes(candidates, deps, resolvedIds)

    await Promise.all(
        toTrigger.map(async (nodeId) => {
            const node = scopedNodes.find((n) => n.id === nodeId)!
            const resolvedInputs = resolveNodeInputs(node, nodeOutputs)

            await prisma.nodeExecution.updateMany({
                where: { runId: run.id, nodeId },
                data: { inputsUsed: resolvedInputs as object },
            })

            const taskName = node.type === 'cropImage' ? 'crop-image' : 'run-gemini'
            await tasks.trigger(taskName, {
                ...resolvedInputs,
                ...(node.type === 'gemini' && {
                    model: node.data.model,
                    settings: node.data.settings,
                }),
                runId: run.id,
                nodeId,
                workflowId,
            })
        })
    )

    return {
        data: { runId: run.id, runNumber: run.runNumber, status: 'running' },
        status: 201,
    }
}

export async function handleNodeStatus(secret: string | null, body: any) {
    if (!secret || !process.env.TRIGGER_INTERNAL_SECRET ||
        !crypto.timingSafeEqual(
          Buffer.from(secret),
          Buffer.from(process.env.TRIGGER_INTERNAL_SECRET!)
        )
      ) {
        return { data: { error: 'Unauthorized' }, status: 401 }
      }

    const { nodeId, runId, status } = body;

    await prisma.nodeExecution.updateMany({
        where: {
            runId,
            nodeId
        },
        data: {
            status: 'running'
        },
    })

    const run = await prisma.workflowRun.findUnique({
        where: { id: runId },
        select: { workflowId: true },
    })

    if (run) {
        broadcastToWorkflow(run.workflowId, 'node-status', { nodeId, status, runId })
    }

}

export async function handleNodeComplete(secret: string | null, body: any) {

    if (!secret || !process.env.TRIGGER_INTERNAL_SECRET ||
        !crypto.timingSafeEqual(
          Buffer.from(secret),
          Buffer.from(process.env.TRIGGER_INTERNAL_SECRET!)
        )
      ) {
        return { data: { error: 'Unauthorized' }, status: 401 }
      }

    const { runId, nodeId, status, output, durationMs, triggerDevRunId, error } = body;

    await prisma.nodeExecution.updateMany({
        where: { runId, nodeId },
        data: {
            status,
            output,
            durationMs,
            triggerDevRunId,
            error,
            completedAt: new Date(),
        },
    });

    const run = await prisma.workflowRun.findUnique({
        where: { id: runId },
        include: {
            workflow: { select: { id: true, nodes: true, edges: true } },
            nodeExecutions: { select: { nodeId: true, status: true, output: true, nodeType: true } },
        },
    });

    if(!run) {
        return { data: { ok: true }, status: 200 }
    }

    const workflow = await prisma.workflow.findUnique({
        where: {
            id: run.workflow.id
        }
    })

    if(!workflow) {
        return {
            data: { error: 'Workflow Not found' }, status: 500 
        }
    }


    const allNodes = run.workflow.nodes as AnyNode[]
    const allEdges = run.workflow.edges as AnyEdge[]
    const { deps, dependents } = buildDependencyMaps(allEdges)

    const workflowId = run.workflow.id

    broadcastToWorkflow(
        workflowId,
        status === 'success' ? 'node-complete' : 'node-failed',
        { nodeId, status, output, durationMs, runId }
    )

    if (status === 'failed') {
        const toSkip = getDownstreamNodes(nodeId, dependents, run.includedNodeIds)
        if (toSkip.length > 0) {
            await prisma.nodeExecution.updateMany({
                where: { runId, nodeId: { in: toSkip }, status: 'pending' },
                data: { status: 'skipped' },
            })
            for (const skippedId of toSkip) {
                broadcastToWorkflow(workflowId, 'node-failed', { nodeId: skippedId, status: 'skipped', runId })
            }
        }
    }

    if (status === 'success') {
        const nodeOutputs: Record<string, Record<string, unknown>> = {}
        for (const exec of run.nodeExecutions) {
            if (exec.status === 'success' && exec.output) {
                nodeOutputs[exec.nodeId] = exec.output as Record<string, unknown>
            }
        }
        if (output) nodeOutputs[nodeId] = output

        const successNodeIds: string[] = []
        for (const exec of run.nodeExecutions) {
            if (exec.status === 'success') successNodeIds.push(exec.nodeId)
        }
        const resolvedIds = new Set([...successNodeIds, nodeId])

        const downstream = [...(dependents.get(nodeId) ?? [])].filter((id) =>
            run.includedNodeIds.includes(id)
        )
        const unblocked = getUnblockedNodes(downstream, deps, resolvedIds)

        await Promise.all(
            unblocked.map(async (nextNodeId) => {
                const node = allNodes.find((n) => n.id === nextNodeId)
                if (!node) return

                const resolvedInputs = resolveNodeInputs(node, nodeOutputs)

                if (node.type === 'response') {
                    await prisma.nodeExecution.updateMany({
                        where: { runId, nodeId: nextNodeId },
                        data: {
                            status: 'success',
                            inputsUsed: resolvedInputs as object,
                            output: { result: resolvedInputs.result } as object,
                            completedAt: new Date(),
                            durationMs: 0,
                        },
                    })
                    return
                }

                await prisma.nodeExecution.updateMany({
                    where: { runId, nodeId: nextNodeId },
                    data: { inputsUsed: resolvedInputs as object },
                })

                const taskName = node.type === 'cropImage' ? 'crop-image' : 'run-gemini'
                await tasks.trigger(taskName, {
                    ...resolvedInputs,
                    ...(node.type === 'gemini' && { model: node.data.model, settings: node.data.settings }),
                    runId,
                    nodeId: nextNodeId,
                    workflowId,
                })
            })
        )
    }

    type ExecSummary = { status: string; output: unknown; nodeType: string }
    const allExecutions = await prisma.nodeExecution.findMany({
        where: { runId },
        select: { status: true, output: true, nodeType: true },
    }) as ExecSummary[]

    const allDone = allExecutions.every((e: ExecSummary) =>
        ['success', 'failed', 'skipped'].includes(e.status)
    )

    if (allDone) {
        const hasFailed = allExecutions.some((e: ExecSummary) => e.status === 'failed')
        const hasSuccess = allExecutions.some((e: ExecSummary) => e.status === 'success')
        const finalStatus = hasFailed && hasSuccess ? 'partial' : hasFailed ? 'failed' : 'success'

        const responseExec = allExecutions.find((e: ExecSummary) => e.nodeType === 'response')
        const finalResult = responseExec?.output ?? null

        await prisma.workflowRun.update({
            where: { id: runId },
            data: {
                status: finalStatus,
                completedAt: new Date(),
                durationMs: Date.now() - run.startedAt.getTime(),
                ...(finalResult && { finalResult }),
            },
        })

        broadcastToWorkflow(workflowId, 'run-complete', { runId, status: finalStatus })
    }

    return { data: { ok: true }, status: 200 }
}
