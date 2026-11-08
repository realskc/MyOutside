import { existsSync, mkdtempSync, statSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Midi } from "@tonejs/midi";
import { createKernel, type Kernel } from "@myoutside/kernel";
import { createNodeSqliteAdapter } from "@myoutside/kernel-node";
import { afterEach, describe, expect, it } from "vitest";
import { createX66CCFFApp } from "../backend/src/index.js";
import { findMediaTool } from "../backend/src/media.js";

const cleanup: string[] = [];

function setup(): { kernel: Kernel; dataDir: string } {
  const dataDir = mkdtempSync(join(tmpdir(), "66CCFF-test-"));
  cleanup.push(dataDir);
  const storage = createNodeSqliteAdapter({ path: ":memory:" });
  const kernel = createKernel({ storage });
  kernel.registerApp(createX66CCFFApp({ dataDir }));
  kernel.start();
  return { kernel, dataDir };
}

async function call<T>(kernel: Kernel, name: string, payload?: unknown): Promise<T> {
  const res = await kernel.handle({ call: name, payload });
  if (!res.ok) throw new Error(`${res.error.code}: ${res.error.message}`);
  return res.result as T;
}

async function raw(kernel: Kernel, name: string, payload?: unknown) {
  return kernel.handle({ call: name, payload });
}

afterEach(() => {
  while (cleanup.length > 0) {
    const dir = cleanup.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("66CCFF backend", () => {
  it("FFMPEG_PATH 可以覆盖媒体工具路径", () => {
    const fake = join(tmpdir(), `66CCFF-ffmpeg-${Date.now()}`);
    writeFileSync(fake, "");
    const previous = process.env.FFMPEG_PATH;
    try {
      process.env.FFMPEG_PATH = fake;
      expect(findMediaTool("ffmpeg")).toBe(fake);
    } finally {
      if (previous === undefined) delete process.env.FFMPEG_PATH;
      else process.env.FFMPEG_PATH = previous;
      rmSync(fake, { force: true });
    }
  });

  it("readMidi 返回秒制音符和轨道", async () => {
    const { kernel, dataDir } = setup();
    const midi = new Midi();
    midi.addTrack().addNote({ midi: 60, time: 1, duration: 0.5, velocity: 0.8 });
    const file = join(dataDir, "test.mid");
    writeFileSync(file, Buffer.from(midi.toArray()));
    const result = await call<{
      name: string;
      duration: number;
      tracks: Array<{ name: string; notes: Array<{ midi: number }> }>;
    }>(kernel, "66CCFF.readMidi", { path: file });
    expect(result.name).toBe("test.mid");
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0]?.notes[0]?.midi).toBe(60);
  });

  it("引擎未安装时状态为 not ready", async () => {
    const { kernel } = setup();
    const status = await call<{ ready: boolean; pythonPath: string | null; setupCommand: string }>(
      kernel,
      "66CCFF.getEngineStatus",
      {},
    );
    expect(status.ready).toBe(false);
    expect(status.pythonPath).toBeNull();
    expect(status.setupCommand).toContain(
      process.platform === "darwin" ? "setup-engine-macos.sh" : "setup-engine.ps1",
    );
  });

  it("曲目 CRUD：写入 / 列表 / 详情 / 删除", async () => {
    const { kernel, dataDir } = setup();
    const trackDir = join(dataDir, "tracks", "t1");
    mkdirSync(trackDir, { recursive: true });
    writeFileSync(join(trackDir, "source.wav"), "fake");

    await call(kernel, "66CCFF.insertTrack", {
      id: "t1",
      title: "测试曲目",
      file: "tracks/t1/source.wav",
      ext: "wav",
      size: 4,
      duration: 12.5,
    });

    const tracks = await call<Array<{ id: string; title: string; stemCount: number }>>(
      kernel,
      "66CCFF.listTracks",
      {},
    );
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({ id: "t1", title: "测试曲目", stemCount: 0 });

    const detail = await call<{ id: string; duration: number; stems: unknown[]; job: null }>(
      kernel,
      "66CCFF.getTrack",
      { trackId: "t1" },
    );
    expect(detail.id).toBe("t1");
    expect(detail.duration).toBe(12.5);
    expect(detail.stems).toEqual([]);
    expect(detail.job).toBeNull();

    await call(kernel, "66CCFF.deleteTrackTx", { trackId: "t1" });
    expect(await call<unknown[]>(kernel, "66CCFF.listTracks", {})).toHaveLength(0);
  });

  it("importTrack 复制文件到应用目录并写入曲目", async () => {
    const { kernel, dataDir } = setup();
    const source = join(dataDir, "incoming.wav");
    writeFileSync(source, "fake audio");

    const track = await call<{ id: string; title: string; file: string }>(kernel, "66CCFF.importTrack", {
      path: source,
      title: "导入测试",
    });
    expect(track.title).toBe("导入测试");
    expect(track.file.startsWith("tracks/")).toBe(true);
    expect(existsSync(join(dataDir, track.file))).toBe(true);
    expect(statSync(join(dataDir, track.file)).size).toBe(10);

    const imported = await call<{ file: string }>(kernel, "66CCFF.getTrack", { trackId: track.id });
    expect(imported.file).toBe(track.file);
  });

  it("不支持的文件格式被拒绝", async () => {
    const { kernel, dataDir } = setup();
    const source = join(dataDir, "notes.txt");
    writeFileSync(source, "hi");
    const result = await raw(kernel, "66CCFF.importTrack", { path: source });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("引擎缺失时拒绝分离", async () => {
    const { kernel, dataDir } = setup();
    const source = join(dataDir, "song.mp3");
    writeFileSync(source, "fake");
    const track = await call<{ id: string }>(kernel, "66CCFF.importTrack", { path: source });
    const result = await raw(kernel, "66CCFF.startSeparation", { trackId: track.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PRECONDITION");
  });
});
