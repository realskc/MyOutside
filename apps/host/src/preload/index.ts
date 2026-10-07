import { contextBridge, ipcRenderer } from "electron";

const outside = {
  call: (call: string, payload?: unknown) => ipcRenderer.invoke("kernel:call", { call, payload }),
  /** 用系统浏览器打开外链（仅 http/https） */
  openExternal: (url: string) => ipcRenderer.invoke("host:openExternal", url),
};

contextBridge.exposeInMainWorld("outside", outside);
