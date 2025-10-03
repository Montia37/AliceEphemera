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
  planId: string;
  os: string;
  sshKey: string;
}

const CLIENT_ID = workspace
  .getConfiguration(ALICE_ID)
  .get("clientId") as string;
const SECRET = workspace.getConfiguration(ALICE_ID).get("secret") as string;

const DEFAULT_PLAN = workspace.getConfiguration(ALICE_ID).get("plan") as Plan;

const AUTO_CONNECT_INSTANCE = workspace
  .getConfiguration(ALICE_ID)
  .get("autoConnectInstance") as string;
const AUTO_CONNECT_INSTANCE_HOST = workspace
  .getConfiguration(ALICE_ID)
  .get("autoConnectInstanceHost") as string;

export const CONFIG = {
  init: true,
  clientId: CLIENT_ID,
  secret: SECRET,
  autoConnectInstance: AUTO_CONNECT_INSTANCE,
  autoConnectInstanceHost: AUTO_CONNECT_INSTANCE_HOST,
  defaultPlan: DEFAULT_PLAN,
  evoPermissions: {} as any,
  instanceList: [] as any[],
  planList: [] as any[],
  sshKeyList: [] as any[],
  instanceState: {} as InstanceState,
  doNotRemindExpiration: false,
};

/**
 * 更新配置
 * @param {Partial<typeof CONFIG>} newState - 新的配置项
 */
export function updateStateConfig(newState: Partial<typeof CONFIG>) {
  Object.assign(CONFIG, newState);
}
