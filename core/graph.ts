import {
  createGraph,
  type CreateGraphOptions,
  load as defaultLoad,
} from "@deno/graph";

export function createGraphLocally(
  specifiers: string[],
  options?: CreateGraphOptions & { recursive?: boolean },
) {
  const recursive = options?.recursive ?? true;
  return createGraph(specifiers, {
    load: async (specifier) => {
      const url = new URL(specifier); // should not throw
      switch (url.protocol) {
        case "node:":
        case "npm:":
        case "jsr:":
        case "http:":
        case "https:":
          return {
            kind: "external",
            specifier,
          };
        case "file:":
          if (!recursive && !specifiers.includes(specifier)) {
            return {
              kind: "external",
              specifier,
            };
          }
          return await defaultLoad(specifier);
        default:
          throw new Error(`Unexpected protocol: ${url.protocol}`);
      }
    },
    ...options,
  });
}
