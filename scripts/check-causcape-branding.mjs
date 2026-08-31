import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const legacyName = "excal" + "idraw";
const dependencySourcePattern = new RegExp(
  `npm:@${legacyName}/[a-z0-9-]+@[a-z0-9.^~-]+`,
  "gi",
);
const allowedProvenanceFiles = new Set([
  "LICENSE",
  "packages/laser-pointer/LICENSE",
  "yarn.lock",
]);

const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

const violations = [];
for (const file of trackedFiles) {
  if (!existsSync(file) || allowedProvenanceFiles.has(file)) {
    continue;
  }
  if (file.toLowerCase().includes(legacyName)) {
    violations.push(`${file}: legacy name in path`);
  }

  const contents = readFileSync(file);
  if (contents.includes(0)) {
    continue;
  }
  const lines = contents.toString("utf8").split("\n");
  lines.forEach((line, index) => {
    const ownedContent = line.replace(dependencySourcePattern, "");
    if (ownedContent.toLowerCase().includes(legacyName)) {
      violations.push(`${file}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (violations.length > 0) {
  const preview = violations.slice(0, 50).join("\n");
  const remaining = violations.length - 50;
  throw new Error(
    `Found ${violations.length} legacy branding references:\n${preview}${
      remaining > 0 ? `\n...and ${remaining} more` : ""
    }`,
  );
}

console.log("Causcape branding audit passed");
