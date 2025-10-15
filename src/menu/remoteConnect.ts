import * as vscode from "vscode";
import { ALICE_ID, CONFIG } from "../alice/config";

/**
 * 显示远程连接菜单
 */
export async function showRemoteConnectMenu() {
  const items: vscode.QuickPickItem[] = [
    {
      label: `$(file-code) 打开 SSH 配置文件`,
      detail: "调用 Remote-SSH 插件打开 SSH 配置文件",
    },
    {
      label: `$(settings-gear) 实例创建成功后...`,
      detail: "选择实例创建成功后的动作",
      description:
        CONFIG.autoConnectInstance !== "false"
          ? CONFIG.autoConnectInstance === "new"
            ? "在新窗口连接到实例"
            : "在当前窗口连接到实例"
          : "不自动连接实例",
    },
    {
      label: `$(account) 编辑 SSH 连接 Host 别名`,
      detail: "编辑 SSH 连接 Host 别名",
      description: CONFIG.autoConnectInstanceHost || `未配置 Host 别名`,
    },
  ];

  const selectedItem = await vscode.window.showQuickPick(items, {
    title: "远程连接配置",
    placeHolder: "请选择要执行的操作",
  });

  if (!selectedItem) {
    return;
  }

  switch (selectedItem.label) {
    case `$(file-code) 打开 SSH 配置文件`:
      vscode.commands.executeCommand("opensshremotes.openConfigFile");
      break;
    case `$(settings-gear) 实例创建成功后...`:
      await showAutoConnectMenu();
      break;
    case `$(account) 编辑 SSH 连接 Host 别名`:
      await showEditHostAliasMenu();
      break;
  }
}

/**
 * 显示自动连接菜单
 */
export async function showAutoConnectMenu() {
  const items: vscode.QuickPickItem[] = [
    {
      label: "不自动连接实例",
      description: "false",
    },
    {
      label: "在当前窗口连接到实例",
      description: "true",
    },
    {
      label: "在新窗口连接到实例",
      description: "new",
    },
  ];

  const selectedItem = await vscode.window.showQuickPick(items, {
    title: "实例创建成功后...",
    placeHolder: "请选择要执行的操作",
  });

  if (selectedItem && selectedItem.description) {
    await vscode.workspace
      .getConfiguration(ALICE_ID)
      .update("autoConnectInstance", selectedItem.description, true);
    CONFIG.autoConnectInstance = selectedItem.description;
    vscode.window.showInformationMessage("设置成功");
  }
}

/**
 * 显示编辑 Host 别名菜单
 */
export async function showEditHostAliasMenu() {
  const hostAlias = await vscode.window.showInputBox({
    title: "编辑 SSH 连接 Host 别名",
    placeHolder: "请输入 Host 别名",
    value: CONFIG.autoConnectInstanceHost,
    prompt: "在 Remote-SSH 中配置密钥连接使用的 Host 别名",
    ignoreFocusOut: true,
  });

  if (hostAlias !== undefined) {
    await vscode.workspace
      .getConfiguration(ALICE_ID)
      .update("autoConnectInstanceHost", hostAlias, true);
    CONFIG.autoConnectInstanceHost = hostAlias;
    vscode.window.showInformationMessage("设置成功");
  }
}
