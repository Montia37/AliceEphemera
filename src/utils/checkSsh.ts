import { Client } from "ssh2";
import * as vscode from "vscode";

/**
 * 检查 SSH 服务器在给定的主机和端口上是否可达且响应。
 * 它会在总超时时间内重复尝试连接。
 * 如果成功建立连接，或者服务器响应 SSH 协议错误（表示服务器存活），则视为成功。
 *
 * @param host 要连接的主机名或 IP 地址。
 * @param port SSH 端口号（默认为 22）。
 * @param totalTimeoutMs 持续尝试的最大时间（毫秒，默认为 60000ms = 60 秒）。
 * @param retryIntervalMs 网络错误后重试连接的等待时间（毫秒，默认为 2000ms）。
 * @returns 一个 Promise，如果服务器在超时时间内可达且响应，则解析为 `true`，否则解析为 `false`。
 */
export async function checkServerSSH(
  title: string,
  host: string,
  port: number = 22,
  totalTimeoutMs: number = 60000,
  retryIntervalMs: number = 2000
): Promise<boolean> {
  // 使用 withProgress 显示进度通知
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: title,
      cancellable: false,
    },
    async (progress) => {
      return new Promise<boolean>((resolvePromise) => {
        let client: Client | null = null;
        let timeoutTimer: NodeJS.Timeout | null = null;
        let resolved = false; // 标志以确保我们只解析/拒绝一次
        const startTime = Date.now();

        const cleanup = (success: boolean) => {
          if (resolved) {
            return;
          } // 防止重复解析
          resolved = true;

          client?.end();
          client = null;
          if (timeoutTimer) {
            clearTimeout(timeoutTimer);
            timeoutTimer = null;
          }
          resolvePromise(success); // 解析外部 Promise
        };

        // 为整个操作设置总超时
        timeoutTimer = setTimeout(() => {
          if (!resolved) {
            vscode.window.showWarningMessage(
              `SSH 检查 ${host}:${port} 超时 (${totalTimeoutMs}ms)`,
              { modal: false }
            );
            cleanup(false); // 超时时解析为失败
          }
        }, totalTimeoutMs);

        const attemptConnect = (attemptNum: number) => {
          if (resolved) {
            return;
          } // 如果已解析则停止

          progress.report({
            message: `尝试 #${attemptNum} 连接 ${host}:${port}...`,
          });
          // console.log(
          //   `[SSH 检查] 尝试 #${attemptNum} 连接到 ${host}:${port}...`
          // );

          client = new Client();
          let attemptResolved = false; // 跟踪此特定尝试处理程序的解析状态

          // --- 事件处理程序 ---

          // 成功：已连接并准备就绪（服务器肯定已启动并使用 SSH 协议）
          client.once("ready", () => {
            if (attemptResolved || resolved) {
              return;
            }
            attemptResolved = true;
            // console.log(`[SSH 检查] 连接成功 (ready 事件) 到 ${host}:${port}`);
            progress.report({ message: `连接成功!` });
            cleanup(true); // 解析为成功
          });

          // 处理连接/协议错误
          client.once(
            "error",
            (err: Error & { code?: string; level?: string }) => {
              if (attemptResolved || resolved) {
                return;
              }
              attemptResolved = true;

              // 将身份验证失败视为成功（服务器可达）
              // 同时处理指示可达性的特定协议错误
              if (
                err.message.includes(
                  "All configured authentication methods failed"
                ) ||
                err.message.includes("keyboard-interactive") || // 常见的身份验证提示错误
                err.level === "client-authentication" // 到达身份验证阶段的另一个指标
              ) {
                // console.log(
                //   `[SSH 检查] ${host}:${port} 出现身份验证提示或失败 - 服务器可达。`
                // );
                progress.report({ message: `服务器可达 (需要认证)` });
                cleanup(true); // 解析为成功（服务器存活）
                return;
              }

              // 清理此尝试的客户端实例
              client?.end();
              client = null; // 防止 cleanup() 再次结束同一个客户端

              // 在安排重试之前检查超时是否尚未发生
              const timeRemaining = totalTimeoutMs - (Date.now() - startTime);
              if (timeRemaining > retryIntervalMs) {
                progress.report({
                  message: `尝试 #${attemptNum} 失败，将在 ${retryIntervalMs}ms 后重试...`,
                });
                setTimeout(
                  () => attemptConnect(attemptNum + 1),
                  retryIntervalMs
                );
              } else if (!resolved) {
                // 没有足够的时间进行另一次完整的重试间隔
                console.warn(
                  `[SSH 检查] 连接 ${host}:${port} 的剩余时间不足以进行另一次重试。`
                );
                vscode.window.showWarningMessage(
                  `SSH 检查 ${host}:${port} 的剩余时间不足 (${timeRemaining}ms)`,
                  { modal: false }
                );
                // 让主超时处理最终的失败状态
                // 或者如果非常接近超时则立即清理
                if (timeRemaining <= 0) {
                  cleanup(false);
                }
              }
            }
          );

          // --- 开始连接尝试 ---
          try {
            client.connect({
              host: host,
              port: port,
              // 使用占位符凭据以确保 SSH 握手进行得足够远
              // 以获得响应（成功或身份验证失败），证明服务器处于活动状态。
              username: `check-${Date.now()}`, // 使用唯一用户名以避免潜在的服务器问题
              password: "password",
              readyTimeout: 5000, // 增加 SSH 握手超时时间
            });
          } catch (e) {
            // 捕获 connect() 调用本身的同步错误（罕见）
            if (!resolved) {
              console.error(
                `[SSH 检查] 连接 ${host}:${port} 时发生同步连接错误: ${
                  e instanceof Error ? e.message : "未知错误"
                }`
              );
              // 将同步错误视为其他连接错误并重试
              client?.end();
              client = null;
              const timeRemaining = totalTimeoutMs - (Date.now() - startTime);
              if (timeRemaining > retryIntervalMs && !resolved) {
                progress.report({
                  message: `尝试 #${attemptNum} 失败，将在 ${retryIntervalMs}ms 后重试...`,
                });
                setTimeout(
                  () => attemptConnect(attemptNum + 1),
                  retryIntervalMs
                );
              } else if (!resolved) {
                vscode.window.showWarningMessage(
                  `SSH 检查 ${host}:${port} 的剩余时间不足 (${timeRemaining}ms)`,
                  { modal: false }
                );
                if (timeRemaining <= 0) {
                  cleanup(false);
                }
              }
            }
          }
        };

        // 开始第一次连接尝试
        attemptConnect(1);
      });
    }
  );

  return result; // 返回布尔结果
}
