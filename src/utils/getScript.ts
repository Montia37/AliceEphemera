import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { CONFIG } from "../alice/config";

export async function getScriptList(bootScriptPath: string) {
  const files = fs.readdirSync(bootScriptPath);
  const scriptItems = files
    .filter((file) => !file.endsWith(".json"))
    .map((file, index) => {
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

/**
 * 获取启动脚本内容
 * @param scriptName - 脚本文件名
 * @returns 脚本内容或 undefined
 */
export async function getBootScriptContent(
  scriptName: string
): Promise<string | undefined> {
  if (!scriptName) {
    return undefined;
  }
  const scriptPath = vscode.Uri.joinPath(
    vscode.Uri.file(CONFIG.bootScriptPath),
    scriptName
  ).fsPath;
  try {
    const fileContent = await vscode.workspace.fs.readFile(
      vscode.Uri.file(scriptPath)
    );

    return Buffer.from(fileContent).toString("base64");
  } catch (error) {
    vscode.window.showErrorMessage(`读取启动脚本失败: ${error}`);
    return undefined;
  }
}
