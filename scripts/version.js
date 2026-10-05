import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pkgPath = path.join(root, "package.json");
const lockPath = path.join(root, "package-lock.json");
const configPath = path.join(root, "ha-app/config.yaml");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const current = pkg.version;
const parts = current.split(".");
if (parts.length !== 3 || parts.some(p => !/^\d+$/.test(p))) {
  console.error(`version: expected YYYY.M.MICRO, got "${current}"`);
  process.exit(1);
}

const versionYear = Number(parts[0]);
const versionMonth = Number(parts[1]);
const versionMicro = Number(parts[2]);

const now = new Date();
const currentYear = now.getUTCFullYear();
const currentMonth = now.getUTCMonth() + 1;

let nextVersion;
if (versionYear === currentYear && versionMonth === currentMonth) {
  nextVersion = `${versionYear}.${versionMonth}.${versionMicro + 1}`;
}
else if (versionYear === currentYear) {
  nextVersion = `${versionYear}.${currentMonth}.0`;
}
else {
  nextVersion = `${currentYear}.1.0`;
}

pkg.version = nextVersion;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const lockText = fs.readFileSync(lockPath, "utf8");
const lock = JSON.parse(lockText);
if (lock.version !== current || lock.packages?.[""]?.version !== current) {
  console.error(
    `version: package-lock.json version mismatch (expected ${current}, got root=${lock.version} packages[""]=${lock.packages?.[""]?.version})`,
  );
  process.exit(1);
}
let lockReplaced = 0;
const updatedLock = lockText.replace(
  new RegExp(`"version": "${current.replace(/\./g, "\\.")}"`, "g"),
  (match) => {
    if (lockReplaced < 2) {
      lockReplaced++;
      return `"version": "${nextVersion}"`;
    }
    return match;
  },
);
if (lockReplaced !== 2) {
  console.error(
    `version: expected to update 2 package-lock.json version fields, updated ${lockReplaced}`,
  );
  process.exit(1);
}
fs.writeFileSync(lockPath, updatedLock);

const config = fs.readFileSync(configPath, "utf8");
fs.writeFileSync(configPath, config.replace(/^version:.*/m, `version: ${nextVersion}`));

console.warn(nextVersion);
