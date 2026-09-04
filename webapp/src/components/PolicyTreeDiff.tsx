import { useMemo, useState } from 'react'
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

// Parses the exact text sklearn.tree.export_text() produces (the real
// `rule_text` this project stores in policy_history.json) into a node/edge
// graph. Each line looks like "|   |--- feature <= 1.23" or "|--- class: 0";
// depth = how many "|   " groups precede "|---". A node's two branches are
// always the immediately-following "<=" then ">" lines at the same depth.
function parseRuleText(text: string): { nodes: Node[]; edges: Edge[] } {
  const lines = text
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(l => {
      const depth = (l.match(/\|   /g) || []).length
      const content = l.replace(/\|   /g, '').replace(/^\|--- /, '').trim()
      return { depth, content }
    })

  const nodes: Node[] = []
  const edges: Edge[] = []
  let nodeId = 0
  let leafX = 0
  const X_GAP = 180
  const Y_GAP = 90

  function isLeaf(content: string) {
    return content.startsWith('class:')
  }

  // Consumes one child's representation (a single leaf line, or a full
  // split node consuming its own <=/> pair) starting at lines[i].
  function parseChild(i: { v: number }, depth: number, parentId: string, branchLabel: string): { id: string; x: number } {
    const line = lines[i.v]
    if (!line || isLeaf(line.content)) {
      const cls = line ? line.content.replace('class:', '').trim() : '?'
      const id = `n${nodeId++}`
      i.v++
      const x = leafX
      leafX += X_GAP
      const flagged = cls !== '0'
      nodes.push({
        id,
        position: { x, y: depth * Y_GAP },
        data: { label: flagged ? 'FLAG' : 'ALLOW' },
        style: {
          backgroundColor: flagged ? '#fff0f0' : '#f0fff4',
          border: `2px solid ${flagged ? '#B23A48' : '#2ea44f'}`,
          color: flagged ? '#B23A48' : '#2E7D32',
          fontWeight: 700,
          fontSize: 12,
          borderRadius: 8,
        },
      })
      edges.push({
        id: `e${parentId}-${id}`,
        source: parentId,
        target: id,
        label: branchLabel,
        type: 'smoothstep',
        style: { stroke: '#94a3b8' },
      })
      return { id, x }
    }
    return parseSplit(i, depth, parentId, branchLabel)
  }

  function parseSplit(i: { v: number }, depth: number, parentId: string | null, branchLabel: string | null): { id: string; x: number } {
    const leftLine = lines[i.v]
    const match = leftLine.content.match(/^(.+?)\s*<=\s*(.+)$/)
    const feature = match ? match[1] : leftLine.content
    const threshold = match ? match[2] : ''
    const id = `n${nodeId++}`
    i.v++

    nodes.push({
      id,
      position: { x: 0, y: depth * Y_GAP }, // x fixed up below once children are known
      data: { label: threshold ? `${feature} ≤ ${threshold}` : feature },
      style: {
        backgroundColor: '#f8f9fa',
        border: '1px solid #cbd5e1',
        fontSize: 12,
        fontWeight: 600,
        borderRadius: 8,
      },
    })

    if (parentId) {
      edges.push({
        id: `e${parentId}-${id}`,
        source: parentId,
        target: id,
        label: branchLabel ?? undefined,
        type: 'smoothstep',
        style: { stroke: '#94a3b8' },
      })
    }

    const left = parseChild(i, depth + 1, id, 'True')
    i.v++ // skip the paired "feature >  threshold" line - same split, redundant info
    const right = parseChild(i, depth + 1, id, 'False')

    const midX = (left.x + right.x) / 2
    const thisNode = nodes.find(n => n.id === id)!
    thisNode.position = { x: midX, y: depth * Y_GAP }

    return { id, x: midX }
  }

  try {
    parseSplit({ v: 0 }, 0, null, null)
  } catch {
    return { nodes: [], edges: [] }
  }

  return { nodes, edges }
}

export default function PolicyTreeDiff({ baselineText, candidateText }: { baselineText?: string; candidateText?: string }) {
  const [view, setView] = useState<'baseline' | 'candidate'>('candidate')

  const baselineGraph = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    // Baseline is always the single documented rule (passed in verbatim,
    // not re-derived), not a real sklearn export - one split, two leaves.
    const conditionLine = (baselineText || 'max_purchase_amount > ₹25,000').split('\n')[0].replace(/^IF\s*/i, '').replace(/:$/, '')
    return {
      nodes: [
        { id: 'b0', position: { x: 90, y: 0 }, data: { label: conditionLine }, style: { backgroundColor: '#f8f9fa', border: '1px solid #cbd5e1', fontSize: 12, fontWeight: 600, borderRadius: 8 } },
        { id: 'b1', position: { x: 0, y: 90 }, data: { label: 'FLAG' }, style: { backgroundColor: '#fff0f0', border: '2px solid #B23A48', color: '#B23A48', fontWeight: 700, fontSize: 12, borderRadius: 8 } },
        { id: 'b2', position: { x: 180, y: 90 }, data: { label: 'ALLOW' }, style: { backgroundColor: '#f0fff4', border: '2px solid #2ea44f', color: '#2E7D32', fontWeight: 700, fontSize: 12, borderRadius: 8 } },
      ],
      edges: [
        { id: 'be1', source: 'b0', target: 'b1', label: 'True', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
        { id: 'be2', source: 'b0', target: 'b2', label: 'False', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
      ],
    }
  }, [baselineText])

  const candidateGraph = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    if (!candidateText) return { nodes: [], edges: [] }
    return parseRuleText(candidateText)
  }, [candidateText])

  const graph = view === 'baseline' ? baselineGraph : candidateGraph

  return (
    <div className="w-full h-[320px] border border-neutral-200 rounded-xl overflow-hidden bg-neutral-50 relative">
      <div className="absolute top-3 left-3 z-10 flex gap-1.5">
        <button
          onClick={() => setView('baseline')}
          className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded ${view === 'baseline' ? 'bg-[#B23A48] text-white' : 'bg-white text-neutral-500 border border-neutral-200'}`}
        >
          Baseline
        </button>
        <button
          onClick={() => setView('candidate')}
          className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded ${view === 'candidate' ? 'bg-[#2ea44f] text-white' : 'bg-white text-neutral-500 border border-neutral-200'}`}
        >
          This policy&apos;s real rule
        </button>
      </div>
      {graph.nodes.length === 0 ? (
        <div className="w-full h-full flex items-center justify-center text-xs text-neutral-400">No rule text available</div>
      ) : (
        <ReactFlow nodes={graph.nodes} edges={graph.edges} fitView attributionPosition="bottom-right" nodesDraggable={false} nodesConnectable={false}>
          <MiniMap pannable={false} zoomable={false} />
          <Controls showInteractive={false} />
          <Background gap={12} size={1} />
        </ReactFlow>
      )}
    </div>
  )
}
