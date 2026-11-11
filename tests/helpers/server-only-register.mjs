import { registerHooks } from "node:module";

// Node-only tests run on the server. Use Next's empty server entry for its
// build-time marker without mocking authentication, Prisma, or business logic.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      const result = nextResolve(
        "next/dist/compiled/server-only/empty.js",
        context,
      );

      return result;
    }

    const result = nextResolve(specifier, context);

    return result;
  },
});
