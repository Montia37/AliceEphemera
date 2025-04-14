import * as vscode from "vscode";
import {
  getInstanceList,
  getEVOPermissions,
  getPlanList,
  getSSHKeyList,
  createInstance,
  deleteInstance,
  renewalInstance,
  powerInstance,
  rebulidInstance,
} from "./alice/api";
import { convertUTC1ToLocalTime } from "./utils/time";

const ALICE_ID = "aliceephemera";
const SHOW_ALICE_MENU_COMMAND_ID = "ALICE_ID.showAliceMenu";

let aliceStatusBarItem: vscode.StatusBarItem;

const CONFIG = {
  apiToken: "" as string,
  evoPermissions: {} as any,
  instanceList: [] as any[],
  planList: [] as any[],
  sshKeyList: [] as any[],
};

interface Plan {
  id: string;
  os: string;
  time: string;
  sshKey: string;
}

const DEFAULT_PLAN = vscode.workspace
  .getConfiguration(ALICE_ID)
  .get("plan") as Plan;

// 插件激活时调用的函数
export function activate(context: vscode.ExtensionContext) {
  // --- 1. 创建状态栏项 ---
  aliceStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  context.subscriptions.push(aliceStatusBarItem); // 添加到订阅，自动清理

  // 设置当状态栏项被点击时要执行的命令
  aliceStatusBarItem.command = SHOW_ALICE_MENU_COMMAND_ID;

  updateConfig();

  // --- 2. 注册命令，用于显示 Quick Pick 菜单 ---
  const showMenuCommand = vscode.commands.registerCommand(
    SHOW_ALICE_MENU_COMMAND_ID,
    async () => {
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
  );
  context.subscriptions.push(showMenuCommand);

  // 定时更新状态栏
  setInterval(updateStatusBar, 60000); // 每分钟更新一次

  // 将注册的命令也添加到订阅中，确保在插件停用时被清理
  context.subscriptions.push(showMenuCommand);
}

// 插件停用时调用的函数
export function deactivate() {}

// --- 函数：更新配置 ---
async function updateConfig(flag: "all" | "instance" | "defaultPlan" = "all") {
  CONFIG.apiToken = vscode.workspace
    .getConfiguration(ALICE_ID)
    .get("apiToken") as string;
  if (CONFIG.apiToken === "") {
    updateStatusBar();
    return;
  }
  if (flag === "instance" || flag === "all") {
    // 获取实例列表
    await getInstanceList()
      .then((response) => {
        if (response.status === 200) {
          CONFIG.instanceList = response.data?.data;
          if (CONFIG.instanceList.length > 0) {
            CONFIG.instanceList.forEach((instance: any) => {
              instance.creation_at = convertUTC1ToLocalTime(
                instance.creation_at
              ).toLocaleString();
              instance.expiration_at = convertUTC1ToLocalTime(
                instance.expiration_at
              ).toLocaleString();
            });
          }
        } else {
          vscode.window
            .showErrorMessage("未授权：请检查 apiToken", "打开设置")
            .then((selection) => {
              if (selection === "打开设置") {
                vscode.commands.executeCommand(
                  "workbench.action.openSettings",
                  ALICE_ID
                );
              }
            });
          throw new Error(`Error: ${response.status}`);
        }
      })
      .catch((error) => {
        vscode.window
          .showErrorMessage("获取实例列表失败，请检查网络连接", "重试")
          .then((selection) => {
            if (selection === "重试") {
              updateConfig(flag);
            }
          });
        throw error;
      });
  }

  if (flag === "all") {
    // 获取 EVO 可用权限
    await getEVOPermissions()
      .then((response) => {
        if (response.status === 200) {
          CONFIG.evoPermissions = response.data?.data;
          CONFIG.evoPermissions.allow_packages =
            CONFIG.evoPermissions.allow_packages.split("|");
        }
      })
      .catch((error) => {
        console.error("Error fetching EVO permissions:", error);
        throw error;
      });

    // 获取计划列表
    await getPlanList()
      .then((response) => {
        if (response.status === 200) {
          if (CONFIG.evoPermissions.allow_packages) {
            CONFIG.planList = response.data?.data.filter((plan: any) =>
              CONFIG.evoPermissions.allow_packages.includes(plan.id.toString())
            );
          } else {
            CONFIG.planList = response.data?.data;
          }
          CONFIG.planList.forEach((plan: any) => {
            plan.os = Object.values(plan.os).flatMap((group: any) => group.os);
          });
        }
      })
      .catch((error) => {
        console.error("Error fetching plan list:", error);
        throw error;
      });

    // 获取 SSH Key 列表
    await getSSHKeyList()
      .then((response) => {
        if (response.status === 200) {
          CONFIG.sshKeyList = response.data?.data;
          if (CONFIG.sshKeyList.length > 0) {
            CONFIG.sshKeyList.forEach((sshKey: any) => {
              sshKey.created_at = convertUTC1ToLocalTime(
                sshKey.created_at
              ).toLocaleString();
            });
          }
        }
      })
      .catch((error) => {
        console.error("Error fetching SSH Key list:", error);
        throw error;
      });
  }

  if (flag === "defaultPlan") {
    // 获取默认配置
    const defaultPlan = vscode.workspace
      .getConfiguration(ALICE_ID)
      .get("plan") as Plan;
    if (defaultPlan) {
      DEFAULT_PLAN.id = defaultPlan.id;
      DEFAULT_PLAN.os = defaultPlan.os;
      DEFAULT_PLAN.time = defaultPlan.time;
      DEFAULT_PLAN.sshKey = defaultPlan.sshKey;
    }
  }

  // 更新状态栏
  updateStatusBar();
}

// --- 函数：更新状态栏 ---
async function updateStatusBar() {
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
      vscode.window.showErrorMessage(`实例 ${instance.id} 已被删除！`);
      updateConfig("instance");
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

// --- 函数：显示添加 Api Token 的菜单 ---
async function showAddApiTokenMenu() {
  const apiToken = await vscode.window.showInputBox({
    title: "请输入 API Token",
    placeHolder: "API Token",
    prompt: "请在 https://app.alice.ws/ephemera/console 中获取",
    ignoreFocusOut: true,
  });
  if (apiToken) {
    await vscode.workspace
      .getConfiguration(ALICE_ID)
      .update("apiToken", apiToken, true);
    vscode.window.showInformationMessage("API Token 设置成功");
    // 重新加载配置
    updateConfig();
  }
}

// --- 函数：显示创建实例的 Quick Pick 菜单 ---
async function showCreateInstanceMenu() {
  let default_detail = "暂无默认配置，点击添加";
  const default_plan = CONFIG.planList.find(
    (plan: any) => plan.id.toString() === DEFAULT_PLAN.id
  );

  if (default_plan) {
    const default_os = default_plan.os.find(
      (os: any) => os.id.toString() === DEFAULT_PLAN.os
    );
    const default_sshKey = CONFIG.sshKeyList.find(
      (sshKey: any) => sshKey.id.toString() === DEFAULT_PLAN.sshKey
    );
    default_detail = `计划: ${default_plan?.name || ""} | 系统: ${
      default_os?.name || ""
    } | 时间: ${DEFAULT_PLAN.time || ""}小时 | SSH Key: ${
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
          createInstance(plan.id, plan.os, plan.time, plan.sshKey)
            .then(() => {
              vscode.window.showInformationMessage("实例创建成功");
              updateConfig("instance");
            })
            .catch((err) => {
              vscode.window.showErrorMessage(`实例创建失败: ${err}`);
            });
        }
        break;
      }
      case `$(plus) 以默认配置创建`: {
        if (default_plan) {
          createInstance(
            DEFAULT_PLAN.id,
            DEFAULT_PLAN.os,
            DEFAULT_PLAN.time,
            DEFAULT_PLAN.sshKey
          )
            .then(() => {
              vscode.window.showInformationMessage("实例创建成功");
              updateConfig("instance");
            })
            .catch((err) => {
              vscode.window.showErrorMessage(`实例创建失败: ${err}`);
            });
        } else {
          const { status, plan } = await createInstanceMultiStep();
          // 更新默认配置
          if (status === "completed" && plan) {
            await vscode.workspace
              .getConfiguration(ALICE_ID)
              .update("plan", plan, true);
            vscode.window.showInformationMessage("默认配置创建成功");
            updateConfig("defaultPlan");
          }
        }
        break;
      }
      case `$(edit) 编辑默认配置`: {
        const { status, plan } = await createInstanceMultiStep(DEFAULT_PLAN);
        // 更新默认配置
        if (status === "completed" && plan) {
          await vscode.workspace
            .getConfiguration(ALICE_ID)
            .update("plan", plan, true);
          vscode.window.showInformationMessage("默认配置更新成功");
          updateConfig("defaultPlan");
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

// --- 函数：显示控制实例的 Quick Pick 菜单 ---
async function showControlInstanceMenu(instanceList: any[]) {
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

// --- 函数：打开设置 ---
async function openSettings() {
  vscode.commands.executeCommand("workbench.action.openSettings", ALICE_ID);
}

// --- 函数：延长时间 ---
async function renewalInstanceItems(instanceId: string) {
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
    renewalInstance(instanceId, time)
      .then(() => {
        vscode.window.showInformationMessage("实例延长时间成功");
        updateConfig("instance");
      })
      .catch((err) => {
        vscode.window.showErrorMessage(`实例延长时间失败: ${err}`);
      });
  }
}

// --- 函数：删除实例 ---
async function deleteInstanceItems(instanceId: string) {
  const confirm = await vscode.window.showWarningMessage(
    `确定要删除实例 ${instanceId} 吗？`,
    { modal: true },
    "删除"
  );
  if (confirm === "删除") {
    deleteInstance(instanceId)
      .then(() => {
        vscode.window.showInformationMessage("实例删除成功");
        updateConfig("instance");
      })
      .catch((err) => {
        vscode.window.showErrorMessage(`实例删除失败: ${err}`);
      });
  }
}

// --- 函数：重装系统 ---
async function rebulidInstanceItems(instanceId: string, planId: string) {
  const osItems: vscode.QuickPickItem[] = CONFIG.planList
    .find((plan: any) => plan.id.toString() === planId)
    ?.os.map((os: any) => ({
      label: os.name,
      description: os.id.toString(),
      detail: " ",
    }));

  const selectedOS = await vscode.window.showQuickPick(osItems, {
    title: "选择 OS",
    placeHolder: "请选择要安装的 OS",
  });
  if (selectedOS) {
    const osId = selectedOS?.description as string;
    const sshKeyItems: vscode.QuickPickItem[] = CONFIG.sshKeyList.map(
      (sshKey: any) => ({
        label: sshKey.name,
        description: sshKey.id.toString(),
        detail: `创建于${sshKey.created_at}`,
      })
    );
    sshKeyItems.push({ label: "不使用 SSH Key", description: "" });
    // 显示 SSH Key 列表
    const selectedSSHKey = await vscode.window.showQuickPick(sshKeyItems, {
      title: "选择 SSH Key (可选)",
      placeHolder: "请选择要使用的 SSH Key (可选)",
    });
    rebulidInstance(instanceId, osId, selectedSSHKey?.description)
      .then(() => {
        vscode.window.showInformationMessage("实例重装成功");
        updateConfig("instance");
      })
      .catch((err) => {
        vscode.window.showErrorMessage(`实例重装失败: ${err}`);
      });
  }
}

// --- 函数：控制实例电源 ---
async function powerInstanceItems(instanceId: string) {
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

    powerInstance(instanceId, action)
      .then(() => {
        vscode.window.showInformationMessage(`实例${selectedPower.label}成功`);
        updateConfig("instance");
      })
      .catch((err) => {
        vscode.window.showErrorMessage(
          `实例${selectedPower.label}失败: ${err}`
        );
      });
  }
}

// --- 定义步骤枚举 ---
enum CreateInstanceStep {
  SelectPlan,
  SelectOS,
  EnterTime,
  SelectSSHKey,
  Done,
  Cancelled,
}

// --- 定义返回状态和结果的类型 ---
type CreateInstanceResult = {
  status: "completed" | "cancelled" | "error"; // 添加 'error' 状态
  plan: Plan | null;
  message?: string; // 可选的错误信息
};

// --- “返回”按钮的定义 ---
const backItem: vscode.QuickPickItem = {
  label: "$(arrow-left) 返回上一级",
  detail: " ",
};

// --- 新的可返回的多层 Quick Pick 函数 ---
async function createInstanceMultiStep(
  default_plan?: Plan
): Promise<CreateInstanceResult> {
  const plan: Plan = default_plan || {
    id: "",
    os: "",
    time: "",
    sshKey: "",
  };

  let currentStep: CreateInstanceStep = CreateInstanceStep.SelectPlan;
  let errorMessage: string | undefined = undefined; // 用于存储验证错误信息

  // 使用 Promise 包装整个过程，以便正确处理异步和取消
  return new Promise<CreateInstanceResult>((resolve) => {
    const quickPick = vscode.window.createQuickPick<vscode.QuickPickItem>();
    quickPick.ignoreFocusOut = true; // 防止鼠标点击外部时自动关闭 (重要!)
    quickPick.totalSteps = 4; // 总共有4个用户交互步骤

    let isCompleted = false; // 标记是否是正常完成而非取消

    // --- 核心函数：更新 Quick Pick 的视图 ---
    const updateView = () => {
      quickPick.step = currentStep + 1; // QuickPick step 从 1 开始
      errorMessage = undefined; // 清除错误，避免下次显示
      quickPick.value = ""; // 清除可能残留的输入值
      quickPick.items = []; // 先清空

      const items: vscode.QuickPickItem[] = [];

      // 根据当前步骤设置标题、占位符和选项
      switch (currentStep) {
        case CreateInstanceStep.SelectPlan:
          quickPick.title = "第 1 步: 选择 Plan";
          quickPick.placeholder = "请选择要创建的 Plan";
          quickPick.items = CONFIG.planList.map((p) => ({
            label: p.name,
            description: p.id.toString(),
            detail: `CPU: ${p.cpu} 核, 内存: ${p.memory / 1024} GB, 硬盘: ${
              p.disk
            } GB`,
          }));
          break;

        case CreateInstanceStep.SelectOS:
          quickPick.title = "第 2 步: 选择 OS";
          quickPick.placeholder = "请选择要安装的 OS";
          const selectedPlanConfig = CONFIG.planList.find(
            (p) => p.id.toString() === plan.id
          );
          if (!selectedPlanConfig || !selectedPlanConfig.os) {
            // 错误处理：如果找不到Plan或OS列表
            resolve({
              status: "error",
              plan: null,
              message: `未能找到 Plan ID 为 ${plan.id} 的 OS 列表。`,
            });
            quickPick.hide();
            return; // 提前退出 updateView
          }
          items.push(backItem); // 添加返回按钮
          items.push(
            ...selectedPlanConfig.os.map((o: any) => ({
              label: o.name,
              description: o.id.toString(),
              detail: " ",
            }))
          );
          quickPick.items = items;
          break;

        case CreateInstanceStep.EnterTime:
          quickPick.title = `第 3 步: 输入时长 (小时, 最长 ${CONFIG.evoPermissions.max_time})`;
          quickPick.placeholder = `请输入 1 到 ${CONFIG.evoPermissions.max_time} 之间的整数`;
          // 在输入步骤，通常只显示返回按钮（如果有）
          items.push(backItem);
          quickPick.items = items;
          quickPick.value = plan.time || ""; // 如果之前有值，可以回填
          break;

        case CreateInstanceStep.SelectSSHKey:
          quickPick.title = "第 4 步: 选择 SSH Key (可选)";
          quickPick.placeholder = "请选择要使用的 SSH Key，或选择不使用";
          items.push(backItem); // 添加返回按钮
          items.push(
            ...CONFIG.sshKeyList.map((key) => ({
              label: key.name,
              description: key.id.toString(),
              detail: `创建于 ${key.created_at}`,
            }))
          );
          items.push({ label: "不使用 SSH Key", detail: " " }); // 添加不使用选项
          quickPick.items = items;
          break;
      }
      quickPick.show(); // 显示 Quick Pick
    };

    // --- 处理用户接受选择或输入 ---
    quickPick.onDidAccept(async () => {
      const selection = quickPick.selectedItems[0];
      const value = quickPick.value; // 获取输入框的值

      // 处理返回按钮
      if (selection === backItem) {
        if (currentStep > CreateInstanceStep.SelectPlan) {
          currentStep--;
          updateView();
        }
        return;
      }

      // 处理各个步骤的逻辑
      switch (currentStep) {
        case CreateInstanceStep.SelectPlan:
          if (selection?.description) {
            plan.id = selection.description;
            currentStep = CreateInstanceStep.SelectOS;
            updateView();
          }
          // 如果没选或选了无效的，QuickPick 会保持打开状态
          break;

        case CreateInstanceStep.SelectOS:
          if (selection?.description) {
            plan.os = selection.description;
            currentStep = CreateInstanceStep.EnterTime;
            updateView();
          }
          break;

        case CreateInstanceStep.EnterTime:
          // 验证输入的时间
          const timeValue = value.trim();
          const timeNum = parseInt(timeValue, 10);
          if (isNaN(timeNum) || timeNum <= 0) {
            errorMessage = "请输入有效的正整数时间";
          } else if (timeNum !== parseFloat(timeValue)) {
            errorMessage = "请输入整数，不支持小数";
          } else if (timeNum > CONFIG.evoPermissions.max_time) {
            errorMessage = `时长不能超过 ${CONFIG.evoPermissions.max_time} 小时`;
          } else {
            plan.time = timeNum.toString();
            currentStep = CreateInstanceStep.SelectSSHKey;
            updateView(); // 验证通过，进入下一步
            return; // 成功，跳出 onDidAccept
          }
          // 验证失败，显示错误信息并重新显示当前视图
          updateView();
          break; // 让用户重新输入

        case CreateInstanceStep.SelectSSHKey:
          // selectedItems[0] 可能不存在 (如果用户直接按 Enter 但没选)
          // description 可能为 '' (选择了 "不使用 SSH Key")
          if (selection) {
            plan.sshKey = selection.description ?? ""; // 使用 ?? 处理 undefined
            // 这是最后一步，标记完成并解决 Promise
            isCompleted = true;
            resolve({ status: "completed", plan: plan });
            quickPick.hide(); // 关闭 Quick Pick
          }
          break;
      }
    });

    // --- 处理 Quick Pick 被隐藏的事件 (ESC, 点击外部, 或调用 hide()) ---
    quickPick.onDidHide(() => {
      // 只有在不是正常完成的情况下，才认为是取消
      if (!isCompleted) {
        resolve({ status: "cancelled", plan: null });
      }
      // 无论如何，都要释放资源
      quickPick.dispose();
      console.log("Multi-step Quick Pick disposed.");
    });

    // --- 初始化视图 ---
    updateView();
  });
}
