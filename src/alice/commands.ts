import * as vscode from "vscode";
import { aliceApi } from "./api";
import { convertUTC1ToLocalTime } from "../utils/time";
import { aliceStatusBarItem } from "../extension";
import { Plan, ALICE_ID, CONFIG, updateStateConfig } from "./state";
import {
  showAddApiTokenMenu,
  showControlInstanceMenu,
  showCreateInstanceMenu,
  renewalInstanceItems,
} from "./menu";

/**
 * 显示 Alice Ephemera 菜单
 */
export async function showMenu() {
  if (!CONFIG.apiToken) {
    showAddApiTokenMenu();
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
  vscode.commands.executeCommand("workbench.action.openSettings", ALICE_ID);
}

/**
 * 更新状态栏信息
 */
export async function updateStatusBar() {
  if (!CONFIG.apiToken) {
    // 更新状态栏文本和 Tooltip
    aliceStatusBarItem.text = `$(server) Alice:未配置ApiToken`;
    aliceStatusBarItem.tooltip = new vscode.MarkdownString(`
请在 [https://app.alice.ws/ephemera/console](https://app.alice.ws/ephemera/console) 获取ApiToken\n
点击设置 ApiToken`);
    aliceStatusBarItem.show();
  } else if (CONFIG.instanceList && CONFIG.instanceList.length > 0) {
    // 获取第一个实例的信息
    const instance = CONFIG.instanceList[0];
    const expiration_at = new Date(instance.expiration_at).getTime();
    const now = new Date().getTime();
    const timeLeft = expiration_at - now;

    // 计算剩余时间
    const hours = Math.floor((timeLeft / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((timeLeft / (1000 * 60)) % 60);

    // 如果实例剩余时间小于 5 分钟，则发起警告
    if (timeLeft < 5 * 60 * 1000 && timeLeft > 0) {
      vscode.window
        .showWarningMessage(
          `实例 ${instance.id} 剩余时间不足 ${minutes} 分钟，请及时备份数据！\n是否需要延长时间？`,
          { modal: true }, // 使用模态对话框
          "是",
          "否"
        )
        .then((selection) => {
          if (selection === "是") {
            renewalInstanceItems(instance.id);
          }
        });
    }

    if (timeLeft <= 0) {
      // 实例已过期或被删除，可能需要更新实例列表
      // 注意：这里只是显示消息，实际更新实例列表的逻辑应该在 updateConfig 中处理
      vscode.window.showErrorMessage(`实例 ${instance.id} 已被删除！`);
      // updateConfig("instance"); // 这个调用应该在 extension.ts 或 commands.ts 中处理
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
| **状态:** | 暂不可获取 |
| **系统:** | ${instance.os} |
| **CPU:** | ${instance.cpu} 核 |
| **内存:** | ${instance.memory / 1024} GB |
| **数据盘:** | ${instance.disk} GB |
| **网络:** | ${instance.show_speed} |
[**官网查看实例详情**](https://app.alice.ws/console/evo?id=${instance.uid}) |`);
    instanceInfo.isTrusted = true;
    // 更新状态栏文本和 Tooltip
    aliceStatusBarItem.text = `$(server) Alice: ${hours}h ${minutes}m`;
    aliceStatusBarItem.tooltip = instanceInfo;
    aliceStatusBarItem.show();
  } else {
    // 更新状态栏文本和 Tooltip
    aliceStatusBarItem.text = `$(server) Alice: 暂无实例`;
    aliceStatusBarItem.tooltip = "点击创建实例";
    aliceStatusBarItem.show();
  }
}

/**
 * 更新配置
 * @param flag - 更新配置的选项
 */
export async function updateConfig(
  flag: "all" | "instance" | "defaultPlan" = "all"
) {
  if (CONFIG.apiToken === "") {
    updateStatusBar(); // API Token 为空时更新状态栏
    return;
  }
  if (flag === "instance" || flag === "all") {
    // 获取实例列表
    await aliceApi
      .getInstanceList()
      .then((response) => {
        const instanceList = response.data?.data;
        if (instanceList && instanceList.length > 0) {
          instanceList.forEach((instance: any) => {
            instance.creation_at = convertUTC1ToLocalTime(
              instance.creation_at
            ).toLocaleString();
            instance.expiration_at = convertUTC1ToLocalTime(
              instance.expiration_at
            ).toLocaleString();
          });
        }
        updateStateConfig({ instanceList: instanceList || [] }); // 更新状态
      })
      .catch((error) => {
        if (error.response && error.response.status === 401) {
          vscode.window
            .showErrorMessage("认证失败：请检查 apiToken", "打开设置")
            .then((selection) => {
              if (selection === "打开设置") {
                openSettings();
              }
            });
          return; // 直接返回，不再执行后续代码
        }
        vscode.window
          .showErrorMessage("获取实例列表失败，请检查网络连接", "重试")
          .then((selection) => {
            if (selection === "重试") {
              updateConfig(flag);
            }
          });
        console.error("Error fetching instance list:", error);
        // throw error; // 不再抛出错误，避免中断后续配置获取
      });
  }

  if (flag === "all") {
    // 获取 EVO 可用权限
    await aliceApi
      .getEVOPermissions()
      .then((response) => {
        if (response.status === 200) {
          const evoPermissions = response.data?.data;
          if (evoPermissions?.allow_packages) {
            evoPermissions.allow_packages =
              evoPermissions.allow_packages.split("|");
          }
          updateStateConfig({ evoPermissions: evoPermissions || {} }); // 更新状态
        }
      })
      .catch((error) => {
        console.error("Error fetching EVO permissions:", error);
        // throw error;
      });

    // 获取计划列表
    await aliceApi
      .getPlanList()
      .then((response) => {
        if (response.status === 200) {
          let planList = response.data?.data;
          if (CONFIG.evoPermissions.allow_packages && planList) {
            planList = planList.filter((plan: any) =>
              CONFIG.evoPermissions.allow_packages.includes(plan.id.toString())
            );
          }
          if (planList) {
            planList.forEach((plan: any) => {
              plan.os = Object.values(plan.os).flatMap(
                (group: any) => group.os
              );
            });
          }
          updateStateConfig({ planList: planList || [] }); // 更新状态
        }
      })
      .catch((error) => {
        console.error("Error fetching plan list:", error);
        // throw error;
      });

    // 获取 SSH Key 列表
    await aliceApi
      .getSSHKeyList()
      .then((response) => {
        if (response.status === 200) {
          const sshKeyList = response.data?.data;
          if (sshKeyList && sshKeyList.length > 0) {
            sshKeyList.forEach((sshKey: any) => {
              sshKey.created_at = convertUTC1ToLocalTime(
                sshKey.created_at
              ).toLocaleString();
            });
          }
          updateStateConfig({ sshKeyList: sshKeyList || [] }); // 更新状态
        }
      })
      .catch((error) => {
        console.error("Error fetching SSH Key list:", error);
        // throw error;
      });
  }

  if (flag === "defaultPlan") {
    updateStateConfig({
      defaultPlan: vscode.workspace
        .getConfiguration(ALICE_ID)
        .get("plan") as Plan,
    }); // 更新默认计划
  }

  // 更新状态栏
  updateStatusBar();
}
