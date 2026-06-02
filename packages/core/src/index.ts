// Vault abstraction
export type {
  Disposable,
  NoteId,
  NotePath,
  VaultChangeEvent,
  VaultFile,
} from "./vault/types.js";
export type { VaultReader } from "./vault/VaultReader.js";
export { NodeVaultReader } from "./vault/NodeVaultReader.js";

// Parsing
export { parseNote, type ParsedNote } from "./parse/parseNote.js";
export { extractWikiLinks, type WikiLink } from "./parse/wikilinks.js";
export {
  extractBodyTags,
  normalizeFrontmatterTags,
  normalizeTag,
} from "./parse/tags.js";
export { extractHeadings, type Heading } from "./parse/headings.js";

// Graph
export {
  GraphModel,
  type EdgeKind,
  type GraphEdge,
  type GraphNode,
  type NodeKind,
} from "./graph/GraphModel.js";
export {
  buildGraph,
  type BrokenLink,
  type BuildGraphResult,
} from "./graph/buildGraph.js";
export { LinkResolver } from "./graph/resolveLink.js";
export { getBacklinks, type Backlink } from "./graph/backlinks.js";
export { findOrphans, shortestPath, subgraph } from "./graph/queries.js";

// Memory
export type { Embedder } from "./memory/Embedder.js";
export type {
  ChunkRecord,
  ScoredChunk,
  VectorStore,
} from "./memory/VectorStore.js";
export { chunkNote, type Chunk, type ChunkOptions } from "./memory/chunk.js";
export {
  MemoryService,
  type IndexResult,
  type RecallHit,
} from "./memory/MemoryService.js";
export {
  createNote,
  type CreateNoteInput,
  type CreateNoteResult,
} from "./memory/writeBack.js";

// Optimizer
export { proposeOrphans, type OrphanProposal } from "./optimize/orphans.js";
export {
  proposeBrokenLinks,
  type BrokenLinkProposal,
} from "./optimize/brokenLinks.js";
export {
  proposeTagNormalization,
  type TagNormalizeProposal,
} from "./optimize/tagNormalize.js";
export {
  proposeDuplicates,
  type DuplicateProposal,
} from "./optimize/duplicates.js";
export {
  suggestLinks,
  type LinkSuggestion,
} from "./optimize/autoLink.js";
export { generateTagMoc, type MocResult } from "./optimize/moc.js";

// Projects / second memory system (brain-dump router)
export type {
  BrainDump,
  DumpCategory,
  LlmClient,
  ProjectProfile,
  RoutingProposal,
} from "./projects/types.js";
export { loadProjects } from "./projects/loadProjects.js";
export { BrainDumpRouter, type RouterOptions } from "./projects/router.js";
export {
  dumpFromText,
  extractDumpsFromFolder,
} from "./projects/extract.js";

// Convenience loaders + utils
export { loadVault, searchNotes, type LoadedVault } from "./loadVault.js";
export { idToPath, noteTitle, pathToId } from "./util/ids.js";
export { slugify } from "./util/slugify.js";
export { cosineSimilarity } from "./util/cosine.js";
export { appendUnderHeading } from "./util/markdown.js";
