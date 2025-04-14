import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { workspace } from "vscode";

const API_URL = "https://app.alice.ws/cli/v1";

const service: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json;charset=utf-8",
  },
});

// 添加请求拦截器，动态注入最新的 API Token
service.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const API_TOKEN = workspace
      .getConfiguration("aliceephemera")
      .get<string>("apiToken");
    if (API_TOKEN) {
      config.headers["KP-APIToken"] = API_TOKEN;
    } else {
      delete config.headers["KP-APIToken"];
      console.warn("Alice Ephemera API Key is not configured.");
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 实例列表
export function getInstanceList(): Promise<any> {
  return service({
    url: "/Evo/Instance",
    method: "GET",
  });
}

// 规格列表
export function getPlanList(): Promise<any> {
  return service({
    url: "/Evo/Plan",
    method: "GET",
  });
}

// 系统镜像信息
export function getPlanToOS(plan_id: string): Promise<any> {
  return service({
    url: "/Evo/PlanToOS",
    method: "POST",
    data: {
      plan_id: plan_id,
    },
  });
}

// SSH Key 列表
export function getSSHKeyList(): Promise<any> {
  return service({
    url: "/User/SSHKey",
    method: "GET",
  });
}

// 权限信息
export function getEVOPermissions(): Promise<any> {
  return service({
    url: "/User/EVOPermissions",
    method: "GET",
  });
}

// 账户信息
export function getUserInfo(): Promise<any> {
  return service({
    url: "/User/Info",
    method: "GET",
  });
}

// 创建实例
export function createInstance(
  product_id: string,
  os_id: string,
  time: string,
  sshKey_id?: string
): Promise<any> {
  return service({
    url: "/Evo/Deploy",
    method: "POST",
    data: {
      product_id: product_id,
      os_id: os_id,
      time: time,
      sshKey: sshKey_id,
    },
  });
}

// 删除实例
export function deleteInstance(instance_id: string): Promise<any> {
  return service({
    url: "/Evo/Destroy",
    method: "POST",
    data: {
      id: instance_id,
    },
  });
}

// 延长实例使用时间
export function renewalInstance(
  instance_id: string,
  time: string
): Promise<any> {
  return service({
    url: "/Evo/Renewal",
    method: "POST",
    data: {
      id: instance_id,
      time: time,
    },
  });
}

// 控制实例电源
export function powerInstance(
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
}

// 重新安装实例
export function rebulidInstance(
  instance_id: string,
  os_id: string,
  sshKey_id?: string
): Promise<any> {
  return service({
    url: "/Evo/Rebuild",
    method: "POST",
    data: {
      id: instance_id,
      os: os_id,
      sshKey: sshKey_id,
    },
  });
}
