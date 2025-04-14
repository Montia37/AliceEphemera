<div align="center">

<img width="128" src="./resources/alice.png">

## ✨ Alice Ephemera ✨

`调用 API 进行 Alice Ephemera 实例管理`

</div>

---

### 🚀 功能

- 创建、删除、重装 EVO 实例
- 显示实例基本信息
- 显示实例到期倒计时，到期前 5 分钟会提醒，可选择续期

### 📦 安装

- 在 VS Code 扩展商店中搜索 "Alice Ephemera" 并安装

### 📝 使用方法

1.  打开 VS Code。
2.  点击状态栏配置 API Token
    <img width="660" src="./resources/setApiToken.png">
3.  配置完 API Token 即可点击状态栏创建实例，可以设置默认配置方便创建
    <img width="660" src="./resources/createInstance.png">
4.  创建完实例默认会在状态栏显示到期倒计时，鼠标悬浮显示具体配置信息，点击即可控制实例
    <img width="660" src="./resources/controlInstance.png">

### ⚙️ 配置文件说明

Alice Ephemera 的配置位于 VS Code 的设置中。

- `aliceephemera.apiToken`: 在 [https://app.alice.ws/ephemera/console](https://app.alice.ws/ephemera/console) 查看 API Token。
- `aliceephemera.plan`: 推荐使用菜单修改配置。
  - `id`: 配置 ID
  - `os`: 系统镜像 ID
  - `time`: 时长
  - `sshKey`: SSH Key ID（可选）

### 📄 许可证

[MIT](LICENSE)
