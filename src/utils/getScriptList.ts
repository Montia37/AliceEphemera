import * as fs from "fs";
import * as path from "path";

export async function getScriptList(bootScriptPath: string) {
  const files = fs.readdirSync(bootScriptPath);
  const scriptItems = files.map((file, index) => {
    const filePath = path.join(bootScriptPath, file);
    let detail = " ";
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      if (lines.length > 1 && lines[1].trim().startsWith("#")) {
        detail = lines[1].trim().substring(1).trim();
      }
    } catch (error) {
      console.error(`Error reading script file ${file}:`, error);
    }
    return {
      label: file,
      description: (index + 1).toString(),
      filePath: filePath,
      detail: detail,
    };
  });
  return scriptItems;
}
