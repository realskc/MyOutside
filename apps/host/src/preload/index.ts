import { contextBridge, ipcRenderer } from "electron";

type EventListener = (event: unknown) => void;
const listeners = new Map<string, Set<EventListener>>();

ipcRenderer.on("kernel:event", (_event, message: { runId: string; event: unknown }) => {
  for (const listener of listeners.get(message.runId) ?? []) listener(message.event);
});

const outside = {
  /** 调用 API；传入 runId 时，执行过程中的事件可用 onEvent 订阅、可用 cancel 取消 */
  call: (call: string, payload?: unknown, options?: { runId?: string }) =>
    ipcRenderer.invoke("kernel:call", { call, payload, runId: options?.runId }),
  /** 生成一个新的运行 ID */
  newRunId: () => crypto.randomUUID(),
  /** 订阅某次调用推送的事件；返回取消订阅的函数 */
  onEvent: (runId: string, listener: EventListener) => {
    let set = listeners.get(runId);
    if (!set) {
      set = new Set();
      listeners.set(runId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) listeners.delete(runId);
    };
  },
  /** 取消一次进行中的调用 */
  cancel: (runId: string) => ipcRenderer.invoke("kernel:cancel", runId),
  /** 用系统浏览器打开外链（仅 http/https） */
  openExternal: (url: string) => ipcRenderer.invoke("host:openExternal", url),
};

contextBridge.exposeInMainWorld("outside", outside);
