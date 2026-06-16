import { readFile } from "node:fs/promises";
import { listTrackedTextFiles } from "./lib/files.mjs";

const forbiddenPatterns = [
  { pattern: /AKIA[0-9A-Z]{16}/, label: "AWS-style access key", includeDocs: true },
  { pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, label: "private key", includeDocs: true },
  { pattern: /https?:\/\/[^ \n"]+X-Amz-Signature=/, label: "signed URL", includeDocs: true },
  { pattern: /\$queryRawUnsafe/, label: "unsafe raw SQL", includeDocs: false }
];

const failures = [];

for (const file of await listTrackedTextFiles()) {
  const text = await readFile(file, "utf8");
  for (const { pattern, label, includeDocs } of forbiddenPatterns) {
    if (!includeDocs && (file.startsWith("docs/") || file === "scripts/lint.mjs")) {
      continue;
    }
    if (pattern.test(text)) {
      failures.push(`${file}: ${label}`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Lint failed:\n${failures.join("\n")}`);
}

console.log("Lint passed: no obvious secrets, signed URLs or unsafe SQL patterns.");
