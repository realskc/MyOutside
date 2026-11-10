/* 纯蓝的 MIDI 合成器（66CCFF-0015）：跟着播放器的时间排音，在混音用的同一个 AudioContext 里发一个像钢琴的声音。
   时间、慢放、跳转、循环都以播放器为准：每次 tick 传入播放器的当前时间，时间往回跳或往前跳太多就重新排。 */
(() => {
  "use strict";

  /** 前台每 25 毫秒排一次，提前 0.3 秒；窗口隐藏时定时器大约一秒才跑一次，提前 1.6 秒 */
  const LOOKAHEAD = 0.3;
  const HIDDEN_LOOKAHEAD = 1.6;
  const MAX_VOICES = 96;

  function createMidiSynth(context) {
    const output = context.createGain();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    const bus = context.createGain();
    bus.gain.value = 0.5;
    bus.connect(compressor).connect(output);

    /** 按开始时间排好的音符：{ time, duration, midi, velocity } */
    let notes = [];
    let index = 0;
    let scheduledUntil = -1;
    let lastTime = 0;
    let lastRate = 1;
    /** 重新排之后，等播放器的时间真的走起来再排：刚开始播、刚跳转时时间会停几十毫秒，照着停住的时间排，第一个音会早 */
    let waitFrom = null;
    const voices = [];

    function lowerBound(time) {
      let lo = 0;
      let hi = notes.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (notes[mid].time < time) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    }

    function stopAll() {
      while (voices.length > 0) voices.pop().stop();
    }

    /** 一个音：三角波 + 高八度正弦，起音很快、按音高衰减（越高越快），松开后短释音 */
    function voice(midi, velocity, at, duration) {
      if (voices.length >= MAX_VOICES) voices.shift().stop();
      const frequency = 440 * 2 ** ((midi - 69) / 12);
      const peak = 0.16 * (0.25 + 0.75 * Math.max(0, Math.min(1, velocity)));
      const decay = Math.max(0.25, 1.8 - (midi - 48) * 0.025);
      const end = at + duration;
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(peak, at + 0.006);
      envelope.gain.setTargetAtTime(peak * 0.25, at + 0.006, decay / 3);
      envelope.gain.setTargetAtTime(0, end, 0.07);
      const body = context.createOscillator();
      body.type = "triangle";
      body.frequency.value = frequency;
      const shine = context.createOscillator();
      shine.type = "sine";
      shine.frequency.value = frequency * 2;
      const shineGain = context.createGain();
      shineGain.gain.value = 0.25;
      body.connect(envelope);
      shine.connect(shineGain).connect(envelope);
      envelope.connect(bus);
      const stopAt = end + 0.5;
      body.start(at);
      shine.start(at);
      body.stop(stopAt);
      shine.stop(stopAt);
      const handle = {
        stop() {
          const now = context.currentTime;
          envelope.gain.cancelScheduledValues(now);
          envelope.gain.setTargetAtTime(0, now, 0.015);
          try {
            body.stop(now + 0.08);
            shine.stop(now + 0.08);
          } catch {
            /* 已经停了 */
          }
        },
      };
      voices.push(handle);
      body.addEventListener("ended", () => {
        const at = voices.indexOf(handle);
        if (at >= 0) voices.splice(at, 1);
        envelope.disconnect();
      });
    }

    return {
      /** 接到混音里（纯蓝把它接在「MIDI」那一轨的音量节点上） */
      output,

      /** 要放的音符（所有显示中的、有音高的轨合在一起） */
      setNotes(list) {
        notes = list.slice().sort((a, b) => a.time - b.time);
        stopAll();
        scheduledUntil = -1;
      },

      /**
       * 播放器每隔一会儿调一次：没在播就全部停下；在播就把接下来一小段的音排进 AudioContext。
       * 刚开始播、往回跳、往前跳超过半秒、换了速度时，从当前时间重新排（正在响的音不补）。
       */
      tick({ playing, time, rate }) {
        if (!playing) {
          if (voices.length > 0) stopAll();
          scheduledUntil = -1;
          waitFrom = null;
          lastTime = time;
          return;
        }
        const speed = rate > 0 ? rate : 1;
        if (scheduledUntil < 0 || time < lastTime - 0.05 || time > scheduledUntil + 0.5 || speed !== lastRate) {
          stopAll();
          // 往回多算 30 毫秒：从某个音的开头开始播（小节线、循环的 A 点）时，第一次排音前播放器可能已经走过了一点点
          scheduledUntil = time - 0.03;
          index = lowerBound(scheduledUntil);
          waitFrom = time;
        }
        lastTime = time;
        lastRate = speed;
        if (waitFrom !== null) {
          if (Math.abs(time - waitFrom) < 1e-4) return;
          waitFrom = null;
        }
        const horizon = time + (document.hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD) * speed;
        while (index < notes.length && notes[index].time < horizon) {
          const note = notes[index];
          index += 1;
          // 已经过去的音不补（窗口隐藏时等得久，否则会一下子全响）
          if (note.time < scheduledUntil || note.time < time - 0.03) continue;
          const at = context.currentTime + Math.max(0, (note.time - time) / speed);
          voice(note.midi, note.velocity, at, Math.max(0.05, note.duration / speed));
        }
        scheduledUntil = Math.max(scheduledUntil, horizon);
      },

      stop() {
        stopAll();
        scheduledUntil = -1;
      },

      /** 点琴键或音符时试听一下 */
      audition(midi, velocity = 0.8) {
        voice(midi, velocity, context.currentTime + 0.005, 0.6);
      },
    };
  }

  window.createMidiSynth = createMidiSynth;
})();
