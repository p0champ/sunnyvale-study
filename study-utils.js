const clean = value => String(value ?? '').trim();
const join = (parts, separator = ', ') => parts.map(clean).filter(Boolean).join(separator);
const sentence = value => { const s = clean(value); return s ? s + (/[.!?]["']?$/.test(s) ? '' : '.') : ''; };
const sentences = parts => parts.map(sentence).filter(Boolean).join(' ');
function person(value) {
  const s = clean(value);
  if (s.includes(',')) { const [last, ...first] = s.split(','); return { last: clean(last), first: clean(first.join(',')) }; }
  const words = s.split(/\s+/); return { last: words.pop() || '', first: words.join(' ') };
}
function authors(source, style) {
  const people = (source.authors?.length ? source.authors : source.director ? [source.director] : []).map(person).filter(p => p.last);
  if (style === 'MLA' || style === 'Chicago') return people.map((p, i) => i ? join([p.first, p.last], ' ') : join([p.last, p.first])).join(style === 'Chicago' ? ' and ' : ', and ');
  const values = people.map(p => join([p.last, p.first.split(/[\s-]+/).filter(Boolean).map(n => n[0].toUpperCase() + '.').join(' ')]));
  if (values.length < 2) return values[0] || '';
  return values.slice(0, -1).join(', ') + (style === 'APA' ? ', & ' : ' and ') + values.at(-1);
}
export function formatReference(source, style = 'Harvard') {
  const s = Object.fromEntries(Object.entries(source).map(([k,v]) => [k, typeof v === 'string' ? clean(v) : v]));
  const a = authors(s, style), y = s.year || 'n.d.', title = s.title || 'Untitled';
  const imprint = s.publisher ? join([s.place, s.publisher], ': ') : '';
  const filmImprint = s.studio ? join([s.place, s.studio], ': ') : '';
  const doi = s.doi ? (/^https?:\/\//.test(s.doi) ? s.doi : 'https://doi.org/' + s.doi.replace(/^doi:\s*/i, '')) : '';
  const pages = s.pages ? 'pp. ' + s.pages : '';
  if (style === 'APA') {
    if (s.kind === 'film') return sentences([a ? a + ' (Director)' : '', `(${y})`, title + ' [Film]', s.studio]);
    if (s.kind === 'article') return join([sentences([join([a, `(${y})`], ' '), title, join([s.journal, s.volume ? s.volume + (s.issue ? `(${s.issue})` : '') : s.issue ? `(${s.issue})` : '', s.pages])]), doi], ' ');
    if (s.kind === 'web') return join([sentences([join([a || s.publisher, `(${y})`], ' '), title, a ? s.publisher : '']), s.url], ' ');
    return sentences([join([a, `(${y})`], ' '), title + (s.edition ? ` (${s.edition} ed.)` : ''), s.kind === 'chapter' ? join([s.bookTitle ? 'In ' + s.bookTitle : '', pages]) : '', s.publisher]);
  }
  if (style === 'MLA') {
    if (s.kind === 'film') return sentences([title, join([s.director ? 'Directed by ' + s.director : a ? 'Directed by ' + a : '', s.studio, y])]);
    if (s.kind === 'article') return sentences([a, `"${title.replace(/\.$/, '')}."`, join([s.journal, s.volume ? 'vol. ' + s.volume : '', s.issue ? 'no. ' + s.issue : '', y, pages])]);
    if (s.kind === 'web') return sentences([a, `"${title.replace(/\.$/, '')}."`, join([s.publisher, y, s.url]), s.accessed ? 'Accessed ' + s.accessed : '']);
    return sentences([a, s.kind === 'chapter' ? `"${title.replace(/\.$/, '')}."` : title, join([s.kind === 'chapter' ? s.bookTitle : '', s.edition ? s.edition + ' ed.' : '', s.publisher, y, s.kind === 'chapter' ? pages : ''])]);
  }
  if (style === 'Chicago') {
    if (s.kind === 'film') return sentences([s.director ? s.director + ', dir' : a ? a + ', dir' : '', y, title, filmImprint]);
    if (s.kind === 'article') return sentences([a, y, `"${title.replace(/\.$/, '')}."`, join([join([s.journal, s.volume, s.issue ? `(${s.issue})` : ''], ' '), s.pages], ': ')]);
    if (s.kind === 'web') return sentences([a || s.publisher, y, `"${title.replace(/\.$/, '')}."`, s.url]);
    return sentences([a, y, title, s.kind === 'chapter' ? join([s.bookTitle ? 'In ' + s.bookTitle : '', pages]) : '', s.edition ? s.edition + ' ed' : '', imprint]);
  }
  if (s.kind === 'film') return sentences([`${title} (${y})`, s.director ? 'Directed by ' + s.director : a ? 'Directed by ' + a : '', '[Film]', filmImprint]);
  if (s.kind === 'article') return sentences([join([join([a, `(${y})`], ' '), `'${title}'`, join([s.journal, s.volume ? s.volume + (s.issue ? `(${s.issue})` : '') : s.issue ? `(${s.issue})` : '', pages])])]);
  if (s.kind === 'web') return sentences([join([a || s.publisher, `(${y})`, title], ' '), s.url ? 'Available at: ' + s.url + (s.accessed ? ` (Accessed: ${s.accessed})` : '') : '']);
  return sentences([join([a, `(${y})`, title], ' '), s.kind === 'chapter' ? join([s.bookTitle ? 'In ' + s.bookTitle : '', pages]) : '', s.edition ? s.edition + ' edn' : '', imprint]);
}

// An average over the last 100 ms ignores hand-tracking spikes and slow placement.
export function flickVelocity(samples, now) {
  const recent = samples.filter(s => now - s.t <= 120 && now - s.t >= 0);
  if (recent.length < 3) return null;
  const first = recent[0], last = recent.at(-1), seconds = (last.t - first.t) / 1000;
  if (seconds < .04 || now - last.t > 60) return null;
  const coords = p => Array.isArray(p) ? p : [p.x, p.y, p.z];
  const a = coords(first.p), b = coords(last.p), v = a.map((n,i) => (b[i] - n) / seconds);
  const distance = Math.hypot(...v) * seconds;
  const movingSteps = recent.slice(1).filter((sample, i) => {
    const start = coords(recent[i].p), end = coords(sample.p);
    const step = start.map((n,j) => end[j] - n);
    return Math.hypot(...step) > .008 && step.reduce((sum,n,j) => sum + n * v[j],0) > 0;
  }).length;
  if (movingSteps < 2) return null;
  return Math.hypot(...v) >= .8 && distance >= .055 ? v : null;
}

export function speechLanguage() {
  try { const lang = localStorage.getItem('sunnyvale.speechLanguage'); return ['en-US','en-GB'].includes(lang) ? lang : 'en-US'; }
  catch { return 'en-US'; }
}
export function englishVoice(voices, lang) { return voices.find(v => v.lang.toLowerCase() === lang.toLowerCase()) || voices.find(v => /^en[-_]/i.test(v.lang)) || null; }
