#!/usr/bin/env node
import { main } from "../src/cli.ts";

main()
  .then((code) => process.exit(code ?? 0))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.stack : String(err));
    process.exit(1);
  });
