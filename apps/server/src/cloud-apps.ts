import { join } from "node:path";
import type { Kernel } from "@myoutside/kernel";
import { dialogApp } from "@myoutside/dialog";
import dialogManifest from "@myoutside/dialog/manifest.json";
import { goApp } from "@myoutside/go";
import goManifest from "@myoutside/go/manifest.json";
import { vocabApp } from "@myoutside/vocab";
import vocabManifest from "@myoutside/vocab/manifest.json";
import { createZheyeApp } from "@myoutside/zheye";
import zheyeManifest from "@myoutside/zheye/manifest.json";

/**
 * 上服务器的子应用（docs/future/web-version.md §1）：只用数据库和平台 AI 的「云端应用」。
 * 纯蓝、网易云下载要用某台电脑上的东西，留在本地 Electron（第 4 步再接）。
 */
export const CLOUD_APP_IDS = ["vocab", "dialog", "go", "zheye"] as const;

export interface CloudAppsOptions {
  /** 仓库根目录（开发）或发布目录（服务器）：界面文件、哲野的配方从这里读 */
  root: string;
}

/** 给一个用户的内核注册云端应用；每个用户各建一份模块实例（哲野有进行中的试跑等实例内状态） */
export function registerCloudApps(kernel: Kernel, options: CloudAppsOptions): void {
  kernel.registerApp(vocabApp, vocabManifest);
  kernel.registerApp(dialogApp, dialogManifest);
  kernel.registerApp(goApp, goManifest);
  kernel.registerApp(createZheyeApp({ recipesDir: join(options.root, "apps", "zheye", "recipes") }), zheyeManifest);
}

/** 应用 id → 界面目录 */
export function cloudAppUiDirs(root: string): Record<string, string> {
  return Object.fromEntries(CLOUD_APP_IDS.map((id) => [id, join(root, "apps", id, "ui")]));
}
