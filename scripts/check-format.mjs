import { readFile } from "node:fs/promises";
import { listTrackedTextFiles } from "./lib/files.mjs";

const files = await listTrackedTextFiles();
const failures = [];

for (const file of files) {
  const text = await readFile(file, "utf8");
  if (!text.endsWith("\n")) {
    failures.push(`${file}: missing trailing newline`);
  }
  if (/\r\n/.test(text)) {
    failures.push(`${file}: CRLF line ending detected`);
  }
}

if (failures.length > 0) {
  throw new Error(`Format check failed:\n${failures.join("\n")}`);
}

console.log(`Format check passed for ${files.length} text files.`);
