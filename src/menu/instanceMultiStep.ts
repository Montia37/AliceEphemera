import * as vscode from "vscode";
import * as fs from "fs";
import { Plan, RebuildInfo, CONFIG } from "../alice/config"; // 引入配置文件
import { getScriptList } from "../utils/getScript";
import { updateConfig } from "../commands";

/**
 * 创建实例的状态机
 */
enum CreateInstanceStep {
  SelectPlan,
  SelectOS,
  EnterTime,
  SelectSSHKey,
  SelectBootScript,
  Done,
  Cancelled,
}

/**
 * 重建实例的状态机
 */
enum RebulidInstanceStep {
  SelectOS,
  SelectSSHKey,
  SelectBootScript,
  Done,
  Cancelled,
}

/**
 * 创建实例的结果类型
 */
type CreateInstanceResult = {
  status: "completed" | "cancelled" | "error";
  plan: Plan | null;
  message?: string; // 可选的错误信息
};

/**
 * 重建实例的结果类型
 */
type RebuildInstanceResult = {
  status: "completed" | "cancelled" | "error";
  rebulidInfo: RebuildInfo | null;
  message?: string; // 可选的错误信息
};

/**
 * 返回上一级的按钮
 */
const backItem: vscode.QuickPickItem = {
  label: "$(arrow-left) 返回上一级",
  detail: " ",
};

/**
 * 创建实例的多步骤交互
 * @param default_plan 默认的配置（可选）
 */
