import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
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

  it("readMidi 按速度表算出拍和小节线：没有拍号按 4/4，中途变速后拍距跟着变", async () => {
    const { kernel, dataDir } = setup();
    const midi = new Midi();
    const ppq = midi.header.ppq;
    midi.header.setTempo(120); // 每拍 0.5 秒
    midi.header.tempos.push({ ticks: ppq * 8, bpm: 60 }); // 两小节后变成每拍 1 秒
    midi.header.update();
    midi.addTrack().addNote({ ticks: ppq * 11, durationTicks: ppq, midi: 60, velocity: 0.8 });
    const file = join(dataDir, "tempo.mid");
    writeFileSync(file, Buffer.from(midi.toArray()));
    const result = await call<{ grid: { beats: number[]; bars: number[] } }>(kernel, "66CCFF.readMidi", { path: file });
    expect(result.grid.beats.slice(0, 10)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5]);
    expect(result.grid.bars.slice(0, 3)).toEqual([0, 2, 4]);
  });

  it("readMidi 去掉 MuScriptor 为对齐小节线加的延后：音符和拍都回到原音频的时间（66CCFF-0016）", async () => {
    const { kernel, dataDir } = setup();
    const midi = new Midi();
    midi.header.setTempo(120);
    // MuScriptor 的写法：所有音符延后 0.4 秒让第一个强拍落在小节线上，并在第一轨记一个 marker
    midi.header.meta.push({ type: "marker", text: "muscriptor:bar_offset=0.4000", ticks: 0 });
    const track = midi.addTrack();
    track.addNote({ midi: 60, time: 1.4, duration: 0.5, velocity: 0.8 });
    track.addNote({ midi: 64, time: 4.4, duration: 0.5, velocity: 0.8 });
    const file = join(dataDir, "muscriptor.mid");
    writeFileSync(file, Buffer.from(midi.toArray()));
    const result = await call<{
      duration: number;
      grid: { beats: number[]; bars: number[] };
      tracks: Array<{ notes: Array<{ time: number; duration: number }> }>;
    }>(kernel, "66CCFF.readMidi", { path: file });
    expect(result.tracks[0]?.notes[0]?.time).toBeCloseTo(1, 6);
    expect(result.tracks[0]?.notes[0]?.duration).toBeCloseTo(0.5, 6);
    expect(result.tracks[0]?.notes[1]?.time).toBeCloseTo(4, 6);
    expect(result.duration).toBeCloseTo(4.5, 6);
    expect(result.grid.beats.slice(0, 3).map((value) => Math.round(value * 1000) / 1000)).toEqual([-0.4, 0.1, 0.6]);
    expect(result.grid.bars[1]).toBeCloseTo(1.6, 6);
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

  // —— 转 MIDI（66CCFF-0012） ——

  /** 一段合法的静音 WAV，ffmpeg 混合两条轨时要读得懂 */
  function silentWav(seconds: number): Buffer {
    const dataSize = 44100 * 2 * 2 * seconds;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write("WAVEfmt ", 8);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(2, 22);
    buffer.writeUInt32LE(44100, 24);
    buffer.writeUInt32LE(44100 * 4, 28);
    buffer.writeUInt16LE(4, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write("data", 36);
    buffer.writeUInt32LE(dataSize, 40);
    return buffer;
  }

  /**
   * 一首已分离的曲目 + 假的转写引擎（MuScriptor 和 GAME 各一个）：假 python 打印进度、把准备好的 MIDI 写到输出、
   * 记下收到的参数
   */
  async function setupTranscription() {
    const dataDir = mkdtempSync(join(tmpdir(), "66CCFF-test-"));
    cleanup.push(dataDir);
    const engineDir = join(dataDir, "muscriptor-engine");
    const gameEngineDir = join(dataDir, "game-engine");
    const scriptsDir = join(dataDir, "scripts");
    mkdirSync(join(engineDir, "venv", "bin"), { recursive: true });
    mkdirSync(scriptsDir, { recursive: true });
    writeFileSync(join(scriptsDir, "transcribe_muscriptor.py"), "");
    writeFileSync(join(scriptsDir, "transcribe_game.py"), "");
    mkdirSync(join(gameEngineDir, "venv", "bin"), { recursive: true });
    mkdirSync(join(gameEngineDir, "GAME"), { recursive: true });
    mkdirSync(join(gameEngineDir, "models", "GAME-1.0-large"), { recursive: true });
    writeFileSync(join(gameEngineDir, "GAME", "infer.py"), "");
    writeFileSync(join(gameEngineDir, "models", "GAME-1.0-large", "model.pt"), "");
    const midi = new Midi();
    const track = midi.addTrack();
    track.addNote({ midi: 60, time: 0, duration: 0.5, velocity: 0.8 });
    track.addNote({ midi: 64, time: 0.5, duration: 0.5, velocity: 0.7 });
    const fixture = join(dataDir, "fixture.mid");
    writeFileSync(fixture, Buffer.from(midi.toArray()));
    const argsLog = join(dataDir, "args.txt");
    const python = join(engineDir, "venv", "bin", "python");
    writeFileSync(
      python,
      [
        "#!/bin/sh",
        `printf '%s\\n' "$@" > '${argsLog}'`,
        `echo '{"stage": "loading"}'`,
        `echo '{"stage": "transcribing", "completed": 1, "total": 2}'`,
        `cp '${fixture}' "$3"`,
        // 像真的 MuScriptor 那样多报音符数（跨分块延续的音符会被重复计数）：纯蓝必须以 MIDI 里的为准（66CCFF-0014）
        `echo '{"stage": "done", "notes": 99, "bpm": 96.0}'`,
      ].join("\n"),
    );
    chmodSync(python, 0o755);
    copyFileSync(python, join(gameEngineDir, "venv", "bin", "python"));
    chmodSync(join(gameEngineDir, "venv", "bin", "python"), 0o755);

    const kernel = createKernel({ storage: createNodeSqliteAdapter({ path: ":memory:" }) });
    kernel.registerApp(createX66CCFFApp({ dataDir, transcriptionEngineDir: engineDir, gameEngineDir, scriptsDir }));
    kernel.start();
    const stemsDir = join(dataDir, "tracks", "t1", "stems-j1");
    mkdirSync(stemsDir, { recursive: true });
    // 整首歌：两个引擎都在它上面检测节拍（66CCFF-0017）
    writeFileSync(join(dataDir, "tracks", "t1", "source.wav"), silentWav(1));
    await call(kernel, "66CCFF.insertTrack", { id: "t1", title: "白石溪", file: "tracks/t1/source.wav", ext: "wav", size: 4, duration: 1 });
    await call(kernel, "66CCFF.insertJob", { id: "j1", trackId: "t1" });
    const stems = (["piano", "guitar"] as const).map((kind) => {
      writeFileSync(join(stemsDir, `${kind}.wav`), silentWav(1));
      return { kind, file: `tracks/t1/stems-j1/${kind}.wav`, size: 1 };
    });
    await call(kernel, "66CCFF.finishJob", { jobId: "j1", trackId: "t1", stems });
    return { kernel, dataDir, argsLog, gameEngineDir };
  }

  const withHfToken = async (work: () => Promise<void>) => {
    const before = process.env.HF_TOKEN;
    process.env.HF_TOKEN = "test-token";
    try {
      await work();
    } finally {
      if (before === undefined) delete process.env.HF_TOKEN;
      else process.env.HF_TOKEN = before;
    }
  };

  it.skipIf(process.platform === "win32")(
    "转 MIDI：两条 stem 先混成一条，结果存进曲目、能读出音符、能删除",
    async () => {
      const { kernel, dataDir, argsLog } = await setupTranscription();
      await withHfToken(async () => {
        const status = await call<{ ready: boolean; instruments: string[] }>(kernel, "66CCFF.getTranscriptionEngineStatus", {});
        expect(status.ready).toBe(true);
        expect(status.instruments).toContain("acoustic_piano");

        const result = await call<{ transcriptionId: string; noteCount: number }>(kernel, "66CCFF.startTranscription", {
          trackId: "t1",
          stems: ["guitar", "piano"],
          instrument: "acoustic_piano",
        });
        expect(result.noteCount).toBe(2);
        // 两条轨：引擎收到的是混好的 input.wav，乐器只有一个
        const args = readFileSync(argsLog, "utf8").trim().split("\n");
        expect(args[1]).toMatch(/input\.wav$/);
        expect(args.slice(3, 5)).toEqual(["--instrument", "acoustic_piano"]);
        // 节拍在整首歌上检测（先解成 16kHz 单声道 WAV）
        expect(args[7]).toBe("--beats-audio");
        expect(args[8]).toMatch(/beats\.wav$/);

        const detail = await call<{ transcriptions: Array<Record<string, unknown>> }>(kernel, "66CCFF.getTrack", { trackId: "t1" });
        expect(detail.transcriptions).toHaveLength(1);
        expect(detail.transcriptions[0]).toMatchObject({
          status: "succeeded",
          stems: ["guitar", "piano"],
          engine: "muscriptor",
          instrument: "acoustic_piano",
          noteCount: 2,
          bpm: 96,
          file: `tracks/t1/midi/${result.transcriptionId}.mid`,
        });

        const data = await call<{ name: string; tracks: Array<{ notes: Array<{ midi: number }> }> }>(
          kernel,
          "66CCFF.readTranscription",
          { transcriptionId: result.transcriptionId },
        );
        expect(data.name).toBe("白石溪 · acoustic_piano");
        expect(data.tracks[0]!.notes.map((note) => note.midi)).toEqual([60, 64]);

        await call(kernel, "66CCFF.deleteTranscription", { transcriptionId: result.transcriptionId });
        expect(existsSync(join(dataDir, "tracks", "t1", "midi", `${result.transcriptionId}.mid`))).toBe(false);
        const after = await call<{ transcriptions: unknown[] }>(kernel, "66CCFF.getTrack", { trackId: "t1" });
        expect(after.transcriptions).toEqual([]);
      });
    },
  );

  it.skipIf(process.platform === "win32")("转 MIDI：没登录 HuggingFace、乐器不认识、没有这条轨时拒绝", async () => {
    const { kernel } = await setupTranscription();
    const before = process.env.HF_TOKEN;
    delete process.env.HF_TOKEN;
    const hfHome = process.env.HF_HOME;
    process.env.HF_HOME = join(tmpdir(), `66CCFF-no-hf-${Date.now()}`);
    try {
      const notLoggedIn = await raw(kernel, "66CCFF.startTranscription", { trackId: "t1", stems: ["piano"], instrument: "acoustic_piano" });
      expect(notLoggedIn.ok).toBe(false);
      if (!notLoggedIn.ok) expect(notLoggedIn.error.message).toContain("HuggingFace");
    } finally {
      if (before !== undefined) process.env.HF_TOKEN = before;
      if (hfHome === undefined) delete process.env.HF_HOME;
      else process.env.HF_HOME = hfHome;
    }
    await withHfToken(async () => {
      const unknown = await raw(kernel, "66CCFF.startTranscription", { trackId: "t1", stems: ["piano"], instrument: "kazoo" });
      expect(unknown.ok).toBe(false);
      const missing = await raw(kernel, "66CCFF.startTranscription", { trackId: "t1", stems: ["vocals"], instrument: "voice" });
      expect(missing.ok).toBe(false);
      if (!missing.ok) expect(missing.error.message).toContain("没有 vocals 轨");
    });
  });

  it.skipIf(process.platform === "win32")("转 MIDI（GAME，66CCFF-0017）：只转人声、不用登录 HuggingFace，节拍也在整首歌上检测", async () => {
    const { kernel, argsLog, gameEngineDir } = await setupTranscription();
    const before = process.env.HF_TOKEN;
    const hfHome = process.env.HF_HOME;
    delete process.env.HF_TOKEN;
    process.env.HF_HOME = join(tmpdir(), `66CCFF-no-hf-${Date.now()}`);
    try {
      const status = await call<{ ready: boolean; game: { ready: boolean; setupCommand: string } }>(
        kernel,
        "66CCFF.getTranscriptionEngineStatus",
        {},
      );
      expect(status.ready).toBe(false);
      expect(status.game.ready).toBe(true);

      const wrong = await raw(kernel, "66CCFF.startTranscription", {
        trackId: "t1",
        stems: ["piano"],
        engine: "game",
        instrument: "acoustic_piano",
      });
      expect(wrong.ok).toBe(false);
      if (!wrong.ok) expect(wrong.error.code).toBe("VALIDATION");

      const result = await call<{ transcriptionId: string; noteCount: number }>(kernel, "66CCFF.startTranscription", {
        trackId: "t1",
        stems: ["guitar", "piano"],
        engine: "game",
        instrument: "voice",
      });
      expect(result.noteCount).toBe(2);
      const args = readFileSync(argsLog, "utf8").trim().split("\n");
      expect(args[0]).toMatch(/transcribe_game\.py$/);
      expect(args[1]).toMatch(/input\.wav$/);
      expect(args.slice(3, 6)).toEqual(["--engine", gameEngineDir, "--beats-audio"]);
      expect(args[6]).toMatch(/beats\.wav$/);
      const detail = await call<{ transcriptions: Array<Record<string, unknown>> }>(kernel, "66CCFF.getTrack", { trackId: "t1" });
      expect(detail.transcriptions[0]).toMatchObject({ status: "succeeded", engine: "game", instrument: "voice", model: "game-large" });
    } finally {
      if (before !== undefined) process.env.HF_TOKEN = before;
      if (hfHome === undefined) delete process.env.HF_HOME;
      else process.env.HF_HOME = hfHome;
    }
  });

  it("正在转 MIDI 时不能重新分离（分轨文件会被换掉）", async () => {
    const { kernel } = await setupTranscription();
    await call(kernel, "66CCFF.insertTranscription", {
      id: "m1",
      trackId: "t1",
      stems: ["piano"],
      instrument: "acoustic_piano",
      model: "medium",
    });
    const result = await raw(kernel, "66CCFF.startSeparation", { trackId: "t1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("正在转 MIDI");
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
