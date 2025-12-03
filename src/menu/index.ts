import * as vscode from "vscode";
import { aliceApi } from "../alice/api";
import {
  Plan,
  ALICE_ID,
  CONFIG,
  updateStateConfig,
  InstanceState,
} from "../alice/config";
import {
  createInstanceMultiStep,
  rebulidInstanceMultiStep,
} from "./instanceMultiStep";
import {
  updateConfig,
  openSettings,
  updateStatusBar,
  aliceService,
} from "../commands";
import { convertTimezoneToLocal } from "../utils/time";
import { showRemoteConnectMenu } from "./remoteConnect";
import { getBootScriptContent } from "../utils/getScript";
import {
  addLogEntry,
  getLogEntriesForInstance,
  LogEntry,
  readLogFile,
  updateLogEntry,
} from "../script/bootScriptLog";

/**
 * 显示身份验证密钥输入框
 */
export async function showAddAuthKeyMenu() {
  const clientId = await vscode.window.showInputBox({
    title: "请输入 Client ID",
    placeHolder: "Client ID",
    prompt: "在 https://app.alice.ws/api-secrets 中获取",
    ignoreFocusOut: true,
  });

  if (!clientId) {
    return;
  }

  const secret = await vscode.window.showInputBox({
    title: "请输入 Secret",
    placeHolder: "Secret",
    prompt: "在 https://app.alice.ws/api-secrets 中获取",
    ignoreFocusOut: true,
  });

  if (clientId && secret) {
    await vscode.workspace
      .getConfiguration(ALICE_ID)
      .update("clientId", clientId, true);
    await vscode.workspace
      .getConfiguration(ALICE_ID)
      .update("secret", secret, true);
    vscode.window.showInformationMessage("Client ID/Secret 设置成功");
    // 重新加载配置
    // 调用 updateConfig 函数，该函数将负责更新状态并触发状态栏更新
    await updateConfig();
  }
  vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup");
}

/**
 * 无实例时显示的 Quick Pick 菜单
 */
export async function showCreateInstanceMenu() {
  let default_detail = "暂无默认配置，点击添加";
  const default_plan_config = CONFIG.planList.find(
    (plan: any) => plan.id === CONFIG.defaultPlan.id
  );

  if (default_plan_config) {
    const default_os = default_plan_config.os.find(
      (os: any) => os.id === CONFIG.defaultPlan.os
    );
    const default_sshKey = CONFIG.sshKeyList.find(
      (sshKey: any) => sshKey.id === CONFIG.defaultPlan.sshKey
    );
    default_detail = `计划: ${default_plan_config?.name || ""} | 系统: ${
      default_os?.name || ""
    } | 时间: ${CONFIG.defaultPlan.time || ""}小时 | SSH Key: ${
      default_sshKey?.name || "不使用"
    } | 脚本: ${CONFIG.defaultPlan.bootScript || "不使用"}`;
  }

  // 创建 Quick Pick Item
  let autoConnectLabel = "";
  switch (CONFIG.autoConnectInstance) {
    case "true":
      autoConnectLabel = "在当前窗口连接到实例";
      break;
    case "new":
      autoConnectLabel = "在新窗口连接到实例";
      break;
    case "false":
    default:
      autoConnectLabel = "不自动连接实例";
      break;
  }
  const createItems: vscode.QuickPickItem[] = [
    {
      label: `$(refresh) 刷新配置`,
      detail: CONFIG.hasEvoPermission
        ? "已创建实例,点击刷新配置"
        : "重新检查 EVO 权限",
    },
    {
      label: `$(plus) 创建实例`,
      detail: "创建新的实例",
    },
    {
      label: `$(star) 以默认配置创建`,
      detail: default_detail,
    },
    {
      label: `$(edit) 编辑默认配置`,
      detail: "点击编辑默认配置",
    },
    {
      label: `$(remote) 远程连接配置`,
      detail: `${autoConnectLabel} | ${
        CONFIG.autoConnectInstanceHost || `未配置 Host 别名`
      }`,
    },
    {
      label: `$(book) 脚本管理`,
      detail: "管理启动脚本",
    },
    {
      label: `$(settings) 打开设置`,
      detail: "配置 Client ID/Secret 和实例默认配置",
    },
  ];
  const selectedItem = await vscode.window.showQuickPick(createItems, {
    title: "Alice Ephemera",
    placeHolder: "请选择要执行的操作",
  });

  if (!selectedItem) {
    return;
  }

  switch (selectedItem.label) {
    case `$(refresh) 刷新配置`:
      await updateConfig(); // 刷新配置
      break;
    case `$(plus) 创建实例`: {
      const { status, plan } = await createInstanceMultiStep();
      if (status === "completed" && plan) {
        createInstance(plan);
      }
      break;
    }
    case `$(star) 以默认配置创建`: {
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
          await updateConfig("defaultPlan"); // 更新默认计划状态
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
        await updateConfig("defaultPlan"); // 更新默认计划状态
        vscode.window.showInformationMessage("默认配置更新成功");
      }
      break;
    }
    case `$(book) 脚本管理`:
      vscode.commands.executeCommand("aliceephemera.bootScript");
      break;
    case `$(remote) 远程连接配置`:
      await showRemoteConnectMenu();
      break;
    case `$(settings) 打开设置`:
      openSettings();
      break;
  }
}

