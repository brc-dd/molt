import { createGraph, load as defaultLoad } from "@deno/graph";

export interface CreateGraphOptions {
  recursive?: boolean;
}

export function createGraphLocally(
  specifiers: string[],
  options?: CreateGraphOptions,
) {
  const recursive = options?.recursive ?? true;

  return createGraph(specifiers, {
    load: async (specifier) => {
      const url = new URL(specifier); // should not throw
      switch (url.protocol) {
        case "file:":
          if (!recursive && !specifiers.includes(specifier)) {
            return { kind: "external", specifier };
          }
          return await defaultLoad(specifier);
        default:
          return { kind: "external", specifier };
      }
    },
  });
}
