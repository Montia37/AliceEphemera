import { workspace } from "vscode";

/**
 * 插件唯一标识符 ID
 */
export const ALICE_ID = "aliceephemera";

/**
 * 显示 Alice 菜单的命令 ID
 */
export const SHOW_ALICE_MENU_COMMAND_ID = `${ALICE_ID}.showAliceMenu`;

/**
 * 实例规格接口
 * @property {string} id - 规格 ID
 * @property {string} os - 操作系统 ID
 * @property {string} time - 时长
 * @property {string} sshKey - SSH 密钥
 */
export interface Plan {
  id: string;
  os: string;
  time: string;
  sshKey: string;
}

/**
 * 实例重建信息接口
 * @property {string} planId - 规格 ID
 * @property {string} os - 操作系统 ID
 * @property {string} sshKey - SSH 密钥
 */
export interface RebuildInfo {
  planId: string;
  os: string;
  sshKey: string;
}

const API_TOKEN = workspace
  .getConfiguration(ALICE_ID)
  .get("apiToken") as string;

const DEFAULT_PLAN = workspace.getConfiguration(ALICE_ID).get("plan") as Plan;

export const CONFIG = {
  apiToken: API_TOKEN,
  defaultPlan: DEFAULT_PLAN,
  evoPermissions: {} as any,
  instanceList: [] as any[],
  planList: [] as any[],
  sshKeyList: [] as any[],
};

/**
 * 更新配置
 * @param {Partial<typeof CONFIG>} newState - 新的配置项
 */
export function updateStateConfig(newState: Partial<typeof CONFIG>) {
  Object.assign(CONFIG, newState);
}
