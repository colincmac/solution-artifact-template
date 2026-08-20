import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readYamlFile,
  readJsonFile,
  validateManifestDocument,
  validateBlogBriefDocument,
  checkLocalPathShape,
} from "../scripts/lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const fixturesDir = path.join(__dirname, "fixtures");

const { data: manifestSchema } = readJsonFile(
  path.join(repoRoot, "docs", "solution-manifest.schema.json")
);
const { data: briefSchema } = readJsonFile(
  path.join(repoRoot, "docs", "publishing", "blog-brief.schema.json")
);

function loadManifestFixture(name) {
  const { data, error } = readYamlFile(
    path.join(fixturesDir, "manifest", name)
  );
  assert.equal(error, null, `fixture ${name} should parse as YAML`);
  return data;
}

function loadBriefFixture(name) {
  const { data, error } = readYamlFile(
    path.join(fixturesDir, "blog-brief", name)
  );
  assert.equal(error, null, `fixture ${name} should parse as YAML`);
  return data;
}

test("checkLocalPathShape accepts a simple repository-relative path", () => {
  assert.equal(checkLocalPathShape("docs/README.md", "label"), null);
});

test("checkLocalPathShape accepts a path with a fragment", () => {
  assert.equal(
    checkLocalPathShape("docs/README.md#section", "label"),
    null
  );
});

test("checkLocalPathShape rejects an absolute path", () => {
  const err = checkLocalPathShape("/etc/passwd", "label");
  assert.match(err, /absolute/);
});

test("checkLocalPathShape rejects parent-directory traversal", () => {
  const err = checkLocalPathShape("../secrets.md", "label");
  assert.match(err, /traversal/);
});

test("checkLocalPathShape rejects a URL", () => {
  const err = checkLocalPathShape("https://example.com/x.md", "label");
  assert.match(err, /URL/);
});

test("checkLocalPathShape rejects an empty value", () => {
  const err = checkLocalPathShape("", "label");
  assert.match(err, /non-empty/);
});

test("valid manifest fixture passes schema and entry point checks", () => {
  const data = loadManifestFixture("valid.yaml");
  const errors = validateManifestDocument(data, manifestSchema, repoRoot);
  assert.deepEqual(errors, []);
});

test("manifest with bad schemaVersion and maturity fails schema validation", () => {
  const data = loadManifestFixture(
    "invalid-schema-version-and-maturity.yaml"
  );
  const errors = validateManifestDocument(data, manifestSchema, repoRoot);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes("schemaVersion")));
});

test("manifest missing a required entry point fails validation", () => {
  const data = loadManifestFixture("missing-required-entry-point.yaml");
  const errors = validateManifestDocument(data, manifestSchema, repoRoot);
  assert.ok(errors.length > 0);
  assert.ok(
    errors.some(
      (e) => e.includes("adrIndex") || e.includes("required property")
    )
  );
});

test("manifest with absolute path, traversal, and URL entry points fails validation", () => {
  const data = loadManifestFixture("bad-path-values.yaml");
  const errors = validateManifestDocument(data, manifestSchema, repoRoot);
  assert.ok(errors.some((e) => e.includes("overview") && e.includes("absolute")));
  assert.ok(errors.some((e) => e.includes("adrIndex") && e.includes("traversal")));
  assert.ok(
    errors.some((e) => e.includes("publicationBrief") && e.includes("URL"))
  );
});

test("manifest entry point pointing at a nonexistent file fails validation", () => {
  const data = loadManifestFixture("valid.yaml");
  data.entryPoints.runbooks = "docs/does-not-exist.md";
  const errors = validateManifestDocument(data, manifestSchema, repoRoot);
  assert.ok(errors.some((e) => e.includes("does not exist")));
});

test("valid blog-brief fixture passes schema and path checks", () => {
  const data = loadBriefFixture("valid.yaml");
  const errors = validateBlogBriefDocument(data, briefSchema, repoRoot);
  assert.deepEqual(errors, []);
});

test("blog-brief with an invalid reviewStatus fails schema validation", () => {
  const data = loadBriefFixture("invalid-review-status.yaml");
  const errors = validateBlogBriefDocument(data, briefSchema, repoRoot);
  assert.ok(errors.length > 0);
});

test("blog-brief with absolute path, traversal, and URL source artifacts fails validation", () => {
  const data = loadBriefFixture("bad-path-values.yaml");
  const errors = validateBlogBriefDocument(data, briefSchema, repoRoot);
  assert.ok(errors.some((e) => e.includes("absolute")));
  assert.ok(errors.some((e) => e.includes("traversal")));
  assert.ok(errors.some((e) => e.includes("URL")));
});
