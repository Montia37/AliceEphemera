import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";
const API_URL = "https://app.alice.ws/cli/v1";

let bearerToken: string | undefined;

const service: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json;charset=utf-8",
  },
});

// 添加请求拦截器，动态注入最新的 Bearer Token
service.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (bearerToken) {
      config.headers["Authorization"] = `Bearer ${bearerToken}`;
    } else {
      delete config.headers["Authorization"];
      console.warn("Alice Ephemera API Key is not configured.");
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * 设置 Bearer Token
 * @param clientId
 * @param secret
 */
export function setBearerToken(clientId: string, secret: string) {
  bearerToken = `${clientId}:${secret}`;
}

/**
 * 清除 Bearer Token
 */
export function clearBearerToken() {
  bearerToken = undefined;
}

/**
 * Alice API 接口
 * @description 该接口用于 Alice Ephemera 的 API 调用
 */
export const aliceApi = {
  /**
   * 获取实例列表
   */
  getInstanceList(): Promise<any> {
    return service({
      url: "/Evo/Instance",
      method: "GET",
    });
  },

  /**
   * 获取规格列表
   */
  getPlanList(): Promise<any> {
    return service({
      url: "/Evo/Plan",
      method: "GET",
    });
  },

  /**
   * 获取实例状态
   * @param instance_id 实例 ID
   */
  getInstanceState(instance_id: string): Promise<any> {
    return service({
      url: "/Evo/State",
      method: "POST",
      data: {
        id: instance_id,
      },
    });
  },

  /**
   * 获取系统镜像信息
   */
  getPlanToOS(plan_id: string): Promise<any> {
    return service({
      url: "/Evo/getOSByPlan",
      method: "POST",
      data: {
        plan_id: plan_id,
      },
    });
  },

  /**
   *  获取 SSH Key 列表
   */
  getSSHKeyList(): Promise<any> {
    return service({
      url: "/User/SSHKey",
      method: "GET",
    });
  },

  /**
   * 获取权限信息
   */
  getEVOPermissions(): Promise<any> {
    return service({
      url: "/User/EVOPermissions",
      method: "GET",
    });
  },

  /**
   * 获取用户信息
   */
  getUserInfo(): Promise<any> {
    return service({
      url: "/User/Info",
      method: "GET",
    });
  },

  /**
   * 创建实例
   * @param product_id 规格 ID
   * @param os_id 镜像 ID
   * @param time 时长
   * @param sshKey_id 密钥 ID（可选）
   */
  createInstance(
    product_id: string,
    os_id: string,
    time: string,
    sshKey_id?: string,
    bootScript?: string
  ): Promise<any> {
    const params: any = {
      product_id: product_id,
      os_id: os_id,
      time: time,
      sshKey: sshKey_id,
    };
    if (bootScript) {
      params.bootScript = Buffer.from(bootScript).toString("base64");
    }
    return service({
      url: "/Evo/Deploy",
      method: "POST",
      data: params,
    });
  },

  /**
   * 删除实例
   * @param instance_id 实例 ID
   */
  deleteInstance(instance_id: string): Promise<any> {
    return service({
      url: "/Evo/Destroy",
      method: "POST",
      data: {
        id: instance_id,
      },
    });
  },

  /**
   * 延长实例时间
   * @param instance_id 实例 ID
   * @param time 需要延长的时间（单位：小时）
   */
  renewalInstance(instance_id: string, time: string): Promise<any> {
    return service({
      url: "/Evo/Renewal",
      method: "POST",
      data: {
        id: instance_id,
        time: time,
      },
    });
  },

  /**
   * 控制实例电源
   * @param instance_id 实例 ID
   * @param action 操作类型（boot、shutdown、restart、poweroff）
   * boot：开机
   * shutdown：关机
   * restart：重启
   * poweroff：强制关机
   */
  powerInstance(
    instance_id: string,
    action: "boot" | "shutdown" | "restart" | "poweroff"
  ): Promise<any> {
    return service({
      url: "/Evo/Power",
      method: "POST",
      data: {
        id: instance_id,
        action: action,
      },
    });
  },

  /**
   * 重装系统
   * @param instance_id 实例 ID
   * @param os_id 镜像 ID
   * @param sshKey_id 密钥 ID（可选）
   */
  rebulidInstance(
    instance_id: string,
    os_id: string,
    sshKey_id?: string,
    bootScript?: string
  ): Promise<any> {
    const params: any = {
      id: instance_id,
      os: os_id,
      sshKey: sshKey_id,
    };
    if (bootScript) {
      params.bootScript = Buffer.from(bootScript).toString("base64");
    }
    return service({
      url: "/Evo/Rebuild",
      method: "POST",
      data: params,
    });
  },
};
