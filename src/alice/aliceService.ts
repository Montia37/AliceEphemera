import { aliceApi, setBearerToken } from "./api";
import { CONFIG, updateStateConfig, Plan, InstanceState } from "./config";
import { convertTimezoneToLocal } from "../utils/time";
import { updateStatusBar } from "../commands";

/**
 * 获取 Client ID
 * @returns Client ID
 */
export type GetClientIdFn = () => string | undefined;

/**
 * 获取 Secret
 * @returns Secret
 */
export type GetSecretFn = () => string | undefined;

/**
 * 获取默认计划
 * @returns 默认计划
 */
export type GetDefaultPlanFn = () => Plan | undefined;

/**
 * 显示错误消息
 * @param message 消息内容
 * @param items 选项
 * @returns 用户选择的选项
 */
export type ShowErrorMessageFn = (
  message: string,
  ...items: string[]
) => Thenable<string | undefined>;

/**
 * 显示警告消息
 * @param message 消息内容
 * @param options 选项
 * @param items 选项
 * @returns 用户选择的选项
 */
export type ShowWarningMessageFn = (
  message: string,
  options: { modal: boolean },
  ...items: string[]
) => Thenable<string | undefined>;

/**
 * 显示进度
 * @param title 标题
 * @param task 任务
 */
export type WithProgressFn = (
  title: string,
  task: (progress: any) => Thenable<void>
) => Thenable<void>;

/**
 * 打开设置
 */
export type OpenSettingsFn = () => void;

/**
 * 显示续订实例菜单
 * @param instanceId 实例 ID
 */
export type ShowRenewalInstanceMenuFn = (instanceId: number) => void;

interface AliceServiceDependencies {
  getClientId: GetClientIdFn;
  getSecret: GetSecretFn;
  getDefaultPlan: GetDefaultPlanFn;
  showErrorMessage: ShowErrorMessageFn;
  showWarningMessage: ShowWarningMessageFn;
  withProgress: WithProgressFn;
  openSettings: OpenSettingsFn;
  showRenewalInstanceMenu: ShowRenewalInstanceMenuFn;
}

/**
 * Alice 服务，封装了与 Alice API 的交互逻辑，并解耦了 VSCode 相关的 UI 操作。
 */
export class AliceService {
  private dependencies: AliceServiceDependencies;

  constructor(dependencies: AliceServiceDependencies) {
    this.dependencies = dependencies;
  }

