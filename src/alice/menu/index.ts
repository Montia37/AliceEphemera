import * as vscode from "vscode";
import { aliceApi } from "../api";
import { Plan, ALICE_ID, CONFIG, updateStateConfig } from "../state";
import {
  createInstanceMultiStep,
  rebulidInstanceMultiStep,
} from "./instanceMultiStep";
import { updateConfig, openSettings, updateStatusBar } from "../commands";
import { checkServerSSH } from "../../utils/checkSsh";
import { convertUTC1ToLocalTime } from "../../utils/time";

/**
 * 显示 API Token 输入框
 */
export async function showAddApiTokenMenu() {
  const apiToken = await vscode.window.showInputBox({
    title: "请输入 API Token",
    placeHolder: "API Token",
    prompt: "在 https://app.alice.ws/ephemera/console 中获取",
    ignoreFocusOut: true,
  });
  if (apiToken) {
    await vscode.workspace
      .getConfiguration(ALICE_ID)
      .update("apiToken", apiToken, true);
    vscode.window.showInformationMessage("API Token 设置成功");
    // 重新加载配置
    // 调用 updateConfig 函数，该函数将负责更新状态并触发状态栏更新
    updateConfig();
  }
}

/**
 * 无实例时显示的 Quick Pick 菜单
 */
export async function showCreateInstanceMenu() {
  let default_detail = "暂无默认配置，点击添加";
  const default_plan_config = CONFIG.planList.find(
    (plan: any) => plan.id.toString() === CONFIG.defaultPlan.id
  );

  if (default_plan_config) {
    const default_os = default_plan_config.os.find(
      (os: any) => os.id.toString() === CONFIG.defaultPlan.os
    );
    const default_sshKey = CONFIG.sshKeyList.find(
      (sshKey: any) => sshKey.id.toString() === CONFIG.defaultPlan.sshKey
    );
    default_detail = `计划: ${default_plan_config?.name || ""} | 系统: ${
      default_os?.name || ""
    } | 时间: ${CONFIG.defaultPlan.time || ""}小时 | SSH Key: ${
      default_sshKey?.name || "不使用"
    }`;
  }

  // 创建 Quick Pick Item
  const createItems: vscode.QuickPickItem[] = [
    {
      label: `$(plus) 创建实例`,
      detail: "创建新的实例",
    },
    {
      label: `$(plus) 以默认配置创建`,
      detail: default_detail,
    },
    {
      label: `$(edit) 编辑默认配置`,
      detail: "点击编辑",
    },
    {
      label: `$(settings) 打开设置`,
      detail: "配置 apiToken 和实例默认配置",
    },
  ];
  const selectedItem = await vscode.window.showQuickPick(createItems, {
    title: "Alice Ephemera",
    placeHolder: "请选择要执行的操作",
  });
  if (selectedItem) {
    switch (selectedItem.label) {
      case `$(plus) 创建实例`: {
        const { status, plan } = await createInstanceMultiStep();
        if (status === "completed" && plan) {
          createInstance(plan);
        }
        break;
      }
      case `$(plus) 以默认配置创建`: {
        if (default_plan_config) {
          createInstance(CONFIG.defaultPlan);
        } else {
          const { status, plan } = await createInstanceMultiStep();
          // 更新默认配置
          if (status === "completed" && plan) {
            await vscode.workspace
              .getConfiguration(ALICE_ID)
              .update("plan", plan, true);
            vscode.window.showInformationMessage("默认配置创建成功");
            updateConfig("defaultPlan"); // 更新默认计划状态
          }
        }
        break;
      }
      case `$(edit) 编辑默认配置`: {
        const { status, plan } = await createInstanceMultiStep(
          CONFIG.defaultPlan
        );
        // 更新默认配置
        if (status === "completed" && plan) {
          await vscode.workspace
            .getConfiguration(ALICE_ID)
            .update("plan", plan, true);
          vscode.window.showInformationMessage("默认配置更新成功");
          updateConfig("defaultPlan"); // 更新默认计划状态
        }
        break;
      }
      case `$(settings) 打开设置`: {
        openSettings();
        break;
      }
    }
  }
}

/**
 * 创建实例
 * @param plan - 实例规格
 */
async function createInstance(plan: Plan) {
  if (plan) {
    aliceApi
      .createInstance(plan.id, plan.os, plan.time, plan.sshKey)
      .then(async (response) => {
        const instance = response.data?.data;
        instance.creation_at = convertUTC1ToLocalTime(
          instance.creation_at
        ).toLocaleString();
        instance.expiration_at = convertUTC1ToLocalTime(
          instance.expiration_at
        ).toLocaleString();
        updateStateConfig({ instanceList: [instance] });
        if (await checkServerSSH("正在创建实例", instance.hostname)) {
          vscode.window.showInformationMessage("实例创建成功，SSH 连接正常");
          updateStatusBar();
        }
        // vscode.window.showInformationMessage("实例创建成功");
      })
      .catch((err) => {
        vscode.window.showErrorMessage(`实例创建失败: ${err}`);
      });
  }
}

/**
 * 有实例时显示控制实例的 Quick Pick 菜单
 * @param instanceList - 实例列表
 */
