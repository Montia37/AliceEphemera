import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { ALICE_ID, CONFIG } from "../alice/config";
import { getScriptList } from "../utils/getScriptList";

export async function bootScript() {
  const bootScriptPath = CONFIG.bootScriptPath;
  if (!bootScriptPath || !fs.existsSync(bootScriptPath)) {
    const selectDir = await vscode.window.showInformationMessage(
      "未配置启动脚本目录，是否立即选择？",
      { modal: true },
      "选择目录"
    );
    if (selectDir === "选择目录") {
      const dir = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "选择脚本目录",
      });
      if (dir && dir.length > 0) {
        await vscode.workspace
          .getConfiguration(ALICE_ID)
          .update("bootScriptPath", dir[0].fsPath, true);
        vscode.window.showInformationMessage(
          `脚本目录已设置为: ${dir[0].fsPath}`
        );
      }
    }
  } else {
    showScriptManagementMenu(bootScriptPath);
  }
}

async function showScriptManagementMenu(bootScriptPath: string) {
  const items: vscode.QuickPickItem[] = [
    {
      label: `$(folder-opened) 打开脚本文件夹`,
      detail: "在新的 VSCode 窗口中打开脚本文件夹",
    },
    {
      label: `$(explorer-view-icon) 在文件资源管理器中显示`,
      detail: "在操作系统的文件资源管理器中显示脚本文件夹",
    },
    {
      label: `$(add) 新增脚本`,
      detail: "创建一个新的启动脚本",
    },
    {
      label: `$(edit) 查看/修改脚本`,
      detail: "查看或修改现有的启动脚本",
    },
    {
      label: `$(trash) 删除脚本`,
      detail: "删除一个现有的启动脚本",
    },
  ];

  const selectedItem = await vscode.window.showQuickPick(items, {
    title: "脚本管理",
    placeHolder: "请选择要执行的操作",
  });

  if (selectedItem) {
    switch (selectedItem.label) {
      case `$(folder-opened) 打开脚本文件夹`:
        vscode.commands.executeCommand(
          "vscode.openFolder",
          vscode.Uri.file(bootScriptPath),
          true
        );
        break;
      case `$(explorer-view-icon) 在文件资源管理器中显示`:
        // 使用 openExternal 来直接打开文件夹，而不是仅仅高亮它
        vscode.env.openExternal(vscode.Uri.file(bootScriptPath));
        break;
      case `$(add) 新增脚本`:
        await createScript(bootScriptPath);
        break;
      case `$(edit) 查看/修改脚本`:
        await editScript(bootScriptPath);
        break;
      case `$(trash) 删除脚本`:
        await deleteScript(bootScriptPath);
        break;
    }
  }
}

async function createScript(bootScriptPath: string) {
  const scriptName = await vscode.window.showInputBox({
    title: "输入脚本名称",
    placeHolder: "例如：install-docker",
    validateInput: (input) => {
      if (!input) {
        return "脚本名称不能为空";
      }
      if (/[\\/:\*\?"<>\|]/.test(input)) {
        return "脚本名称不能包含特殊字符";
      }
      return null;
    },
  });

  if (scriptName) {
    const scriptPath = path.join(bootScriptPath, `${scriptName}.sh`);
    if (fs.existsSync(scriptPath)) {
      vscode.window.showErrorMessage(`脚本 ${scriptName}.sh 已存在`);
      return;
    }
    fs.writeFileSync(scriptPath, "#!/bin/bash\n");
    const document = await vscode.workspace.openTextDocument(scriptPath);
    await vscode.window.showTextDocument(document);
  }
}

async function editScript(bootScriptPath: string) {
  const scripts = await getScriptList(bootScriptPath);
  if (scripts.length === 0) {
    vscode.window.showInformationMessage("没有可用的脚本");
    return;
  }

  const selectedScript = await vscode.window.showQuickPick(scripts, {
    title: "选择要编辑的脚本",
    placeHolder: "请选择一个脚本",
  });

  if (selectedScript) {
    const document = await vscode.workspace.openTextDocument(
      selectedScript.filePath
    );
    await vscode.window.showTextDocument(document);
  }
}

async function deleteScript(bootScriptPath: string) {
  const scripts = await getScriptList(bootScriptPath);
  if (scripts.length === 0) {
    vscode.window.showInformationMessage("没有可用的脚本");
    return;
  }

  const selectedScript = await vscode.window.showQuickPick(scripts, {
    title: "选择要删除的脚本",
    placeHolder: "请选择一个脚本",
  });

  if (selectedScript) {
    const confirm = await vscode.window.showWarningMessage(
      `确定要删除脚本 ${selectedScript.label} 吗？`,
      { modal: true },
      "删除"
    );
    if (confirm === "删除") {
      fs.unlinkSync(selectedScript.filePath);
      vscode.window.showInformationMessage(
        `脚本 ${selectedScript.label} 已删除`
      );
    }
  }
}
