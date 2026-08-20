import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runValidation } from "../scripts/validate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

test("the committed solution-manifest.yaml and blog-brief.yaml validate cleanly", () => {
  const errors = runValidation(repoRoot);
  assert.deepEqual(errors, []);
});
