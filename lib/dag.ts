export type AnyNode = {
  id: string
  type: string
  data: Record<string, unknown>
  [key: string]: unknown
}

export type AnyEdge = {
  source: string
  target: string
  sourceHandle: string
  targetHandle: string
  [key: string]: unknown
}

export function buildDependencyMaps(edges: AnyEdge[]) {
  const deps = new Map<string, Set<string>>()
  const dependents = new Map<string, Set<string>>()

  for (const edge of edges) {
    if (!deps.has(edge.target)) {
      deps.set(edge.target, new Set())
    }
    if (!dependents.has(edge.source)) {
      dependents.set(edge.source, new Set())
    }
    deps.get(edge.target)!.add(edge.source)
    dependents.get(edge.source)!.add(edge.target)
  }

  return { deps, dependents }
}

export function getUnblockedNodes(
  candidateIds: string[],
  deps: Map<string, Set<string>>,
  resolvedIds: Set<string>
): string[] {
  return candidateIds.filter((nodeId) => {
    const nodeDeps = deps.get(nodeId) ?? new Set()
    return [...nodeDeps].every((dep) => resolvedIds.has(dep))
  })
}

export function getTransitiveDeps(
  nodeIds: string[],
  deps: Map<string, Set<string>>
): Set<string> {
  const result = new Set<string>(nodeIds)
  const queue = [...nodeIds]
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const dep of deps.get(id) ?? new Set()) {
      if (!result.has(dep)) {
        result.add(dep)
        queue.push(dep)
      }
    }
  }
  return result
}

export function getDownstreamNodes(
  nodeId: string,
  dependents: Map<string, Set<string>>,
  includedIds: string[]
): string[] {
  const result: string[] = []
  const queue = [...(dependents.get(nodeId) ?? [])]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    if (includedIds.includes(id)) {
      result.push(id)
      queue.push(...(dependents.get(id) ?? []))
    }
  }
  return result
}

type InputDef =
  | { value: unknown; connectedFrom: { nodeId: string; handleId: string } | null }
  | Array<{ connectedFrom: { nodeId: string; handleId: string } }>

export function resolveNodeInputs(
  node: AnyNode,
  nodeOutputs: Record<string, Record<string, unknown>>,
  edges: AnyEdge[] = []
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}
  const inputs = (node.data.inputs ?? {}) as Record<string, InputDef>

  // Build edge-based connection lookup: targetHandle → { nodeId, handleId }
  const edgeMap = new Map<string, { nodeId: string; handleId: string }>()
  const visionEdges: AnyEdge[] = []
  for (const edge of edges) {
    if (edge.target !== node.id) continue
    if (edge.targetHandle?.startsWith('visionImages-')) {
      visionEdges.push(edge)
    } else {
      edgeMap.set(edge.targetHandle, { nodeId: edge.source, handleId: edge.sourceHandle })
    }
  }

  for (const [key, def] of Object.entries(inputs)) {
    if (key === 'visionImages') {
      // Prefer edge-derived connections, fall back to stored connectedFrom array
      if (visionEdges.length > 0) {
        visionEdges.sort((a, b) => {
          const ai = parseInt(a.targetHandle.replace('visionImages-', ''), 10)
          const bi = parseInt(b.targetHandle.replace('visionImages-', ''), 10)
          return ai - bi
        })
        resolved.visionImages = visionEdges.map((e) => (nodeOutputs[e.source] ?? {})[e.sourceHandle])
      } else if (Array.isArray(def)) {
        resolved.visionImages = def.map((entry) => {
          const { nodeId, handleId } = entry.connectedFrom
          return (nodeOutputs[nodeId] ?? {})[handleId]
        })
      }
      continue
    }

    const scalar = def as { value: unknown; connectedFrom: { nodeId: string; handleId: string } | null }

    // Edges are the source of truth for connections
    const edgeConn = edgeMap.get(key)
    if (edgeConn) {
      resolved[key] = (nodeOutputs[edgeConn.nodeId] ?? {})[edgeConn.handleId]
    } else if (scalar.connectedFrom) {
      const { nodeId, handleId } = scalar.connectedFrom
      resolved[key] = (nodeOutputs[nodeId] ?? {})[handleId]
    } else {
      resolved[key] = scalar.value
    }
  }

  return resolved
}

export function hasCycle(nodeIds: string[], deps: Map<string, Set<string>>): boolean {
  const visited = new Set<string>()
  const inStack = new Set<string>()

  function dfs(nodeId: string): boolean {
    visited.add(nodeId)
    inStack.add(nodeId)

    for (const dep of deps.get(nodeId) ?? new Set()) {
      if (!visited.has(dep) && dfs(dep)) return true
      if (inStack.has(dep)) return true
    }

    inStack.delete(nodeId)
    return false
  }

  for (const nodeId of nodeIds) {
    if (!visited.has(nodeId) && dfs(nodeId)) return true
  }

  return false
}
