// Device speech, deliberately independent of Claude's between-tool narration.
import { englishVoice } from './study-utils.js';
export function createLecturePlayer({ speech, Utterance, go, slides, notice, language }) {
  let generation = 0, timer, running = false, index = 0;
  function stop() { const wasRunning = running; generation++; clearTimeout(timer); running = false; if (wasRunning) speech?.cancel(); }
  function start(from = 0) {
    stop();
    if (!speech || !Utterance) { notice('Lecture voice unavailable in this browser.'); return false; }
    const own = generation; running = true; index = from;
    function next() {
      if (own !== generation || !running) return;
      if (index >= slides.length) { running = false; notice('Lecture complete.'); return; }
      try { go(index, true); } catch { stop(); notice('Narration stopped: its target was closed or changed.'); return; }
      const slide = slides[index], words = slide.spoken_text || slide.notes || [slide.title, ...(slide.bullets || [])].join('. ');
      const utterance = new Utterance(words); utterance.lang = language;
      utterance.voice = englishVoice(speech.getVoices?.() || [], language);
      let began = false;
      utterance.onstart = () => { began = true; clearTimeout(timer); notice('Lecture playing · device voice'); };
      utterance.onerror = () => { if (own === generation) { stop(); notice('Voice paused. Tap PLAY LECTURE to retry.'); } };
      utterance.onend = () => {
        if (own !== generation || !running) return;
        clearTimeout(timer); index++;
        timer = setTimeout(next, Math.max(0, Math.min(10, Number(slide.pause_seconds) || 0)) * 1000);
      };
      timer = setTimeout(() => { if (!began && own === generation) { stop(); notice('Tap PLAY LECTURE to allow the device voice.'); } }, 5000);
      speech.speak(utterance);
    }
    next(); return true;
  }
  return {start, stop, get running() {return running;}};
}