/**
 * 创建实例
 * @param plan - 实例规格
 */
async function createInstance(plan: Plan) {
  if (plan) {
    const bootScriptContent = await getBootScriptContent(plan.bootScript);

    aliceApi
      .createInstance(
        plan.id,
        plan.os,
        plan.time,
        plan.sshKey || undefined,
        bootScriptContent
      )
      .then(async (response) => {
        const instance = response.data?.data;
        const bootScriptUid = instance.boot_script_uid;

        instance.creation_at = convertTimezoneToLocal(instance.creation_at);
        instance.expiration_at = convertTimezoneToLocal(instance.expiration_at);
        updateStateConfig({ instanceList: [instance] });

        await addLogEntry(instance.id, "创建", plan.bootScript, bootScriptUid);

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `正在创建实例 ${instance.id}...`,
            cancellable: false,
          },
          async (progress) => {
            let attempts = 0;
            const maxAttempts = 60; // 假设最多尝试60次，每次间隔2秒，总共2分钟
            const delay = (ms: number) =>
              new Promise((res) => setTimeout(res, ms));
            await delay(2000); // 等待2秒
            // 轮询实例状态，直到状态为 'running'
            let instanceState = await aliceService.getInstanceState(
              instance.id
            );

            while (
              instanceState?.state?.state !== "running" &&
              attempts < maxAttempts
            ) {
              await delay(2000); // 等待2秒
              instanceState = await aliceService.getInstanceState(instance.id);
              attempts++;
            }
            // 实例创建完成
            progress.report({ message: "实例创建成功" });
            await delay(1000);

            // 如果有启动脚本，则开始轮询脚本结果
            if (bootScriptUid && plan.bootScript) {
              progress.report({
                message: `正在执行启动脚本 ${plan.bootScript}...`,
              });
              await pollBootScriptResult(
                instance.id,
                bootScriptUid,
                plan.bootScript
              );
            }
          }
        );

        await updateConfig("instance"); // 更新实例列表

        if (CONFIG.autoConnectInstance !== "false") {
          autoConnectInstance(); // 自动连接实例
        } else if (!bootScriptUid) {
          // 只有在没有启动脚本时才显示这个简单的成功消息
          vscode.window.showInformationMessage("实例创建成功");
        }
      })
      .catch((err) => {
        vscode.window.showErrorMessage(`实例创建失败: ${err}`);
      });
  }
}

async function autoConnectInstance() {
  const autoConnect = CONFIG.autoConnectInstance;
  const instance = CONFIG.instanceList;

  if (autoConnect !== "false" && instance) {
    let commands = "opensshremotes.openEmptyWindowInCurrentWindow";
    if (autoConnect === "new") {
      commands = "opensshremotes.openEmptyWindow";
    }
    const autoConnectHost = CONFIG.autoConnectInstanceHost.trim() || "";

    if (autoConnectHost) {
      vscode.commands.executeCommand(commands, {
        host: autoConnectHost,
      });
    } else {
      vscode.window.showErrorMessage(
        `未配置 ssh config，请自行配置后填写设置中的 Host 别名`
      );
    }
  }
}

/**
 * 有实例时显示控制实例的 Quick Pick 菜单
 * @param instanceList - 实例列表
 */
