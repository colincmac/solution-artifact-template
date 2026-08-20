#!/usr/bin/env node
// CLI entry point: validates docs/solution-manifest.yaml and
// docs/publishing/blog-brief.yaml against their JSON Schemas and entry-point
// rules, plus the YAML frontmatter of Copilot agent/instruction files.
//
// Usage: node scripts/validate.mjs [repoRoot]

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  readYamlFile,
  readJsonFile,
  validateManifestDocument,
  validateBlogBriefDocument,
  validateContractDocuments,
  findUnresolvedPlaceholders,
  validateAgentFrontmatter,
  validateInstructionsFrontmatter,
} from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot() {
  const repoRootArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  return repoRootArg
    ? path.resolve(repoRootArg)
    : path.resolve(__dirname, "..");
}

function listFiles(dir, suffix) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(suffix))
    .map((name) => path.join(dir, name));
}

export function runValidation(repoRoot, { requireInitialized = false } = {}) {
  const errors = [];

  const manifestPath = path.join(repoRoot, "docs", "solution-manifest.yaml");
  const manifestSchemaPath = path.join(
    repoRoot,
    "docs",
    "solution-manifest.schema.json"
  );
  const { data: parsedManifestData, error: manifestParseError } =
    readYamlFile(manifestPath);
  let manifestData;
  let briefData;
  if (manifestParseError) {
    errors.push(manifestParseError);
  } else {
    manifestData = parsedManifestData;
    const { data: manifestSchema, error: manifestSchemaError } =
      readJsonFile(manifestSchemaPath);
    if (manifestSchemaError) {
      errors.push(manifestSchemaError);
    } else {
      errors.push(
        ...validateManifestDocument(manifestData, manifestSchema, repoRoot)
      );
    }
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
  const { data: parsedBriefData, error: briefParseError } = readYamlFile(briefPath);
  if (briefParseError) {
    errors.push(briefParseError);
  } else {
    briefData = parsedBriefData;
    const { data: briefSchema, error: briefSchemaError } =
      readJsonFile(briefSchemaPath);
    if (briefSchemaError) {
      errors.push(briefSchemaError);
    } else {
      errors.push(
        ...validateBlogBriefDocument(briefData, briefSchema, repoRoot)
      );
    }
  }
  errors.push(...validateContractDocuments(manifestData, briefData));
  if (requireInitialized) {
    errors.push(...findUnresolvedPlaceholders(manifestData, "solution-manifest.yaml"));
    errors.push(...findUnresolvedPlaceholders(briefData, "blog-brief.yaml"));
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
  const errors = runValidation(repoRoot, {
    requireInitialized: process.argv.includes("--require-initialized"),
  });
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
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main();
}
