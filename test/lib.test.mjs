import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readYamlFile,
  readJsonFile,
  validateManifestDocument,
  validateBlogBriefDocument,
  validateContractDocuments,
  checkLocalPathShape,
} from "../scripts/lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const fixturePath = path.join(__dirname, "fixtures", "contact-center.yaml");
const { data: fixture } = readYamlFile(fixturePath);
const { data: manifestSchema } = readJsonFile(path.join(repoRoot, "docs", "solution-manifest.schema.json"));
const { data: briefSchema } = readJsonFile(path.join(repoRoot, "docs", "publishing", "blog-brief.schema.json"));

function copy() {
  return structuredClone(fixture);
}

test("rich multi-candidate contact-center fixture validates", () => {
  const { manifest, brief } = copy();
  assert.deepEqual(validateManifestDocument(manifest, manifestSchema, repoRoot), []);
  assert.deepEqual(validateBlogBriefDocument(brief, briefSchema, repoRoot), []);
  assert.deepEqual(validateContractDocuments(manifest, brief), []);
});

test("entry point fragments use GitHub heading slugs", () => {
  const { manifest } = copy();
  manifest.entryPoints.deployment = "docs/README.md#missing-heading";
  assert.ok(validateManifestDocument(manifest, manifestSchema, repoRoot).some((error) => error.includes("Markdown fragment")));
});

test("cross-document solution ID and repository mismatches fail", () => {
  const { manifest, brief } = copy();
  brief.solution.id = "other";
  brief.solution.repository = "other/repository";
  const errors = validateContractDocuments(manifest, brief);
  assert.equal(errors.length, 2);
});

test("incomplete repository metadata does not produce a duplicate mismatch error", () => {
  const { manifest, brief } = copy();
  delete manifest.repository.owner;
  assert.deepEqual(validateContractDocuments(manifest, brief), []);
});

test("invalid evidence classes, ADR statuses, and unmarked reconstructed ADRs fail", () => {
  const { brief } = copy();
  brief.candidates[0].evidence[0].class = "assumption";
  brief.candidates[0].canonicalAdrs[0].statusAsReviewed = "current";
  brief.candidates[0].canonicalAdrs[0].kind = "reconstructed";
  delete brief.candidates[0].canonicalAdrs[0].note;
  const errors = validateBlogBriefDocument(brief, briefSchema, repoRoot);
  assert.ok(errors.length >= 3);
});

test("unsafe candidate paths and exclusion globs fail", () => {
  const { manifest, brief } = copy();
  manifest.synthesisExclusions[0].glob = "../**";
  brief.candidates[0].sourceArtifacts[0].path = "../private.md";
  const errors = [
    ...validateManifestDocument(manifest, manifestSchema, repoRoot),
    ...validateBlogBriefDocument(brief, briefSchema, repoRoot),
  ];
  assert.ok(errors.some((error) => error.includes("traversal")));
});

test("duplicate candidate IDs fail", () => {
  const { brief } = copy();
  brief.candidates[1].id = brief.candidates[0].id;
  assert.ok(validateBlogBriefDocument(brief, briefSchema, repoRoot).some((error) => error.includes("duplicate candidate ID")));
});

test("local paths reject absolute paths, traversal, and URLs", () => {
  for (const value of ["/etc/passwd", "C:\\private.md", "../private.md", "https://example.test/a"]) {
    assert.notEqual(checkLocalPathShape(value, "path"), null);
  }
});