export async function showControlInstanceMenu(instanceList: any[]) {
  const items: vscode.QuickPickItem[] = [
    {
      label: `$(trash) 删除实例`,
      detail: "删除当前实例",
    },
    {
      label: `$(clock) 延长时间`,
      detail: "延长当前实例的使用时间",
    },
    {
      label: `$(sync) 重装系统`,
      detail: "重新安装当前实例的操作系统",
    },
    {
      label: `$(plug) 控制电源`,
      detail: "控制当前实例的电源 (启动, 关闭, 重启， 断电)",
    },
    {
      label: `$(settings) 打开设置`,
      detail: "配置 apiToken 和实例默认配置",
    },
  ];

  const selectedItem = await vscode.window.showQuickPick(items, {
    title: "控制实例",
    placeHolder: "请选择要执行的操作",
  });

  if (selectedItem) {
    // 确保 instanceList 不为空
    if (!instanceList || instanceList.length === 0) {
      vscode.window.showErrorMessage("没有可控制的实例。");
      return;
    }
    const instanceId = instanceList[0].id.toString();
    const instancePlanId = instanceList[0].plan_id.toString();
    switch (selectedItem.label) {
      case `$(trash) 删除实例`:
        deleteInstanceItems(instanceId);
        break;
      case `$(clock) 延长时间`:
        renewalInstanceItems(instanceId);
        break;
      case `$(sync) 重装系统`:
        rebulidInstanceItems(instanceId, instancePlanId);
        break;
      case `$(plug) 控制电源`:
        powerInstanceItems(instanceId);
        break;
      case `$(settings) 打开设置`:
        openSettings();
        break;
    }
  }
}

/**
 * 延长实例时间
 * @param instanceId - 实例 ID
 */
export async function renewalInstanceItems(instanceId: string) {
  const time = await vscode.window.showInputBox({
    title: "输入时间",
    placeHolder: "请输入要延长时间（小时）",
    validateInput: (input) => {
      const time = parseInt(input);
      if (isNaN(time) || time <= 0) {
        return "请输入有效的时间";
      }
      if (time > CONFIG.evoPermissions.max_time) {
        return `最长可为${CONFIG.evoPermissions.max_time}小时`;
      }
      return null;
    },
  });
  if (time) {
    aliceApi
      .renewalInstance(instanceId, time)
      .then(() => {
        vscode.window.showInformationMessage("实例延长时间成功");
        updateConfig("instance"); // 延长时间成功后更新实例列表
      })
      .catch((err) => {
        vscode.window.showErrorMessage(`实例延长时间失败: ${err}`);
      });
  }
}

/**
 * 删除实例
 * @param instanceId - 实例 ID
 */
async function deleteInstanceItems(instanceId: string) {
  const confirm = await vscode.window.showWarningMessage(
    `确定要删除实例 ${instanceId} 吗？`,
    { modal: true },
    "删除"
  );
  if (confirm === "删除") {
    aliceApi
      .deleteInstance(instanceId)
      .then(() => {
        vscode.window.showInformationMessage("实例删除成功");
        updateConfig("instance"); // 删除成功后更新实例列表
      })
      .catch((err) => {
        vscode.window.showErrorMessage(`实例删除失败: ${err}`);
      });
  }
}

/**
 * 重装实例
 * @param instanceId - 实例 ID
 * @param planId - 配置 ID
 */
export async function rebulidInstanceItems(instanceId: string, planId: string) {
  const { status, rebulidInfo } = await rebulidInstanceMultiStep(planId);
  if (status === "completed" && rebulidInfo) {
    aliceApi
      .rebulidInstance(instanceId, rebulidInfo.os, rebulidInfo.sshKey)
      .then(async (response) => {
        if (response.data?.status === 200) {
          if (
            await checkServerSSH("正在重装系统", response.data?.data?.hostname)
          ) {
            vscode.window.showInformationMessage("实例重装成功，SSH 连接正常");
            updateConfig("instance");
          }
        }
      })
      .catch((err) => {
        vscode.window.showErrorMessage(`实例重装失败: ${err}`);
      });
  }
}

/**
 * 控制实例电源
 * @param instanceId - 实例 ID
 */
export async function powerInstanceItems(instanceId: string) {
  const powerItems: vscode.QuickPickItem[] = [
    { label: "启动", detail: "启动实例" },
    { label: "关闭", detail: "关闭实例" },
    { label: "重启", detail: "重启实例" },
    { label: "断电", detail: "强制断电" },
  ];

  const selectedPower = await vscode.window.showQuickPick(powerItems, {
    title: "控制电源",
    placeHolder: "请选择要执行的电源操作（实例状态暂无法获取，需自行判断）",
  });

  if (selectedPower) {
    let action: "boot" | "shutdown" | "restart" | "poweroff" = "shutdown";
    switch (selectedPower.label) {
      case "启动":
        action = "boot";
        break;
      case "关闭":
        action = "shutdown";
        break;
      case "重启":
        action = "restart";
        break;
      case "断电":
        action = "poweroff";
        break;
    }

    aliceApi
      .powerInstance(instanceId, action)
      .then(() => {
        vscode.window.showInformationMessage(`实例${selectedPower.label}成功`);
        updateConfig("instance"); // 电源操作成功后更新实例列表
      })
      .catch((err) => {
        vscode.window.showErrorMessage(
          `实例${selectedPower.label}失败: ${err}`
        );
      });
  }
}
