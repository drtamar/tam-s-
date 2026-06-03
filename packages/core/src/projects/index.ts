// Mobile-safe subset of the projects module: the router + its types only.
// (loadProjects / extract live in the main "@osb/core" barrel — they pull in
// the markdown parser / gray-matter, which is unsafe to bundle on mobile.)
export type {
  BrainDump,
  CollectionKind,
  DumpCategory,
  LlmClient,
  NewCollection,
  ProjectProfile,
  RoutingProposal,
} from "./types.js";
export {
  BrainDumpRouter,
  routerOptionsFromConfig,
  type RouterOptions,
} from "./router.js";
