#!/usr/bin/env node
// CLI entry point: validates docs/solution-manifest.yaml and
// docs/publishing/blog-brief.yaml against their JSON Schemas and entry-point
// rules, plus the YAML frontmatter of Copilot agent/instruction files.
//
// Usage: node scripts/validate.mjs [repoRoot]

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  readYamlFile,
  readJsonFile,
  validateManifestDocument,
  validateBlogBriefDocument,
  validateAgentFrontmatter,
  validateInstructionsFrontmatter,
} from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot() {
  return process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, "..");
}

function listFiles(dir, suffix) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(suffix))
    .map((name) => path.join(dir, name));
}

export function runValidation(repoRoot) {
  const errors = [];

  const manifestPath = path.join(repoRoot, "docs", "solution-manifest.yaml");
  const manifestSchemaPath = path.join(
    repoRoot,
    "docs",
    "solution-manifest.schema.json"
  );
  const { data: manifestData, error: manifestParseError } =
    readYamlFile(manifestPath);
  if (manifestParseError) {
    errors.push(manifestParseError);
  } else {
    const manifestSchema = readJsonFile(manifestSchemaPath);
    errors.push(
      ...validateManifestDocument(manifestData, manifestSchema, repoRoot)
    );
  }

  const briefPath = path.join(
    repoRoot,
    "docs",
    "publishing",
    "blog-brief.yaml"
  );
  const briefSchemaPath = path.join(
    repoRoot,
    "docs",
    "publishing",
    "blog-brief.schema.json"
  );
  const { data: briefData, error: briefParseError } = readYamlFile(briefPath);
  if (briefParseError) {
    errors.push(briefParseError);
  } else {
    const briefSchema = readJsonFile(briefSchemaPath);
    errors.push(
      ...validateBlogBriefDocument(briefData, briefSchema, repoRoot)
    );
  }

  const agentsDir = path.join(repoRoot, ".github", "agents");
  for (const filePath of listFiles(agentsDir, ".agent.md")) {
    const contents = fs.readFileSync(filePath, "utf8");
    errors.push(
      ...validateAgentFrontmatter(contents, path.relative(repoRoot, filePath))
    );
  }

  const instructionsDir = path.join(repoRoot, ".github", "instructions");
  for (const filePath of listFiles(instructionsDir, ".instructions.md")) {
    const contents = fs.readFileSync(filePath, "utf8");
    errors.push(
      ...validateInstructionsFrontmatter(
        contents,
        path.relative(repoRoot, filePath)
      )
    );
  }

  return errors;
}

function main() {
  const repoRoot = findRepoRoot();
  const errors = runValidation(repoRoot);
  if (errors.length > 0) {
    console.error(`Validation failed with ${errors.length} error(s):\n`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log("All checks passed: solution-manifest.yaml and blog-brief.yaml are valid.");
}

const isMainModule =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}