  /**
   * 更新所有配置
   * @param flag - 更新配置的选项
   */
  public async updateConfig(flag: "all" | "instance" | "defaultPlan" = "all") {
    const clientId = this.dependencies.getClientId();
    const secret = this.dependencies.getSecret();
    if (clientId && secret) {
      setBearerToken(clientId, secret); // 设置 Bearer Token 到 aliceApi 模块
    }

    if (!clientId || !secret) {
      // Client ID 或 Secret 为空时，不进行 API 调用
      return;
    }

    await this.dependencies.withProgress(
      "正在加载配置...",
      async (progress: any) => {
        if (flag === "instance" || flag === "all") {
          // 获取实例列表
          try {
            const response = await aliceApi.getInstanceList();
            const instanceList = response.data?.data;
            if (instanceList && instanceList.length > 0) {
              instanceList.forEach((instance: any) => {
                instance.creation_at = convertTimezoneToLocal(
                  instance.creation_at
                );
                instance.expiration_at = convertTimezoneToLocal(
                  instance.expiration_at
                );
              });
            }
            updateStateConfig({ instanceList: instanceList || [] }); // 更新状态
          } catch (error: any) {
            if (error.response && error.response.status === 401) {
              this.dependencies
                .showErrorMessage(
                  "认证失败：请检查 Client ID/Secret",
                  "打开设置"
                )
                .then((selection) => {
                  if (selection === "打开设置") {
                    this.dependencies.openSettings();
                  }
                });
              return;
            }
            this.dependencies
              .showErrorMessage("获取实例列表失败，请检查网络连接", "重试")
              .then(async (selection) => {
                if (selection === "重试") {
                  await this.updateConfig(flag);
                }
              });
            console.error("Error fetching instance list:", error);
          }
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
                updateStateConfig({
                  evoPermissions: evoPermissions || {},
                  hasEvoPermission: true,
                }); // 更新状态
              }
            })
            .catch((error) => {
              if (error.response && error.response.status === 400) {
                updateStateConfig({ hasEvoPermission: false });
                this.dependencies
                  .showErrorMessage(
                    "您的账户似乎没有 EVO Cloud 权限，请检查。",
                    "重试",
                    "检查 Client ID/Secret",
                    "访问 EVO Cloud 界面"
                  )
                  .then(async (selection) => {
                    if (selection === "重试") {
                      await this.updateConfig(flag);
                    } else if (selection === "检查 Client ID/Secret") {
                      this.dependencies.openSettings();
                    } else if (selection === "访问 EVO Cloud 界面") {
                      const vscode = require("vscode");
                      vscode.env.openExternal(
                        vscode.Uri.parse(
                          "https://console.alice.sh/ephemera/evo-cloud"
                        )
                      );
                    }
                  });
                return;
              }
              console.error("Error fetching EVO permissions:", error);
            });

          if (!CONFIG.hasEvoPermission) {
            return; // 如果没有 EVO 权限，停止后续操作
          }

          // 获取计划列表
          await aliceApi
            .getPlanList()
            .then(async (response) => {
              if (response.status === 200) {
                let planList = response.data?.data;
                if (CONFIG.evoPermissions.allow_packages && planList) {
                  planList = planList.filter((plan: any) =>
                    CONFIG.evoPermissions.allow_packages.includes(
                      plan.id.toString()
                    )
                  );
                }

                if (planList && planList.length > 0) {
                  await Promise.all(
                    planList.map(async (plan: any) => {
                      // 保存原始的 OS ID 列表 - 修复: 检查 plan.os 是否存在
                      const originalOsIds =
                        typeof plan.os === "string" ? plan.os.split("|") : [];

                      try {
                        const osResponse = await aliceApi.getPlanToOS(
                          Number(plan.id)
                        );
                        if (
                          osResponse.status === 200 &&
                          osResponse.data?.data
                        ) {
                          const allOsObjects = osResponse.data.data.flatMap(
                            (group: any) => group.os_list || []
                          );

                          // 如果没有原始 OS ID 列表,则使用所有可用的 OS
                          if (originalOsIds.length === 0) {
                            plan.os = allOsObjects;
                          } else {
                            // 根据原始 ID 列表进行过滤
                            plan.os = allOsObjects.filter((os: any) =>
                              originalOsIds.includes(os.id.toString())
                            );
                          }
                        } else {
                          plan.os = [];
                        }
                      } catch (error) {
                        console.error(
                          `Error fetching OS for plan ${plan.id}:`,
                          error
                        );
                        plan.os = [];
                      }

                      return plan;
                    })
                  );
                }
                updateStateConfig({ planList: planList || [] }); // 更新状态
              }
            })
            .catch((error) => {
              console.error("Error fetching plan list:", error);
            });

          // 获取 SSH Key 列表
          await aliceApi
            .getSSHKeyList()
            .then((response) => {
              if (response.status === 200) {
                const sshKeyList = response.data?.data;
                if (sshKeyList && sshKeyList.length > 0) {
                  sshKeyList.forEach((sshKey: any) => {
                    sshKey.created_at = convertTimezoneToLocal(
                      sshKey.created_at
                    );
                  });
                }
                updateStateConfig({ sshKeyList: sshKeyList || [] }); // 更新状态
              }
            })
            .catch((error) => {
              console.error("Error fetching SSH Key list:", error);
            });
        }
      }
    );

    if (flag === "defaultPlan") {
      const defaultPlan = this.dependencies.getDefaultPlan();
      if (defaultPlan) {
        // 由于旧版插件的 defaultPlan 是 string 类型，需要转换
        if (typeof defaultPlan.id === "string") {
          defaultPlan.id = Number(defaultPlan.id);
        }
        if (typeof defaultPlan.os === "string") {
          defaultPlan.os = Number(defaultPlan.os);
        }
        if (typeof defaultPlan.time === "string") {
          defaultPlan.time = Number(defaultPlan.time);
        }
        if (typeof defaultPlan.sshKey === "string") {
          defaultPlan.sshKey = Number(defaultPlan.sshKey);
        }
      }
      updateStateConfig({
        defaultPlan: defaultPlan,
      }); // 更新默认计划
    }
  }

  /**
   * 检查实例剩余时间并显示警告
   */
  public async checkInstanceExpiration() {
    const instance = CONFIG.instanceList[0];
    const expiration_at = new Date(instance.expiration_at).getTime();
    const now = new Date().getTime();
    const timeLeft = expiration_at - now;
    const minutes = Math.floor((timeLeft / (1000 * 60)) % 60);

    // 检查是否设置了不再提醒
    if (CONFIG.doNotRemindExpiration) {
      return;
    }

    if (timeLeft < 0) {
      this.updateConfig("instance");
      if (CONFIG.instanceList.length > 0) {
        return; // 如果还有实例，直接返回
      }
      this.dependencies.showErrorMessage(
        `实例 ${instance.id} 已到期自动删除！或到期时间错误，请自行确认。`
      );
      clearInterval(CONFIG.updateStatusBarInterval); // 停止状态栏更新
      updateStateConfig({
        instanceList: [],
        instanceState: {} as InstanceState,
        doNotRemindExpiration: false,
        updateStatusBarInterval: null,
      }); // 清空状态
      updateStatusBar(); // 立即更新状态栏
      return;
    }

    if (timeLeft < 5 * 60 * 1000 && timeLeft >= 0) {
      this.dependencies
        .showWarningMessage(
          `实例 ${instance.id} 剩余时间不足 ${minutes} 分钟，请及时备份数据！\n是否需要延长时间？`,
          { modal: true },
          "是",
          "本次不再提醒"
        )
        .then((selection) => {
          if (selection === "是") {
            this.dependencies.showRenewalInstanceMenu(instance.id);
          } else if (selection === "本次不再提醒") {
            updateStateConfig({
              doNotRemindExpiration: true,
            });
          }
        });
    }
  }
  /**
   * 获取实例状态
   * @param instanceId 实例 ID
   * @returns 实例状态信息
   */
  public async getInstanceState(
    instanceId: number
  ): Promise<InstanceState | undefined> {
    try {
      const response = await aliceApi.getInstanceState(instanceId);
      if (response.status === 200 && response.data?.data) {
        const instanceInfo = response.data.data as InstanceState;
        if (instanceInfo.status === "complete") {
          const state = instanceInfo.state;
          const memory = state.memory;
          const traffic = state.traffic;

          const formatMemory = (mem: string) =>
            (parseInt(mem, 10) / (1024 * 1024)).toFixed(2);

          const bytesToGB = (bytes: number) =>
            Number((bytes / (1024 * 1024 * 1024)).toFixed(2));

          memory.memtotal = formatMemory(memory.memtotal);
          memory.memfree = formatMemory(memory.memfree);
          memory.memavailable = formatMemory(memory.memavailable);

          traffic.in = bytesToGB(traffic.in);
          traffic.out = bytesToGB(traffic.out);
          traffic.total = bytesToGB(traffic.total);

          if (memory.memavailable === "0.00") {
            state.state = "stopped";
          }
        }

        return instanceInfo;
      }
    } catch (error: any) {
      this.dependencies.showErrorMessage(
        `获取实例状态失败: ${error.message || error}`
      );
      console.error("Error fetching instance state:", error);
      return undefined;
    }
  }
}
