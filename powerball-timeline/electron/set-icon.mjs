import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as ResEdit from "resedit";

const exePath = path.join("release", "win-unpacked", "PowerBall Predictor.exe");
const iconPath = path.join("build", "icon.ico");

const exe = ResEdit.NtExecutable.from(readFileSync(exePath), { ignoreCert: true });
const resources = ResEdit.NtExecutableResource.from(exe);
const iconFile = ResEdit.Data.IconFile.from(readFileSync(iconPath));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);

if (groups.length === 0) {
  throw new Error("The Windows executable has no icon group to replace.");
}

const icons = iconFile.icons.map((item) => item.data);
for (const group of groups) {
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, icons);
  console.log(`embedded icon group ${group.id} lang ${group.lang}`);
}

const versionInfo = ResEdit.Resource.VersionInfo.fromEntries(resources.entries)[0];
if (versionInfo) {
  versionInfo.setStringValues(
    { lang: 1033, codepage: 1200 },
    {
      ProductName: "PowerBall Predictor",
      FileDescription: "PowerBall Predictor",
      InternalName: "PowerBall Predictor",
      OriginalFilename: "PowerBall Predictor.exe",
    },
  );
  versionInfo.outputToResourceEntries(resources.entries);
}

resources.outputResource(exe);
const output = Buffer.from(exe.generate());
const tempPath = `${exePath}.tmp`;
writeFileSync(tempPath, output);
renameSync(tempPath, exePath);
console.log(`wrote icon into ${exePath} (${output.length} bytes)`);
