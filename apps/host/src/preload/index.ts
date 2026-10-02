import { contextBridge, ipcRenderer } from "electron";

const outside = {
  call: (call: string, payload?: unknown) => ipcRenderer.invoke("kernel:call", { call, payload }),
};

contextBridge.exposeInMainWorld("outside", outside);
