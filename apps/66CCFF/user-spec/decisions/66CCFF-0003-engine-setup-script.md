# 66CCFF-0003 首版引擎用仓库脚本安装，应用检测状态

- 状态：有效
- 日期：2026-11-04
- 决策者：agent
- 服务于：
  - 作者预期：[`../README.md`](../README.md)「工具与平台」允许应用管理引擎；「界面」先做一版能用

## 背景

完整的内置安装器（下载 Python / uv、显示 pip 进度、失败恢复）工作量较大；作者希望先试一版。当前 Windows 机器已安装 `uv`。

## 决策

- 提供 `apps/66CCFF/scripts/setup-engine.ps1`：用 uv 创建 Python 3.12 venv，安装 Demucs + CUDA 版 PyTorch，预下载 `htdemucs_6s` 模型；
- 应用只检测 `<userData>/apps/66CCFF/engine/venv` 是否存在，并在界面提示安装命令；不在应用内执行 pip。

## 考虑过、没有采用

- **应用内下载 Python / uv 并安装**：更像成品，但首版复杂、下载失败难恢复。
- **依赖系统 Python**：版本与 CUDA 轮子不可控。

## 代价

- 首次使用需要手动运行一次脚本；
- macOS / Linux 暂未提供脚本。

## 什么时候应该重新考虑

- 要分发给朋友 / 普通用户 → 必须做成应用内安装向导；
- 需要 macOS / Linux。
