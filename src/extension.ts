import * as vscode from "vscode";
import { updateConfig, updateStatusBar, showMenu } from "./commands";
import {
  ALICE_ID,
  SHOW_ALICE_MENU_COMMAND_ID,
  Plan,
  updateStateConfig,
} from "./alice/config";
import { bootScript } from "./script/bootScript";
import { readLogFile } from "./script/bootScriptLog";

export let aliceStatusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  // --- 1. 创建状态栏项 ---
  aliceStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  context.subscriptions.push(aliceStatusBarItem);

  // 设置当状态栏项被点击时要执行的命令
  aliceStatusBarItem.command = SHOW_ALICE_MENU_COMMAND_ID;

  // --- 2. 显示 Quick Pick 菜单 ---
  const showMenuCommand = vscode.commands.registerCommand(
    SHOW_ALICE_MENU_COMMAND_ID,
    showMenu
  );
  context.subscriptions.push(showMenuCommand);

  const bootScriptCommand = vscode.commands.registerCommand(
    "aliceephemera.bootScript",
    bootScript
  );
  context.subscriptions.push(bootScriptCommand);

  const showScriptResultCommand = vscode.commands.registerCommand(
    "alice.showScriptResult",
    async (commandUid: string) => {
      if (!commandUid) {
        return;
      }
      const logs = await readLogFile();
      const logEntry = logs.find((log) => log.id === commandUid);

      if (!logEntry || !logEntry.output) {
        vscode.window.showErrorMessage("未找到该脚本的执行结果。");
        return;
      }

      const panel = vscode.window.createWebviewPanel(
        "scriptResult",
        `脚本执行结果: ${logEntry.scriptName}`,
        vscode.ViewColumn.One,
        {}
      );
      panel.webview.html = getWebviewContent(logEntry.output);
    }
  );
  context.subscriptions.push(showScriptResultCommand);

  // --- 3. 检测设置更改 ---
  let disposableConfigListener = vscode.workspace.onDidChangeConfiguration(
    async (event) => {
      if (
        event.affectsConfiguration(`${ALICE_ID}.clientId`) ||
        event.affectsConfiguration(`${ALICE_ID}.secret`)
      ) {
        updateStateConfig({
          clientId: vscode.workspace
            .getConfiguration(ALICE_ID)
            .get("clientId") as string,
          secret: vscode.workspace
            .getConfiguration(ALICE_ID)
            .get("secret") as string,
        });

        await updateConfig();
      }
      if (event.affectsConfiguration(`${ALICE_ID}.plan`)) {
        updateStateConfig({
          defaultPlan: vscode.workspace
            .getConfiguration(ALICE_ID)
            .get("plan") as Plan,
        });
      }
      if (event.affectsConfiguration(`${ALICE_ID}.autoConnectInstance`)) {
        updateStateConfig({
          autoConnectInstance: vscode.workspace
            .getConfiguration(ALICE_ID)
            .get("autoConnectInstance") as string,
        });
      }
      if (event.affectsConfiguration(`${ALICE_ID}.autoConnectInstanceHost`)) {
        updateStateConfig({
          autoConnectInstanceHost: vscode.workspace
            .getConfiguration(ALICE_ID)
            .get("autoConnectInstanceHost") as string,
        });
      }
      if (event.affectsConfiguration(`${ALICE_ID}.bootScriptPath`)) {
        updateStateConfig({
          bootScriptPath: vscode.workspace
            .getConfiguration(ALICE_ID)
            .get("bootScriptPath") as string,
        });
      }
    }
  );
  context.subscriptions.push(disposableConfigListener);

  updateStatusBar(); // 初始化状态栏
  aliceStatusBarItem.show(); // 显示状态栏项
}

// 插件停用时调用的函数
export function deactivate() {}

function getWebviewContent(content: string): string {
  // Escape HTML to prevent issues with special characters
  const escapedContent = content
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/'/g, "&#039;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Script Result</title>
    <style>
        body {
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-editor-font-family);
            font-weight: var(--vscode-editor-font-weight);
            font-size: var(--vscode-editor-font-size);
            padding: 1em;
        }
        pre {
            white-space: pre-wrap;
            word-wrap: break-word;
        }
    </style>
</head>
<body>
    <pre>${escapedContent}</pre>
</body>
</html>`;
}
