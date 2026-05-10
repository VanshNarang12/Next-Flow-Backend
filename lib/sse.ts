type SSEController = ReadableStreamDefaultController<Uint8Array>

const clients = new Map<string, Set<SSEController>>()

export function addSSEClient(workflowId: string, controller: SSEController) {
  if (!clients.has(workflowId)) clients.set(workflowId, new Set())
  clients.get(workflowId)!.add(controller)
}

export function removeSSEClient(workflowId: string, controller: SSEController) {
  clients.get(workflowId)?.delete(controller)
}

export function broadcastToWorkflow(workflowId: string, event: string, data: unknown) {
  const controllers = clients.get(workflowId)
  if (!controllers?.size) return

  const message = new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  )

  for (const controller of controllers) {
    try {
      controller.enqueue(message)
    } catch {
      controllers.delete(controller)
    }
  }
}
