import { workspace } from "vscode";

/**
 * 插件唯一标识符 ID
 */
export const ALICE_ID = "aliceephemera";

export const ALICE_SETTINGS = `@ext:montia37.${ALICE_ID}`;

/**
 * 显示 Alice 菜单的命令 ID
 */
export const SHOW_ALICE_MENU_COMMAND_ID = `${ALICE_ID}.showAliceMenu`;

/**
 * 实例规格接口
 * @property {number} id - 规格 ID
 * @property {number} os - 操作系统 ID
 * @property {number} time - 时长
 * @property {number} sshKey - SSH 密钥
 * @property {string} bootScript - 启动脚本
 */
export interface Plan {
  id: number;
  os: number;
  time: number;
  sshKey: number;
  bootScript: string;
}

export interface InstanceState {
  status: string;
  state: {
    state: string;
    cpu: number;
    memory: {
      memtotal: string;
      memfree: string;
      memavailable: string;
    };
    traffic: {
      in: number;
      out: number;
      total: number;
    };
  };
}

/**
 * 实例重建信息接口
 * @property {string} planId - 规格 ID
 * @property {string} os - 操作系统 ID
 * @property {string} sshKey - SSH 密钥
 */
export interface RebuildInfo {
  planId: number;
  os: number;
  sshKey: number;
  bootScript: string;
}

const CLIENT_ID = workspace
  .getConfiguration(ALICE_ID)
  .get("clientId") as string;
const SECRET = workspace.getConfiguration(ALICE_ID).get("secret") as string;

const planConfig = workspace.getConfiguration(ALICE_ID).get("plan") as any;
const DEFAULT_PLAN: Plan = planConfig
  ? {
      id: Number(planConfig.id),
      os: Number(planConfig.os),
      time: Number(planConfig.time),
      sshKey: Number(planConfig.sshKey),
      bootScript: planConfig.bootScript,
    }
  : ({} as Plan);

const AUTO_CONNECT_INSTANCE = workspace
  .getConfiguration(ALICE_ID)
  .get("autoConnectInstance") as string;
const AUTO_CONNECT_INSTANCE_HOST = workspace
  .getConfiguration(ALICE_ID)
  .get("autoConnectInstanceHost") as string;

const BOOT_SCRIPT_PATH = workspace
  .getConfiguration(ALICE_ID)
  .get("bootScriptPath") as string;

export const CONFIG = {
  init: true,
  clientId: CLIENT_ID,
  secret: SECRET,
  autoConnectInstance: AUTO_CONNECT_INSTANCE,
  autoConnectInstanceHost: AUTO_CONNECT_INSTANCE_HOST,
  bootScriptPath: BOOT_SCRIPT_PATH,
  defaultPlan: DEFAULT_PLAN,
  hasEvoPermission: false,
  evoPermissions: {} as any,
  instanceList: [] as any[],
  planList: [] as any[],
  sshKeyList: [] as any[],
  instanceState: {} as InstanceState,
  doNotRemindExpiration: false,
  updateStatusBarInterval: null as any,
};

/**
 * 更新配置
 * @param {Partial<typeof CONFIG>} newState - 新的配置项
 */
export function updateStateConfig(newState: Partial<typeof CONFIG>) {
  Object.assign(CONFIG, newState);
}
