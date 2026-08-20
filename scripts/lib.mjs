// Shared validation library for the solution manifest and publication brief.
//
// Kept dependency-light on purpose: only `yaml` (parsing) and `ajv` (JSON
// Schema validation) are required. All checks are pure functions that
// return a list of human-readable error strings, so both the CLI
// (scripts/validate.mjs) and the test suite (test/) can reuse them.

import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import Ajv from "ajv";

/**
 * Parse a YAML file, returning { data, error }. Never throws.
 */
export function readYamlFile(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    return { data: null, error: `Could not read ${filePath}: ${err.message}` };
  }
  try {
    return { data: parseYaml(raw), error: null };
  } catch (err) {
    return { data: null, error: `Could not parse YAML in ${filePath}: ${err.message}` };
  }
}

export function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function newAjv() {
  return new Ajv({ allErrors: true, strict: false });
}

/**
 * Validate `data` against a JSON Schema object. Returns a list of
 * human-readable error strings (empty if valid).
 */
export function validateAgainstSchema(data, schema, label) {
  const ajv = newAjv();
  const validateFn = ajv.compile(schema);
  const valid = validateFn(data);
  if (valid) return [];
  return (validateFn.errors ?? []).map(
    (e) => `${label}: ${e.instancePath || "(root)"} ${e.message}`
  );
}

/**
 * Checks whether a path value is an acceptable repository-relative local
 * path: no leading "/", no ".." traversal segments, and not a URL.
 * Returns null if acceptable, or an error string describing the problem.
 */
export function checkLocalPathShape(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    return `${label}: must be a non-empty string`;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value) || value.startsWith("//")) {
    return `${label}: must be a repository-relative local path, not a URL ("${value}")`;
  }
  if (path.isAbsolute(value) || value.startsWith("/")) {
    return `${label}: must be repository-relative, not absolute ("${value}")`;
  }
  const withoutFragment = value.split("#")[0];
  const segments = withoutFragment.split(/[\\/]/);
  if (segments.some((segment) => segment === "..")) {
    return `${label}: must not use parent-directory traversal ("${value}")`;
  }
  return null;
}

/**
 * Checks that a repository-relative local path (optionally with a
 * "#fragment") points at a file/directory that actually exists, relative
 * to `repoRoot`. Assumes checkLocalPathShape has already passed.
 */
export function checkLocalPathExists(value, repoRoot, label) {
  const withoutFragment = value.split("#")[0];
  const resolved = path.join(repoRoot, withoutFragment);
  if (!fs.existsSync(resolved)) {
    return `${label}: entry point path does not exist: "${withoutFragment}"`;
  }
  return null;
}

const REQUIRED_MANIFEST_ENTRY_POINTS = [
  "overview",
  "architectureIndex",
  "adrIndex",
  "deployment",
  "runbooks",
  "observability",
  "evidence",
  "publicationBrief",
];

const OPTIONAL_MANIFEST_ENTRY_POINTS = ["implementation", "automation"];

/**
 * Validate a parsed solution-manifest document: schema, then required
 * entry points exist and every non-null entry point (required or
 * optional) is a well-formed local path.
 */
export function validateManifestDocument(data, schema, repoRoot) {
  const errors = [];
  errors.push(...validateAgainstSchema(data, schema, "solution-manifest.yaml"));

  const entryPoints = (data && data.entryPoints) || {};
  for (const key of REQUIRED_MANIFEST_ENTRY_POINTS) {
    const value = entryPoints[key];
    const label = `solution-manifest.yaml entryPoints.${key}`;
    if (value === undefined || value === null) {
      errors.push(`${label}: is required and must not be null`);
      continue;
    }
    const shapeError = checkLocalPathShape(value, label);
    if (shapeError) {
      errors.push(shapeError);
      continue;
    }
    const existsError = checkLocalPathExists(value, repoRoot, label);
    if (existsError) errors.push(existsError);
  }
  for (const key of OPTIONAL_MANIFEST_ENTRY_POINTS) {
    const value = entryPoints[key];
    if (value === undefined || value === null) continue;
    const label = `solution-manifest.yaml entryPoints.${key}`;
    const shapeError = checkLocalPathShape(value, label);
    if (shapeError) {
      errors.push(shapeError);
      continue;
    }
    const existsError = checkLocalPathExists(value, repoRoot, label);
    if (existsError) errors.push(existsError);
  }
  return errors;
}

const CANDIDATE_PATH_LIST_FIELDS = [
  "sourceArtifacts",
  "operations",
  "evidence",
];

/**
 * Validate a parsed blog-brief document: schema, then well-formed (and,
 * where non-empty, existing) local paths for every candidate's path-list
 * fields.
 */
export function validateBlogBriefDocument(data, schema, repoRoot) {
  const errors = [];
  errors.push(...validateAgainstSchema(data, schema, "blog-brief.yaml"));

  const candidates = (data && data.candidates) || {};
  for (const [candidateName, candidate] of Object.entries(candidates)) {
    if (!candidate || typeof candidate !== "object") continue;
    for (const field of CANDIDATE_PATH_LIST_FIELDS) {
      const values = candidate[field];
      if (!Array.isArray(values)) continue;
      values.forEach((value, index) => {
        const label = `blog-brief.yaml candidates.${candidateName}.${field}[${index}]`;
        const shapeError = checkLocalPathShape(value, label);
        if (shapeError) {
          errors.push(shapeError);
          return;
        }
        const existsError = checkLocalPathExists(value, repoRoot, label);
        if (existsError) errors.push(existsError);
      });
    }
  }
  return errors;
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Extract and parse YAML frontmatter from a Markdown file's contents.
 * Returns { frontmatter, error }. `frontmatter` is null if no frontmatter
 * block is found or it fails to parse.
 */
export function parseFrontmatter(contents) {
  const match = contents.match(FRONTMATTER_PATTERN);
  if (!match) {
    return { frontmatter: null, error: "no YAML frontmatter block found" };
  }
  try {
    return { frontmatter: parseYaml(match[1]) ?? {}, error: null };
  } catch (err) {
    return { frontmatter: null, error: `invalid YAML frontmatter: ${err.message}` };
  }
}

/**
 * Validate the YAML frontmatter of an `.agent.md` file: requires
 * `description`.
 */
export function validateAgentFrontmatter(contents, label) {
  const { frontmatter, error } = parseFrontmatter(contents);
  if (error) return [`${label}: ${error}`];
  const errors = [];
  if (!frontmatter.description || typeof frontmatter.description !== "string") {
    errors.push(`${label}: frontmatter must include a non-empty "description"`);
  }
  return errors;
}

/**
 * Validate the YAML frontmatter of an `.instructions.md` file: requires
 * `applyTo` (a glob string) and `description`.
 */
export function validateInstructionsFrontmatter(contents, label) {
  const { frontmatter, error } = parseFrontmatter(contents);
  if (error) return [`${label}: ${error}`];
  const errors = [];
  if (!frontmatter.applyTo || typeof frontmatter.applyTo !== "string") {
    errors.push(`${label}: frontmatter must include a non-empty "applyTo" glob`);
  }
  if (!frontmatter.description || typeof frontmatter.description !== "string") {
    errors.push(`${label}: frontmatter must include a non-empty "description"`);
  }
  return errors;
}
