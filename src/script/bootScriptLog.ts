import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { CONFIG } from "../alice/config";

const LOG_FILE_NAME = "boot_script_log.json";

export interface LogEntry {
  id: string; // 使用 command_uid 作为唯一标识
  instanceId: string;
  dateTime: string;
  operation: "创建" | "重装";
  scriptName: string;
  status: "pending" | "completed" | "failed";
  output?: string; // Base64 编码的输出
}

// Helper function to check for Base64 encoding
function isBase64(str: string): boolean {
  if (!str) {
    return false;
  }
  // Strip whitespace that can be present in Base64 strings (e.g. newlines)
  const strippedStr = str.replace(/[\s\r\n]/g, "");
  // This regex is more robust and handles cases without padding.
  const base64Regex = /^[A-Za-z0-9+/]*=?=?$/;
  if (!base64Regex.test(strippedStr)) {
    return false;
  }
  // Check for valid length. Base64 string length (without whitespace) must be a multiple of 4.
  // However, some encoders omit padding, so we check if it can be decoded.
  try {
    Buffer.from(strippedStr, "base64");
    return true;
  } catch (error) {
    return false;
  }
}

function getLogFilePath(): string | null {
  const bootScriptPath = CONFIG.bootScriptPath;
  if (!bootScriptPath) {
    return null;
  }
  return path.join(bootScriptPath, LOG_FILE_NAME);
}

export async function readLogFile(): Promise<LogEntry[]> {
  const logFilePath = getLogFilePath();
  if (!logFilePath || !fs.existsSync(logFilePath)) {
    return [];
  }
  try {
    const content = await fs.promises.readFile(logFilePath, "utf-8");
    const logs: LogEntry[] = JSON.parse(content);
    // Decode output if it's in Base64
    return logs.map((log) => {
      if (log.output && isBase64(log.output)) {
        try {
          const decodedOutput = Buffer.from(log.output, "base64").toString(
            "utf-8"
          );
          return { ...log, output: decodedOutput };
        } catch (error) {
          console.error("Failed to decode Base64 string:", error);
          // If decoding fails, return the original log
          return log;
        }
      }
      return log;
    });
  } catch (error) {
    console.error("Error reading or parsing log file:", error);
    return [];
  }
}

async function writeLogFile(logs: LogEntry[]): Promise<void> {
  const logFilePath = getLogFilePath();
  if (!logFilePath) {
    vscode.window.showErrorMessage("未配置启动脚本目录，无法写入日志。");
    return;
  }
  try {
    await fs.promises.writeFile(logFilePath, JSON.stringify(logs, null, 2));
  } catch (error) {
    console.error("Error writing log file:", error);
    vscode.window.showErrorMessage(`写入日志文件失败: ${error}`);
  }
}

export async function addLogEntry(
  instanceId: string,
  operation: "创建" | "重装",
  scriptName: string,
  commandUid: string
): Promise<void> {
  const newLog: LogEntry = {
    id: commandUid,
    instanceId,
    dateTime: new Date().toLocaleString(),
    operation,
    scriptName,
    status: "pending",
  };

  const logs = await readLogFile();
  logs.unshift(newLog); // 添加到最前面
  await writeLogFile(logs);
}

export async function updateLogEntry(
  commandUid: string,
  status: "completed" | "failed",
  output?: string
): Promise<void> {
  const logs = await readLogFile();
  const logIndex = logs.findIndex((log) => log.id === commandUid);

  if (logIndex === -1) {
    console.error(`Log entry with id ${commandUid} not found.`);
    return;
  }

  logs[logIndex].status = status;
  logs[logIndex].output = output;

  await writeLogFile(logs);
}

export async function getLogEntriesForInstance(
  instanceId: string
): Promise<LogEntry[]> {
  const logs = await readLogFile();
  return logs.filter((log) => log.instanceId === instanceId);
}
