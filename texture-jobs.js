// Separate expensive canvas paints with rendering opportunities and event-loop
// turns, so incoming audio can be scheduled while a large tool is building.
export function createTextureJobs() {
  let collecting = null;
  return {
    enqueue(paint) { if (collecting) collecting.push(paint); else paint(); },
    async build(build) {
      if (collecting) throw Error('A texture build is already in progress.');
      const jobs = []; collecting = jobs;
      let result;
      try { result = build(); } finally { collecting = null; }
      for (const paint of jobs) {
        await new Promise(resolve => {
          let done = false;
          const run = () => { if (done) return; done = true; clearTimeout(timer); resolve(); };
          const timer = setTimeout(run, 80); // hidden desktop previews also finish
          requestAnimationFrame(() => setTimeout(run, 0));
        });
        paint();
      }
      return result;
    }
  };
}
