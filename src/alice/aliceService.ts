import { aliceApi, setApiToken } from "./api";
import { CONFIG, updateStateConfig, Plan, InstanceState } from "./config";
import { convertUTC1ToLocalTime } from "../utils/time";
import { updateStatusBar } from "../commands";

/**
 * 获取 API Token
 * @returns API Token
 */
export type GetApiTokenFn = () => string | undefined;

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
export type ShowRenewalInstanceMenuFn = (instanceId: string) => void;

interface AliceServiceDependencies {
  getApiToken: GetApiTokenFn;
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
    const apiToken = this.dependencies.getApiToken();
    setApiToken(apiToken); // 设置 API Token 到 aliceApi 模块

    if (!apiToken) {
      // API Token 为空时，不进行 API 调用
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
                instance.creation_at = convertUTC1ToLocalTime(
                  instance.creation_at
                ).toLocaleString();
                instance.expiration_at = convertUTC1ToLocalTime(
                  instance.expiration_at
                ).toLocaleString();
              });
            }
            updateStateConfig({ instanceList: instanceList || [] }); // 更新状态
          } catch (error: any) {
            if (error.response && error.response.status === 401) {
              this.dependencies
                .showErrorMessage("认证失败：请检查 apiToken", "打开设置")
                .then((selection) => {
                  if (selection === "打开设置") {
                    this.dependencies.openSettings();
                  }
                });
              return;
            }
            this.dependencies
              .showErrorMessage("获取实例列表失败，请检查网络连接", "重试")
              .then((selection) => {
                if (selection === "重试") {
                  this.updateConfig(flag);
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
                updateStateConfig({ evoPermissions: evoPermissions || {} }); // 更新状态
              }
            })
            .catch((error) => {
              console.error("Error fetching EVO permissions:", error);
            });

          // 获取计划列表
          await aliceApi
            .getPlanList()
            .then((response) => {
              if (response.status === 200) {
                let planList = response.data?.data;
                if (CONFIG.evoPermissions.allow_packages && planList) {
                  planList = planList.filter((plan: any) =>
                    CONFIG.evoPermissions.allow_packages.includes(
                      plan.id.toString()
                    )
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
            });
        }
      }
    );

    if (flag === "defaultPlan") {
      updateStateConfig({
        defaultPlan: this.dependencies.getDefaultPlan(),
      }); // 更新默认计划
    }
  }

  /**
   * 检查实例剩余时间并显示警告
   */
  public checkInstanceExpiration() {
    if (CONFIG.instanceList && CONFIG.instanceList.length > 0) {
      const instance = CONFIG.instanceList[0];
      const expiration_at = new Date(instance.expiration_at).getTime();
      const now = new Date().getTime();
      const timeLeft = expiration_at - now;

      const minutes = Math.floor((timeLeft / (1000 * 60)) % 60);

      // 检查是否设置了不再提醒
      if (CONFIG.doNotRemindExpiration) {
        return;
      }
      if (timeLeft < 5 * 60 * 1000 && timeLeft > 0) {
        this.dependencies
          .showWarningMessage(
            `实例 ${instance.id} 剩余时间不足 ${minutes} 分钟，请及时备份数据！\n是否需要延长时间？`,
            { modal: true },
            "是",
            "不再提醒"
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

      if (timeLeft <= 0) {
        this.updateConfig("instance"); // 更新实例列表
        updateStatusBar();
        this.dependencies.showErrorMessage(`实例 ${instance.id} 已被删除！`);
      }
    }
  }
  /**
   * 获取实例状态
   * @param instanceId 实例 ID
   * @returns 实例状态信息
   */
  public async getInstanceState(
    instanceId: string
  ): Promise<InstanceState | undefined> {
    try {
      const response = await aliceApi.getInstanceState(instanceId);
      if (response.status === 200 && response.data?.data) {
        const instanceInfo = response.data.data as InstanceState;
        if (instanceInfo.status === "complete") {
          const { memory, traffic } = instanceInfo.state;

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
