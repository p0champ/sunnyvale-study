import { appFixture } from "./app-fixture.mjs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
// Disposable Chromium only: bypass autoplay for generated, muted test tones.
// This does not exercise the real headset's user-activation permission.
const f = await appFixture({
  browserArgs: ["--autoplay-policy=no-user-gesture-required"],
});
try {
  await f.page.evaluate(async () => {
    const { BrowserMedia } = await import("/browser-media.js");
    window.testMedia = new BrowserMedia(
      () => {},
      () => {},
    );
    await testMedia.unlock();
    const context = testMedia.context,
      sink = context.createGain();
    sink.gain.value = 0;
    sink.connect(context.destination);
    const original = context.createBufferSource.bind(context);
    context.createBufferSource = () => {
      const n = original(),
        connect = n.connect.bind(n);
      n.connect = (target) =>
        connect(target === context.destination ? sink : target);
      return n;
    };
  });
  for (const batched of [false, true]) {
    const metrics = await f.page.evaluate(async (batched) => {
      const d = studyDebug;
      for (const p of [...d.workspace.allPanels()]) d.workspace.closeWindow(p);
      d.setMode("stark");
      d.look(0, 1.6, 0, 0, 1.5, -2);
      const original = d.workspace.buildTextures;
      const previousVoice = d.browserBridge.voiceActive;
      d.browserBridge.voiceActive = () => true;
      if (!batched) d.workspace.buildTextures = (fn) => fn();
      d.renderer.setAnimationLoop(d.animate);
      await new Promise((r) => setTimeout(r, 3500));
      const values = new Int16Array(2400);
      for (let i = 0; i < values.length; i++)
        values[i] = Math.sin((i / 24000) * Math.PI * 2 * 220) * 1800;
      const packet = btoa(
        String.fromCharCode(...new Uint8Array(values.buffer)),
      );
      testMedia.takeVoiceStats();
      let last = performance.now(),
        maxTimerGap = 0,
        pulses = 0;
      const timer = setInterval(() => {
          const now = performance.now();
          maxTimerGap = Math.max(maxTimerGap, now - last);
          last = now;
          pulses++;
        }, 20),
        sound = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(Date.now()),100)'],{type:'text/javascript'})));
      sound.onmessage=()=>testMedia.play('fixture',packet,24000);
      await new Promise((r) => setTimeout(r, 600));
      testMedia.takeVoiceStats();
      last = performance.now();
      maxTimerGap = 0;
      pulses = 0;
      const start = performance.now();
      for (let round = 0; round < 2; round++) {
        await d.worldTool("create_scene_cards", {
          title: "Pacing fixture " + round,
          scenes: Array.from({ length: 12 }, (_, i) => ({
            id: "s" + i,
            title: "Scene " + i,
            text: "Synthetic blocking and scene text. ".repeat(6),
          })),
        });
        await d.worldTool("create_source_constellation", {
          title: "Citation fixture " + round,
          sources: Array.from({ length: 12 }, (_, i) => ({
            id: "r" + i,
            title: "Source " + i,
            citations: i,
            cites: i ? ["r" + (i - 1)] : [],
          })),
        });
      }
      const elapsed = performance.now() - start;
      await new Promise((r) => setTimeout(r, 400));
      clearInterval(timer);
      sound.terminate();
      const voice = testMedia.takeVoiceStats();
      const rates = [...testMedia.timelines.values()]
        .flat()
        .map((p) => p.source.playbackRate.value);
      testMedia.stopAll();
      d.workspace.buildTextures = original;
      d.browserBridge.voiceActive = previousVoice;
      d.renderer.setAnimationLoop(null);
      return {
        rendered: true,
        batched,
        elapsed: Math.round(elapsed),
        maxTimerGap: Math.round(maxTimerGap),
        pulses,
        voice,
        ratesAllOne: rates.every((v) => v === 1),
      };
    }, batched);
    await writeFile(
      resolve(
        f.out,
        "build-d-pacing-" + (batched ? "after" : "before") + ".json",
      ),
      JSON.stringify(metrics, null, 2),
    );
    console.log(JSON.stringify(metrics));
  }
  if (f.errors.length) throw Error(f.errors.join("; "));
} finally {
  await f.close();
}
