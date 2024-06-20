import * as Jsonc from "@std/jsonc";
import { ensure, is } from "@core/unknownutil";

export interface ImportMapJson {
  imports: Record<string, string>;
}

const isImportMapJson = is.ObjectOf({
  imports: is.RecordOf(is.String),
});

/**
 * Parse an import map from the given JSON string.
 */
export function parseImportMapJson(
  src: string,
): ImportMapJson {
  return ensure(Jsonc.parse(src), isImportMapJson);
}

/**
 * Read and parse a JSON including import maps from the given file path or URL.
 */
export async function readImportMapJson(
  url: string | URL,
): Promise<ImportMapJson> {
  const data = await Deno.readTextFile(url);
  try {
    return parseImportMapJson(data);
  } catch {
    throw new SyntaxError(`${url} does not have a valid import map`);
  }
}

export async function tryReadImportMapJson(
  url: string | URL,
): Promise<ImportMapJson | undefined> {
  try {
    return await readImportMapJson(url);
  } catch {
    return;
  }
}
