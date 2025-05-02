import * as vscode from "vscode";
import { updateConfig, updateStatusBar, showMenu } from "./alice/commands";
import { Plan, ALICE_ID, updateStateConfig } from "./alice/state";

const SHOW_ALICE_MENU_COMMAND_ID = `${ALICE_ID}.showAliceMenu`;

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

  updateConfig();

  // --- 2. 显示 Quick Pick 菜单 ---
  const showMenuCommand = vscode.commands.registerCommand(
    SHOW_ALICE_MENU_COMMAND_ID,
    showMenu
  );
  context.subscriptions.push(showMenuCommand);

  // --- 3. 检测设置更改 ---
  let disposableConfigListener = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (event.affectsConfiguration(`${ALICE_ID}.apiToken`)) {
        updateStateConfig({
          apiToken: vscode.workspace
            .getConfiguration(ALICE_ID)
            .get("apiToken") as string,
        });

        updateConfig();
      }
      if (event.affectsConfiguration(`${ALICE_ID}.plan`)) {
        updateStateConfig({
          defaultPlan: vscode.workspace
            .getConfiguration(ALICE_ID)
            .get("plan") as Plan,
        });
      }
    }
  );
  context.subscriptions.push(disposableConfigListener);

  // 定时更新状态栏
  setInterval(updateStatusBar, 60000); // 每分钟更新一次
}

// 插件停用时调用的函数
export function deactivate() {}
