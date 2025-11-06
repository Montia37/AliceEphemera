import * as vscode from "vscode";
import { aliceStatusBarItem } from "./extension";
import {
  ALICE_ID,
  ALICE_SETTINGS,
  CONFIG,
  Plan,
  updateStateConfig,
} from "./alice/config";
import {
  showAddAuthKeyMenu,
  showControlInstanceMenu,
  showCreateInstanceMenu,
  renewalInstanceItems,
} from "./menu";
import { AliceService } from "./alice/aliceService";

let lastStatusBarText: string | undefined;
let lastStatusBarTooltip: vscode.MarkdownString | string | undefined;

export const aliceService = new AliceService({
  getClientId: () =>
    vscode.workspace.getConfiguration(ALICE_ID).get<string>("clientId"),
  getSecret: () =>
    vscode.workspace.getConfiguration(ALICE_ID).get<string>("secret"),
  getDefaultPlan: () =>
    vscode.workspace.getConfiguration(ALICE_ID).get("plan") as Plan,
  showErrorMessage: (message, ...items) =>
    vscode.window.showErrorMessage(message, ...items),
  showWarningMessage: (message, options, ...items) =>
    vscode.window.showWarningMessage(message, options, ...items),
  withProgress: (title, task) =>
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: title,
        cancellable: false,
      },
      task
    ),
  openSettings: () =>
    vscode.commands.executeCommand("workbench.action.openSettings", ALICE_ID),
  showRenewalInstanceMenu: (instanceId: string) =>
    renewalInstanceItems(instanceId),
});

/**
 * 显示 Alice Ephemera 菜单
 */
export async function showMenu() {
  if (CONFIG.init) {
    updateStateConfig({ init: false });
    await updateConfig(); // 更新所有配置
    return;
  }
  if (!CONFIG.clientId || !CONFIG.secret) {
    showAddAuthKeyMenu();
  } else if (CONFIG.instanceList && CONFIG.instanceList.length > 0) {
    // 显示控制实例的 Quick Pick 菜单
    showControlInstanceMenu(CONFIG.instanceList);
  } else {
    // 显示创建实例的 Quick Pick 菜单
    showCreateInstanceMenu();
  }
}

/**
 * 打开 Alice Ephemera 相关设置
 */
export async function openSettings() {
  vscode.commands.executeCommand(
    "workbench.action.openSettings",
    ALICE_SETTINGS
  );
}

/**
 * 更新状态栏信息
 */
export async function updateStatusBar() {
  if (CONFIG.init) {
    const newText = `$(server) Alice:点击加载`;
    const newTooltip = new vscode.MarkdownString(`点击刷新配置`);
    if (
      newText !== lastStatusBarText ||
      newTooltip.value !==
        (lastStatusBarTooltip as vscode.MarkdownString)?.value
    ) {
      aliceStatusBarItem.text = newText;
      aliceStatusBarItem.tooltip = newTooltip;
      lastStatusBarText = newText;
      lastStatusBarTooltip = newTooltip;
    }
    return; // 如果配置未初始化，直接返回
  }

  let newText: string;
  let newTooltip: vscode.MarkdownString | string;

  if (!CONFIG.clientId || !CONFIG.secret) {
    // 更新状态栏文本和 Tooltip
    newText = `$(server) Alice:未配置 Token`;
    newTooltip = new vscode.MarkdownString(`
请在 [https://app.alice.ws/api-secrets](https://app.alice.ws/api-secrets) 获取新的 Client ID 与 Secret\n
点击设置 Token`);
  } else if (CONFIG.instanceList && CONFIG.instanceList.length > 0) {
    // 获取第一个实例的信息
    const instance = CONFIG.instanceList[0];
    const expiration_at = new Date(instance.expiration_at).getTime();
    const now = new Date().getTime();
    const timeLeft = expiration_at - now;

    // 计算剩余时间
    const hours = Math.floor((timeLeft / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((timeLeft / (1000 * 60)) % 60);

    // 检查实例过期时间并显示警告
    aliceService.checkInstanceExpiration();

    // 获取实例实时状态
    const instanceState = await aliceService.getInstanceState(instance.id);
    if (instanceState) {
      updateStateConfig({ instanceState: instanceState });
    }

    const instanceInfo = new vscode.MarkdownString(`
|     |     |
| --- | --- |
| **实例 ID:** | ${instance.id} |
| **计划:** | ${instance.plan} |
| **IPv4:** | ${instance.ipv4} |
| **IPv6:** | ${instance.ipv6} |
| **HostName:** | ${instance.hostname} |
| **创建时间:** | ${instance.creation_at} |
| **到期时间:** | ${instance.expiration_at} |
| **剩余时间:** | ${hours}h ${minutes}m |
| **状态:** | ${instanceState?.state?.state || "未知"} |
| **系统:** | ${instance.os} |
| **CPU:** | 占用：${instanceState?.state?.cpu}% / ${instance.cpu} 核 |
| **内存:** | 可用：${instanceState?.state?.memory?.memavailable} / ${
      instance.memory / 1024
    } GB |
| **数据盘:** | ${instance.disk} GB |
| **已用流量:** | ${instanceState?.state?.traffic?.out}↑ / ${
      instanceState?.state?.traffic?.in
    }↓ GB |
| **网速:** | ${instance.show_speed} |
[**前往官网查看实例**](https://console.alice.ws/ephemera/evo-cloud) |`);
    instanceInfo.isTrusted = true;
    // 更新状态栏文本和 Tooltip
    newText = `$(server) Alice: ${hours}h ${minutes}m`;
    newTooltip = instanceInfo;
  } else {
    // 更新状态栏文本和 Tooltip
    newText = `$(server) Alice: 暂无实例`;
    newTooltip = "点击创建实例";
  }

  if (
    newText !== lastStatusBarText ||
    (typeof newTooltip === "string" ? newTooltip : newTooltip.value) !==
      (typeof lastStatusBarTooltip === "string"
        ? lastStatusBarTooltip
        : (lastStatusBarTooltip as vscode.MarkdownString)?.value)
  ) {
    aliceStatusBarItem.text = newText;
    aliceStatusBarItem.tooltip = newTooltip;
    lastStatusBarText = newText;
    lastStatusBarTooltip = newTooltip;
  }
}

/**
 * 更新配置
 * @param flag - 更新配置的选项
 */
export async function updateConfig(
  flag: "all" | "instance" | "defaultPlan" = "all"
) {
  await aliceService.updateConfig(flag);
  await updateStatusBar();
  if (!CONFIG.updateStatusBarInterval) {
    updateStateConfig({
      updateStatusBarInterval: setInterval(updateStatusBar, 60000),
    });
  }
}
