export {
  type Dependency,
  identical,
  identify,
  parse,
  stringify,
  tryParse,
} from "./deps.ts";

export { collectFromEsModules, collectFromImportMap } from "./refs.ts";

export { type DependencyUpdate, getUpdate } from "./updates.ts";
