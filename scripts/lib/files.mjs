import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const textExtensions = new Set([
  ".json",
  ".md",
  ".mjs",
  ".js",
  ".yaml",
  ".yml",
  ".toml",
  ".prisma",
  ".py",
  ".txt",
  ".example",
  ".gitignore",
  ".gitattributes",
  ".npmrc"
]);

const ignoredFiles = new Set(["CLAUDE.md"]);
const ignoredPrefixes = [".claude/", "graphify-out/", "firecrawl-main/"];

export async function listTrackedTextFiles() {
  const { stdout } = await execFileAsync("git", ["ls-files", "--cached", "--others", "--exclude-standard"]);
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(shouldIncludeTextFile);
}

export function shouldIncludeTextFile(file) {
  if (ignoredFiles.has(file)) {
    return false;
  }
  if (ignoredPrefixes.some((prefix) => file.startsWith(prefix))) {
    return false;
  }
  const dotIndex = file.lastIndexOf(".");
  const extension = dotIndex >= 0 ? file.slice(dotIndex) : file;
  return textExtensions.has(extension);
}