export async function createInstanceMultiStep(
  default_plan?: Plan
): Promise<CreateInstanceResult> {
  // 检查是否有 EVO 权限
  if (!CONFIG.hasEvoPermission) {
    const selection = await vscode.window.showErrorMessage(
      "您的账户似乎没有 EVO Cloud 权限,无法创建实例。",
      { modal: true },
      "重新检查权限"
    );

    if (selection === "重新检查权限") {
      await updateConfig();
    }

    return {
      status: "error",
      plan: null,
      message: "没有 EVO 权限",
    };
  }

  // 检查是否有可用的 Plan
  if (!CONFIG.planList || CONFIG.planList.length === 0) {
    const selection = await vscode.window.showErrorMessage(
      "没有可用的 Plan,请检查 EVO 权限或刷新配置。",
      { modal: true },
      "重新检查权限"
    );

    if (selection === "重新检查权限") {
      await updateConfig();
    }

    return {
      status: "error",
      plan: null,
      message: "没有可用的 Plan",
    };
  }

  const plan: Plan = default_plan || {
    id: NaN,
    os: NaN,
    time: NaN,
    sshKey: NaN,
    bootScript: "",
  };

  let currentStep: CreateInstanceStep = CreateInstanceStep.SelectPlan;
  let errorMessage: string | undefined = undefined; // 用于存储验证错误信息

  // 使用 Promise 包装整个过程，以便正确处理异步和取消
  return new Promise<CreateInstanceResult>((resolve) => {
    const quickPick = vscode.window.createQuickPick<vscode.QuickPickItem>();
    quickPick.ignoreFocusOut = true; // 防止鼠标点击外部时自动关闭 (重要!)
    quickPick.totalSteps = 5; // 总共有5个用户交互步骤

    let isCompleted = false; // 标记是否是正常完成而非取消

    // --- 核心函数：更新 Quick Pick 的视图 ---
    const updateView = async () => {
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
          quickPick.items = CONFIG.planList.map((p: any) => ({
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
            (p: any) => p.id === plan.id
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

          // 修复：确保 os 是数组，并且有数据
          const osList = Array.isArray(selectedPlanConfig.os)
            ? selectedPlanConfig.os
            : [];

          if (osList.length === 0) {
            resolve({
              status: "error",
              plan: null,
              message: `Plan ID ${plan.id} 没有可用的操作系统。`,
            });
            quickPick.hide();
            return;
          }

          items.push(
            ...osList.map((o: any) => ({
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
          quickPick.value = plan.time ? plan.time.toString() : ""; // 如果之前有值，可以回填
          break;

        case CreateInstanceStep.SelectSSHKey:
          quickPick.title = "第 4 步: 选择 SSH Key (可选)";
          quickPick.placeholder = "请选择要使用的 SSH Key，或选择不使用";
          items.push(backItem); // 添加返回按钮
          items.push({ label: "不使用 SSH Key", detail: " " }); // 添加不使用选项
          items.push(
            ...CONFIG.sshKeyList.map((key: any) => ({
              label: key.name,
              description: key.id.toString(),
              detail: `创建于 ${key.created_at}`,
            }))
          );
          quickPick.items = items;
          break;

        case CreateInstanceStep.SelectBootScript:
          quickPick.title = "第 5 步: 选择启动脚本 (可选)";
          quickPick.placeholder = "请选择要使用的启动脚本，或选择不使用";
          items.push(backItem); // 添加返回按钮
          items.push({ label: "不使用启动脚本", detail: " " }); // 添加不使用选项
          if (CONFIG.bootScriptPath && fs.existsSync(CONFIG.bootScriptPath)) {
            const scripts: vscode.QuickPickItem[] = await getScriptList(
              CONFIG.bootScriptPath
            );
            items.push(...scripts);
          }
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
            plan.id = Number(selection.description);
            currentStep = CreateInstanceStep.SelectOS;
            updateView();
          }
          // 如果没选或选了无效的，QuickPick 会保持打开状态
          break;

        case CreateInstanceStep.SelectOS:
          if (selection?.description) {
            plan.os = Number(selection.description);
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
            plan.time = timeNum;
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
            plan.sshKey = Number(selection.description) || NaN; // 使用 ?? 处理 undefined
            currentStep = CreateInstanceStep.SelectBootScript;
            updateView();
          }
          break;

        case CreateInstanceStep.SelectBootScript:
          if (selection) {
            // 如果选择“不使用启动脚本”，则 bootScript 为空，否则为脚本文件名
            plan.bootScript =
              selection.label === "不使用启动脚本" ? "" : selection.label;
            isCompleted = true;
            resolve({ status: "completed", plan: plan });
            quickPick.hide();
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
/**
 * 创建实例的多步骤交互
 * @param rebulidInfo 重建实例的信息
 */
export async function rebulidInstanceMultiStep(
  planId: number
): Promise<RebuildInstanceResult> {
  const rebulidInfo: RebuildInfo = {
    planId: planId,
    os: NaN,
    sshKey: NaN,
    bootScript: "",
  };
  let currentStep: RebulidInstanceStep = RebulidInstanceStep.SelectOS;
  let errorMessage: string | undefined = undefined; // 用于存储验证错误信息

  // 使用 Promise 包装整个过程，以便正确处理异步和取消
  return new Promise<RebuildInstanceResult>((resolve) => {
    const quickPick = vscode.window.createQuickPick<vscode.QuickPickItem>();
    quickPick.ignoreFocusOut = true; // 防止鼠标点击外部时自动关闭 (重要!)
    quickPick.totalSteps = 3; // 总共有3个用户交互步骤

    let isCompleted = false; // 标记是否是正常完成而非取消

    // --- 核心函数：更新 Quick Pick 的视图 ---
    const updateView = async () => {
      quickPick.step = currentStep + 1; // QuickPick step 从 1 开始
      errorMessage = undefined; // 清除错误，避免下次显示
      quickPick.value = ""; // 清除可能残留的输入值
      quickPick.items = []; // 先清空

      const items: vscode.QuickPickItem[] = [];

      // 根据当前步骤设置标题、占位符和选项
      switch (currentStep) {
        case RebulidInstanceStep.SelectOS:
          quickPick.title = "第 1 步: 选择 OS";
          quickPick.placeholder = "请选择要安装的 OS";
          const selectedPlanConfig = CONFIG.planList.find(
            (p: any) => p.id === rebulidInfo.planId
          );
          if (!selectedPlanConfig || !selectedPlanConfig.os) {
            // 错误处理：如果找不到Plan或OS列表
            resolve({
              status: "error",
              rebulidInfo: null,
              message: `未能找到 Plan ID 为 ${rebulidInfo.planId} 的 OS 列表。`,
            });
            quickPick.hide();
            return; // 提前退出 updateView
          }

          // 修复：确保 os 是数组，并且有数据
          const osListRebuild = Array.isArray(selectedPlanConfig.os)
            ? selectedPlanConfig.os
            : [];

          if (osListRebuild.length === 0) {
            resolve({
              status: "error",
              rebulidInfo: null,
              message: `Plan ID ${rebulidInfo.planId} 没有可用的操作系统。`,
            });
            quickPick.hide();
            return;
          }

          items.push(
            ...osListRebuild.map((o: any) => ({
              label: o.name,
              description: o.id.toString(),
              detail: " ",
            }))
          );
          quickPick.items = items;
          break;

        case RebulidInstanceStep.SelectSSHKey:
          quickPick.title = "第 2 步: 选择 SSH Key (可选)";
          quickPick.placeholder = "请选择要使用的 SSH Key，或选择不使用";
          items.push(backItem); // 添加返回按钮
          items.push({ label: "不使用 SSH Key", detail: " " }); // 添加不使用选项
          items.push(
            ...CONFIG.sshKeyList.map((key: any) => ({
              label: key.name,
              description: key.id.toString(),
              detail: `创建于 ${key.created_at}`,
            }))
          );
          quickPick.items = items;
          break;

        case RebulidInstanceStep.SelectBootScript:
          quickPick.title = "第 3 步: 选择启动脚本 (可选)";
          quickPick.placeholder = "请选择要使用的启动脚本，或选择不使用";
          items.push(backItem); // 添加返回按钮
          items.push({ label: "不使用启动脚本", detail: " " }); // 添加不使用选项
          if (CONFIG.bootScriptPath && fs.existsSync(CONFIG.bootScriptPath)) {
            const scripts: vscode.QuickPickItem[] = await getScriptList(
              CONFIG.bootScriptPath
            );
            items.push(...scripts);
          }
          quickPick.items = items;
          break;
      }
      quickPick.show(); // 显示 Quick Pick
    };

    // --- 处理用户接受选择或输入 ---
    quickPick.onDidAccept(async () => {
      const selection = quickPick.selectedItems[0];

      // 处理返回按钮
      if (selection === backItem) {
        if (currentStep > RebulidInstanceStep.SelectOS) {
          currentStep--;
          updateView();
        }
        return;
      }

      // 处理各个步骤的逻辑
      switch (currentStep) {
        case RebulidInstanceStep.SelectOS:
          if (selection?.description) {
            rebulidInfo.os = Number(selection.description);
            currentStep = RebulidInstanceStep.SelectSSHKey;
            updateView();
          }
          break;
        case RebulidInstanceStep.SelectSSHKey:
          // selectedItems[0] 可能不存在 (如果用户直接按 Enter 但没选)
          // description 可能为 '' (选择了 "不使用 SSH Key")
          if (selection) {
            rebulidInfo.sshKey = Number(selection.description) || NaN; // 使用 ?? 处理 undefined
            currentStep = RebulidInstanceStep.SelectBootScript;
            updateView();
          }
          break;

        case RebulidInstanceStep.SelectBootScript:
          if (selection) {
            // 如果选择“不使用启动脚本”，则 bootScript 为空，否则为脚本文件名
            rebulidInfo.bootScript =
              selection.label === "不使用启动脚本" ? "" : selection.label;
            isCompleted = true;
            resolve({ status: "completed", rebulidInfo: rebulidInfo });
            quickPick.hide();
          }
          break;
      }
    });

    // --- 处理 Quick Pick 被隐藏的事件 (ESC, 点击外部, 或调用 hide()) ---
    quickPick.onDidHide(() => {
      // 只有在不是正常完成的情况下，才认为是取消
      if (!isCompleted) {
        resolve({ status: "cancelled", rebulidInfo: null });
      }
      // 无论如何，都要释放资源
      quickPick.dispose();
      console.log("Multi-step Quick Pick disposed.");
    });

    // --- 初始化视图 ---
    updateView();
  });
}