export async function showControlInstanceMenu(instanceList: any[]) {
  const instanceState = CONFIG.instanceState;
  const autoConnectHost = CONFIG.autoConnectInstanceHost.trim() || "";
  const items: vscode.QuickPickItem[] = [
    {
      label: `$(refresh) 刷新状态`,
      detail: `状态: ${instanceState?.state?.state || "未知"} | cpu: ${
        instanceState?.state?.cpu
      }% | 可用内存: ${instanceState?.state?.memory?.memavailable} | 总流量: ${
        instanceState?.state?.traffic?.total
      }↑↓ GB`,
    },
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
      label: `$(book) 脚本管理`,
      detail: "管理启动脚本",
    },
    {
      label: `$(settings) 打开设置`,
      detail: "配置 Client ID/Secret 和实例默认配置",
    },
  ];

  if (autoConnectHost) {
    items.splice(1, 0, {
      label: `$(remote) 远程连接`,
      detail: `远程连接到当前实例 (${autoConnectHost})`,
    });
  }

  // 检查是否有脚本执行历史
  const instanceId = instanceList[0].id.toString();
  const scriptHistory = await getLogEntriesForInstance(instanceId);
  if (scriptHistory.length > 0) {
    items.splice(6, 0, {
      label: `$(history) 查看脚本执行历史`,
      detail: "查看此实例的启动脚本执行记录",
    });
  }

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
    const instanceId = instanceList[0].id;
    const instancePlanId = instanceList[0].plan_id;
    switch (selectedItem.label) {
      case `$(refresh) 刷新状态`:
        await updateConfig("instance");
        break;
      case `$(remote) 远程连接`:
        // 远程连接到当前实例
        autoConnectInstance();
        break;
      case `$(trash) 删除实例`:
        await deleteInstanceItems(instanceId);
        break;
      case `$(clock) 延长时间`:
        await renewalInstanceItems(instanceId);
        break;
      case `$(sync) 重装系统`:
        await rebulidInstanceItems(instanceId, instancePlanId);
        break;
      case `$(plug) 控制电源`:
        await powerInstanceItems(instanceId);
        break;
      case `$(history) 查看脚本执行历史`:
        await showScriptHistoryMenu(instanceId);
        break;
      case `$(book) 脚本管理`:
        vscode.commands.executeCommand("aliceephemera.bootScript");
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
export async function renewalInstanceItems(instanceId: number) {
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
      .renewalInstance(instanceId, Number(time))
      .then(async (response) => {
        if (response.data?.code === 200) {
          await updateConfig("instance");
          vscode.window.showInformationMessage("实例延长时间成功");
        }
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
async function deleteInstanceItems(instanceId: number) {
  const confirm = await vscode.window.showWarningMessage(
    `确定要删除实例 ${instanceId} 吗？`,
    { modal: true },
    "删除"
  );
  if (confirm === "删除") {
    aliceApi
      .deleteInstance(instanceId)
      .then(async (response) => {
        if (response.data?.code === 200) {
          await updateConfig("instance");
          vscode.window.showInformationMessage("实例删除成功");
          clearInterval(CONFIG.updateStatusBarInterval); // 停止状态栏更新
          updateStateConfig({
            instanceList: [],
            instanceState: {} as InstanceState,
            doNotRemindExpiration: false,
            updateStatusBarInterval: null,
          }); // 重置
        }
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
export async function rebulidInstanceItems(instanceId: number, planId: number) {
  const { status, rebulidInfo } = await rebulidInstanceMultiStep(planId);
  if (status === "completed" && rebulidInfo) {
    const bootScriptContent = await getBootScriptContent(
      rebulidInfo.bootScript
    );

    aliceApi
      .rebulidInstance(
        instanceId,
        rebulidInfo.os,
        rebulidInfo.sshKey || undefined,
        bootScriptContent
      )
      .then(async (response) => {
        if (response.data?.code === 200) {
          const bootScriptUid = response.data?.data.boot_script_uid;
          await addLogEntry(
            instanceId,
            "重装",
            rebulidInfo.bootScript,
            bootScriptUid
          );
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `正在重装实例 ${instanceId}...`,
              cancellable: false,
            },
            async (progress) => {
              let attempts = 0;
              const maxAttempts = 60; // 假设最多尝试60次，每次间隔2秒，总共2分钟
              const delay = (ms: number) =>
                new Promise((res) => setTimeout(res, ms));
              await delay(2000); // 等待2秒
              let instanceState = await aliceService.getInstanceState(
                instanceId
              );

              while (
                instanceState?.state?.state !== "running" &&
                attempts < maxAttempts
              ) {
                await delay(2000); // 等待2秒
                instanceState = await aliceService.getInstanceState(instanceId);
                attempts++;
              }
              progress.report({ message: "实例重装成功" });
              await delay(1000);

              if (bootScriptUid && rebulidInfo.bootScript) {
                progress.report({
                  message: `正在执行启动脚本 ${rebulidInfo.bootScript}...`,
                });
                await pollBootScriptResult(
                  instanceId,
                  bootScriptUid,
                  rebulidInfo.bootScript
                );
              }
            }
          );

          await updateConfig("instance"); // 重装成功后更新实例列表

          if (CONFIG.autoConnectInstance !== "false") {
            autoConnectInstance(); // 自动连接实例
          } else if (!bootScriptUid) {
            vscode.window.showInformationMessage("实例重装成功");
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
export async function powerInstanceItems(instanceId: number) {
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
    let state: "running" | "stopped" = "stopped";
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
      .then(async (response) => {
        if (response.data?.code === 200) {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `正在执行 ${selectedPower.label} 操作...`,
              cancellable: false,
            },
            async (progress) => {
              let instanceState = await aliceService.getInstanceState(
                instanceId
              );
              let attempts = 0;
              const maxAttempts = 60; // 假设最多尝试60次，每次间隔2秒，总共2分钟
              const delay = (ms: number) =>
                new Promise((res) => setTimeout(res, ms));

              if (action === "boot" || action === "restart") {
                state = "running";
              }

              while (
                instanceState?.state?.state !== state &&
                attempts < maxAttempts
              ) {
                await delay(2000); // 等待2秒
                instanceState = await aliceService.getInstanceState(instanceId);
                attempts++;
              }
            }
          );
        }
        vscode.window.showInformationMessage(`实例${selectedPower.label}成功`);
        updateStatusBar(); // 更新状态栏
      })
      .catch((err) => {
        vscode.window.showErrorMessage(
          `实例${selectedPower.label}失败: ${err}`
        );
      });
  }
}

/**
 * 轮询启动脚本的执行结果
 * @param instanceId 实例 ID
 * @param commandUid 命令 ID
 * @param scriptName 脚本名称
 */
async function pollBootScriptResult(
  instanceId: number,
  commandUid: string,
  scriptName: string
) {
  const maxAttempts = 180; // 最多尝试 180 次，每次 5 秒，总共 15 分钟
  let attempts = 0;
  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

  while (attempts < maxAttempts) {
    try {
      const response = await aliceApi.getCommandResult(instanceId, commandUid);
      if (response.status === 200 && response.data?.data?.output) {
        const output = response.data.data.output;
        await updateLogEntry(commandUid, "completed", output);
        const selection = await vscode.window.showInformationMessage(
          `脚本 ${scriptName} 执行成功`,
          { modal: true },
          "查看执行结果"
        );
        if (selection === "查看执行结果") {
          vscode.commands.executeCommand("alice.showScriptResult", commandUid);
        }
        return; // 成功，退出轮询
      }
    } catch (error: any) {
      // 202 表示还在执行中，忽略
      if (error.response?.status !== 202) {
        console.error("Error fetching command result:", error);
        const errorMessage = `获取结果失败: ${
          error.response?.data?.message || error.message
        }`;
        await updateLogEntry(commandUid, "failed", errorMessage);
        vscode.window.showErrorMessage(
          `脚本 ${scriptName} 执行失败: ${errorMessage}`
        );
        return;
      }
    }
    attempts++;
    await delay(5000); // 等待 5 秒
  }

  // 超时
  await updateLogEntry(commandUid, "failed", "获取结果超时");
  vscode.window.showWarningMessage(`脚本 ${scriptName} 执行结果获取超时`);
}

/**
 * 显示脚本执行历史菜单
 * @param instanceId 实例 ID
 */
async function showScriptHistoryMenu(instanceId: number) {
  const history = await getLogEntriesForInstance(instanceId);
  if (history.length === 0) {
    vscode.window.showInformationMessage("该实例没有脚本执行历史记录。");
    return;
  }

  const items: (vscode.QuickPickItem & { logId: string })[] = history.map(
    (log) => ({
      label: log.scriptName,
      description: `${log.operation} - ${log.status}`,
      detail: log.dateTime,
      logId: log.id,
    })
  );

  const selected = await vscode.window.showQuickPick(items, {
    title: "脚本执行历史",
    placeHolder: "选择一个记录查看详细结果",
  });

  if (selected) {
    vscode.commands.executeCommand("alice.showScriptResult", selected.logId);
  }
}
