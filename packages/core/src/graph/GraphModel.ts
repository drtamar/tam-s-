import type { NoteId } from "../vault/types.js";

export type NodeKind = "note" | "tag";
export type EdgeKind = "link" | "embed" | "tagged";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  /** Human-readable label (note title or tag name). */
  label: string;
  /** Vault path for note nodes. */
  path?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
}

/**
 * An in-memory knowledge graph with dual adjacency maps for O(1) neighbor and
 * backlink lookups. Serializable to plain JSON for caching.
 */
export class GraphModel {
  readonly nodes = new Map<string, GraphNode>();
  readonly edges: GraphEdge[] = [];
  /** from -> outgoing edges */
  readonly #out = new Map<string, GraphEdge[]>();
  /** to -> incoming edges */
  readonly #in = new Map<string, GraphEdge[]>();

  addNode(node: GraphNode): void {
    if (!this.nodes.has(node.id)) this.nodes.set(node.id, node);
  }

  addEdge(edge: GraphEdge): void {
    this.edges.push(edge);
    push(this.#out, edge.from, edge);
    push(this.#in, edge.to, edge);
  }

  /** Outgoing edges from a node. */
  outgoing(id: string): readonly GraphEdge[] {
    return this.#out.get(id) ?? [];
  }

  /** Incoming edges to a node (the basis for backlinks). */
  incoming(id: string): readonly GraphEdge[] {
    return this.#in.get(id) ?? [];
  }

  /** Note ids that link out to `id`. */
  backlinks(id: NoteId): NoteId[] {
    return this.incoming(id)
      .filter((e) => e.kind === "link" || e.kind === "embed")
      .map((e) => e.from);
  }

  /** Distinct neighbor node ids (either direction). */
  neighbors(id: string): string[] {
    const set = new Set<string>();
    for (const e of this.outgoing(id)) set.add(e.to);
    for (const e of this.incoming(id)) set.add(e.from);
    return [...set];
  }

  noteNodes(): GraphNode[] {
    return [...this.nodes.values()].filter((n) => n.kind === "note");
  }

  toJSON(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    return { nodes: [...this.nodes.values()], edges: this.edges };
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
