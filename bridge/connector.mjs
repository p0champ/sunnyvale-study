// Claude connector: lets the user's own Claude (claude.ai, Claude Desktop or the phone app, on their
// subscription) control the Sunnyvale world through a remote MCP "custom connector".
//
// Security: every request must carry `Authorization: Bearer <secret>`. The secret lives only in
// bridge/private/connector.txt on this PC and is typed into Claude's connector settings by the user.
// Tools only work while a Sunnyvale page (Quest or PC) is connected and paired to this bridge, and
// browser tools only reach tabs that were opened in Sunnyvale.
import { timingSafeEqual } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { annotationsFor } from './tool-annotations.mjs';

const text = value => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] });
const failure = message => ({ content: [{ type: 'text', text: message }], isError: true });

export function createConnector({ secret, getConnection, log }) {
  const failures = [];
  // The secret can come in the Authorization header, or as part of the link: /mcp/<secret>
  // (simpler for the user: one link to paste into Claude's connector settings).
  function authorized(req) {
    const header = String(req.headers.authorization || '');
    const fromPath = String(req.url || '').split('?')[0].match(/^\/mcp\/([A-Za-z0-9_-]+)$/)?.[1];
    const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7).trim() : fromPath || '');
    const expected = Buffer.from(secret);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }
  function tooManyFailures() {
    const now = Date.now();
    while (failures.length && now - failures[0] > 60000) failures.shift();
    return failures.length >= 20;
  }
  function connection() {
    const c = getConnection();
    if (!c) throw Error('Sunnyvale is not connected. Ask the user to open Sunnyvale (on the Quest or PC) and connect it to the PC bridge first.');
    return c;
  }
  async function world(name, input = {}) {
    try {
      const answer = await connection().world(name, input);
      if (answer.startsWith('{"__image"')) {
        const { __image, text: words } = JSON.parse(answer);
        return { content: [{ type: 'image', data: __image, mimeType: 'image/jpeg' }, { type: 'text', text: words || '' }] };
      }
      return text(answer);
    } catch (e) { return failure(e.message); }
  }
  function tab(id) {
    const t = connection().tabs.get(id);
    if (!t) throw Error('No browser window with that id. Use list_browser_windows to see the open ones.');
    return t;
  }
  async function browser(action) {
    try { return await action(); } catch (e) { return failure(e.message); }
  }

  function buildServer() {
    const server = new McpServer({ name: 'sunnyvale-study', version: '1.0.0' }, {
      instructions: [
        "Controls the user's VR study space \"Sunnyvale Study\" on their Meta Quest 3. The user is writing a bachelor's thesis on propaganda in film.",
        "You can open windows (they scroll, so longer text is fine), notes, 3D mind maps, timelines, flashcards, storyboards and presentations; read and highlight PDFs from the user's library; collect quotes; build a bibliography (default style Harvard); play videos with timestamp pins and frame grabs; read and edit the live thesis document; manage deadlines; and use the real browser windows open in VR.",
        "Call list_windows to see what is open (and the ids) before changing things. When you talk about a window or a part of one, call point_at so your orb points at it. When walking the user through a timeline, point_at each event in turn (part = its number, starting at 0) and explain it.",
        "When the user argues a thesis point, raise the strongest objection and save it with add_counterargument. When the user says they're done for the day, call write_session_summary with what was done and what's next.",
        "If the user says 'this' or 'that' without saying what, call what_user_is_looking_at. Save quotable lines with highlight_passage (exact words from read_document) so they get a source and page.",
        "For exam practice, use start_exam, then exam_question and exam_feedback one question at a time. For feedback on the thesis, pin comment_paragraph cards (with suggested wording when useful) instead of rewriting it. While watching a clip, view_frame on grabs and log_shot each shot; for propaganda analysis, fill_checklist per scene with scores, evidence (timestamps, frame grabs, quotes) and a counter-reading for each question, then show the board with open_checklist (film, scene or compare view). When the user asks to tidy or set up the room, use arrange_windows.",
        "You can see the user's hand gestures with recent_gestures (including why an attempt didn't count). When the user asks how a gesture works or one isn't working, check recent_gestures and explain; to teach them, start gesture_tutorial and coach along. Pass seconds to show_message when a HUD message should stay longer.",
        "In browser windows, take a screenshot first and use its pixel coordinates for clicks. Ask the user before sending messages, posting, buying or submitting anything in a browser window."
      ].join(' ')
    });
    const shortText = z.string().max(20000);
    const register = server.registerTool.bind(server);
    server.registerTool = (name, config, handler) => register(name, { ...config, annotations: annotationsFor(name, config.annotations) }, handler);

    // ---------- World tools (they run inside the Sunnyvale page) ----------
    server.registerTool('list_windows', {
      title: 'List open windows', description: 'List every window and study object open in the world, with its id, type, title and text.',
      inputSchema: {}, annotations: { readOnlyHint: true }
    }, () => world('list_windows'));
    server.registerTool('open_window', {
      title: 'Open a window', description: 'Open a floating window next to the user with a title and plain text (about 120 words max, no markdown).',
      inputSchema: { title: z.string().max(120), body: shortText }
    }, input => world('open_window', input));
    server.registerTool('update_window', {
      title: 'Update a window', description: 'Replace the title and text of an open window.',
      inputSchema: { id: z.string(), title: z.string().max(120), body: shortText }
    }, input => world('update_window', input));
    server.registerTool('close_window', {
      title: 'Close a window', description: 'Close an open window or study object by id.',
      inputSchema: { id: z.string() }, annotations: { destructiveHint: true }
    }, input => world('close_window', input));
    server.registerTool('add_note', {
      title: 'Add a note', description: "Add a line to the user's Notes window (it's created if it isn't open).",
      inputSchema: { text: z.string().max(8000) }
    }, input => world('add_note', input));
    server.registerTool('create_mind_map', {
      title: 'Create a 3D mind map', description: 'Build a glowing 3D mind map in front of the user: a central topic with up to 8 branches, each with up to 4 short sub-points.',
      inputSchema: { title: z.string().max(60), branches: z.array(z.object({ label: z.string().max(40), children: z.array(z.string().max(40)).max(4) })).max(8) }
    }, input => world('create_mind_map', input));
    server.registerTool('create_timeline', {
      title: 'Create a timeline', description: 'Build a glowing timeline the user can walk along, with up to 16 events in order.',
      inputSchema: { title: z.string().max(60), events: z.array(z.object({ year: z.string().max(12), label: z.string().max(70) })).max(16) }
    }, input => world('create_timeline', input));
    server.registerTool('make_flashcards', {
      title: 'Make flashcards', description: 'Make a deck of holographic flashcards (a term or question on the front, a short answer on the back). Up to 30 cards.',
      inputSchema: { title: z.string().max(60), cards: z.array(z.object({ front: z.string().max(200), back: z.string().max(400) })).max(30) }
    }, input => world('make_flashcards', input));
    server.registerTool('clear_desk', {
      title: 'Clear the desk', description: "Put every open window and study object away into the user's stash (they can bring them back from the menu).",
      inputSchema: {}
    }, () => world('clear_desk'));
    server.registerTool('recent_gestures', {
      title: 'Recent hand gestures', description: "What the user's hands just did in VR: the last gesture events (palm menu, pinch-grab, two-hand resize, fist group-move, beckon, flick-minimise), each started / done / ignored, with the reason an attempt was ignored (e.g. 'a bit too slow'). Also how each gesture works and the gesture tutorial's progress. Use it to explain or troubleshoot gestures.",
      inputSchema: { count: z.number().int().min(1).max(60).optional() }, annotations: { readOnlyHint: true }
    }, input => world('recent_gestures', input));
    server.registerTool('gesture_tutorial', {
      title: 'Gesture tutorial', description: "Start a guided gesture walkthrough in VR: a card shows a moving drawing of each gesture, waits until the user does it, shows why an attempt didn't count, and moves on. gesture: one of palm-menu, pinch-grab, two-hand-resize, fist-group-move, beckon, flick-minimise, or 'all' (default). stop: true ends it. Follow along with recent_gestures and coach the user by voice.",
      inputSchema: { gesture: z.string().max(40).optional(), stop: z.boolean().optional() }
    }, input => world('gesture_tutorial', input));
    server.registerTool('delete_stashed', {
      title: 'Delete from the stash', description: "Permanently delete items the user put away in the stash, by id or title (list_windows shows the stashed items), or all of them with all: true. Only when the user asks: this can't be undone. A stashed browser window's real Chrome tab is released too.",
      inputSchema: { id: z.string().max(120).optional(), all: z.boolean().optional() }
    }, input => world('delete_stashed', input));
    server.registerTool('show_message', {
      title: 'Show a HUD message', description: 'Show a short message on the Jarvis HUD in front of the user (up to 3 short lines). It stays long enough to read (about 2.5 s + 0.3 s per word, 4-20 s); pass seconds to choose how long yourself, e.g. longer for something the user should keep in view while doing it.',
      inputSchema: { lines: z.array(z.string().max(40)).min(1).max(3), seconds: z.number().min(1).max(60).optional() }
    }, input => world('show_message', input));

    // ---------- Thesis and Jarvis tools (they run inside the Sunnyvale page) ----------
    const str = (n = 2000) => z.string().max(n), opt = t => t.optional(), num = z.number();
    const sourceFields = {
      kind: opt(z.enum(['book', 'article', 'chapter', 'film', 'web'])), title: opt(str(300)), authors: opt(z.array(str(120)).max(20)), year: opt(str(12)),
      publisher: opt(str(200)), place: opt(str(120)), journal: opt(str(200)), volume: opt(str(20)), issue: opt(str(20)), pages: opt(str(40)),
      url: opt(str(500)), doi: opt(str(200)), director: opt(str(120)), studio: opt(str(200)), edition: opt(str(40)), accessed: opt(str(20)), toRead: opt(z.boolean())
    };
    const studyTools = [
      ['stash_window', 'Put one window away into the stash (the user can bring it back from the menu).', { id: z.string() }],
      ['point_at', 'Make your avatar (the Claude spark) fly to a window and point at it. part (optional) = a timeline event number (from 0), a mind map branch name, or a thesis paragraph number.', { id: z.string(), part: opt(z.union([z.string(), z.number()])) }],
      ['what_user_is_looking_at', 'See what the user is looking at right now: the window in the middle of their view (id, title, text) plus a picture of the virtual view. The real room is not visible in the picture.', {}, true],
      ['list_library', "List the files in the user's library (PDFs, videos, images, 3D models). The user adds files on the Sunnyvale page.", {}, true],
      ['open_document', 'Open a PDF (or any library file) as a window, by name. Optional page.', { name: str(200), page: opt(num) }],
      ['read_document', 'Read the text of an open PDF window, pages from_page to to_page (defaults to the current page).', { id: z.string(), from_page: opt(num), to_page: opt(num) }, true],
      ['go_to_page', 'Turn an open PDF to a page.', { id: z.string(), page: num }],
      ['highlight_passage', 'Highlight a passage in an open PDF (use the exact words from read_document). It is saved as a quote with its source and page.', { id: z.string(), page: opt(num), text: str(3000), note: opt(str(500)) }],
      ['add_quote', 'Save a quote in the quote collector, optionally with a source id and page.', { text: str(3000), source_id: opt(z.string()), page: opt(num), note: opt(str(500)) }],
      ['list_quotes', 'List saved quotes with their in-text citations.', {}, true],
      ['open_quotes', 'Open the quote collector window.', {}],
      ['add_source', 'Add a source to the bibliography (book, article, chapter, film or web page).', sourceFields],
      ['update_source', 'Correct the details of a source.', { id: z.string(), ...sourceFields }],
      ['list_sources', 'List all sources with their formatted references.', {}, true],
      ['set_citation_style', 'Change the citation style: Harvard, APA, MLA or Chicago.', { style: z.enum(['Harvard', 'APA', 'MLA', 'Chicago']) }],
      ['cite', 'Get the in-text citation and full reference for a source (optionally with a page).', { source_id: z.string(), page: opt(num) }, true],
      ['open_bibliography', 'Open the bibliography window.', {}],
      ['open_video', 'Open a video from the library (by name) or a direct video URL, optionally at a time in seconds.', { name: opt(str(200)), url: opt(str(500)), time: opt(num) }],
      ['video_control', 'Control an open video: play, pause, seek (value = seconds) or speed (value = 0.25 to 2).', { id: z.string(), action: z.enum(['play', 'pause', 'seek', 'speed']), value: opt(num) }],
      ['pin_timestamp', 'Pin an important moment in a video (time in seconds; defaults to now) with a short label.', { id: z.string(), time: opt(num), label: str(80) }],
      ['list_pins', 'List the pinned moments of a video.', { id: z.string() }, true],
      ['grab_frame', 'Grab the current frame of a video as a still image the user can draw on, with an optional caption.', { id: z.string(), caption: opt(str(200)) }],
      ['annotate_frame', 'Change the caption of a frame grab.', { id: z.string(), caption: str(200) }],
      ['compare_videos', 'Open a second library video next to an open one, linked so they play together.', { first: z.string(), second: str(200) }],
      ['read_thesis', 'Read the live thesis document: title, word count and numbered paragraphs.', {}, true],
      ['edit_thesis', 'Edit the thesis: append, insert (at index), replace (index), delete (index) a paragraph, or set the title. heading=true makes it a heading. Edits can be undone by the user.', { action: z.enum(['append', 'insert', 'replace', 'delete', 'title']), index: opt(num), text: opt(str(20000)), heading: opt(z.boolean()) }],
      ['open_thesis', 'Open the thesis document window.', {}],
      ['export_thesis_to_google_docs', 'Export the thesis into a new Google Doc (opens docs.new in a VR browser window and types it in).', {}],
      ['add_deadline', 'Add a deadline (date as YYYY-MM-DD). It shows on the HUD.', { title: str(80), date: str(10) }],
      ['remove_deadline', 'Remove a deadline by id or title.', { id: z.string() }],
      ['list_deadlines', 'List upcoming deadlines with days left.', {}, true],
      ['write_session_summary', "Save a summary of today's session: what was done, and what's next. Shown at log off and in the next morning briefing.", { done: str(1500), next: str(1500) }],
      ['show_briefing', 'Show the morning briefing (deadlines, sources to read, last session, next steps).', {}],
      ['create_storyboard', 'Build a 3D storyboard of a scene: shot cards standing in an arc the user can walk around. frame_id (optional) puts a frame grab on the card.', { title: str(80), shots: z.array(z.object({ title: opt(str(60)), description: str(500), frame_id: opt(z.string()) })).max(16) }],
      ['make_presentation', 'Make a big presentation (teacher mode) for the user to rehearse: slides with a title, bullets and speaker notes.', { title: str(80), slides: z.array(z.object({ title: str(80), bullets: z.array(str(200)).max(8), notes: opt(str(500)) })).max(40) }],
      ['go_to_slide', 'Show a slide of a presentation (number from 0).', { id: z.string(), slide: num }],
      ['add_counterargument', "Save the strongest objection to one of the user's thesis claims (and optionally how to answer it) in the Counter-arguments window.", { claim: str(400), objection: str(800), response: opt(str(800)) }],
      ['start_exam', 'Start an exam rehearsal where you play the examiner: ask questions out loud one at a time with exam_question, listen, then add what to improve with exam_feedback. Finish with end_exam.', { topic: str(120), minutes_per_question: opt(num) }],
      ['exam_question', 'Show the next exam question (also ask it out loud) and restart its countdown.', { question: str(600), minutes: opt(num) }],
      ['exam_feedback', 'Add one concrete thing to improve about the answer (to the current question, or question = its number from 1).', { improve: str(400), question: opt(num) }],
      ['end_exam', 'Finish the exam rehearsal and show the summary and the full list of things to improve.', { summary: opt(str(1500)) }],
      ['comment_paragraph', 'Pin a comment card beside one thesis paragraph (number from 0, see read_thesis). Optionally give suggestion = full replacement wording; the user taps ACCEPT to use it, or DISMISS.', { index: num, comment: str(500), suggestion: opt(str(20000)) }],
      ['list_comments', 'List the open comment cards on the thesis.', {}, true],
      ['clear_comments', 'Remove all comment cards from the thesis.', {}],
      ['log_shot', 'Add a shot to the shot log of a video (the playing one if video is left out). time in seconds (default: where the video is now). Look at frame grabs with view_frame first.', { video: opt(str(200)), time: opt(num), shot_type: str(40), angle: opt(str(40)), movement: opt(str(40)), notes: opt(str(400)), frame_id: opt(str(40)) }],
      ['open_shot_log', 'Open the shot log window of a video (window id) or film title.', { video: opt(str(200)) }],
      ['list_shots', 'List the logged shots of a video (window id) or film title.', { video: opt(str(200)) }, true],
      ['view_frame', 'Look at a frame grab (returns the picture). Use the frame window id, or the frame_id from grab_frame.', { id: opt(z.string()), frame_id: opt(str(40)) }, true],
      ['fill_checklist', 'Analyse one scene for propaganda (opens the analysis board on it). For each question: enemy (how is the enemy shown?), music (what does the music do?), military (military cooperation: credits, hardware, advisers?), framing (which heroic framing?), message (what should the viewer feel or believe?), give answers (text), scores (0-5: how strongly the scene does it), evidence (per question a list of { time in seconds, frame_id from grab_frame, quote, note }) and counter (the strongest counter-reading). The same film and scene again updates it.', { film: str(120), scene: str(200), time: opt(num),
        answers: opt(z.object({ enemy: opt(str(600)), music: opt(str(600)), military: opt(str(600)), framing: opt(str(600)), message: opt(str(600)) })),
        scores: opt(z.object({ enemy: opt(z.number().min(0).max(5)), music: opt(z.number().min(0).max(5)), military: opt(z.number().min(0).max(5)), framing: opt(z.number().min(0).max(5)), message: opt(z.number().min(0).max(5)) })),
        evidence: opt(z.object(Object.fromEntries(['enemy', 'music', 'military', 'framing', 'message'].map(k => [k, opt(z.array(z.object({ time: opt(num), frame_id: opt(str(80)), quote: opt(str(400)), note: opt(str(160)) })).max(4))])))),
        counter: opt(z.object({ enemy: opt(str(400)), music: opt(str(400)), military: opt(str(400)), framing: opt(str(400)), message: opt(str(400)) })) }],
      ['open_checklist', 'Open the propaganda analysis board. view: film (radar of the averages + heat strip across the running time), scene (one scene in detail; the user can tap dots to change scores) or compare (two or three films on one radar, e.g. Top Gun vs Top Gun: Maverick).', { film: opt(str(120)), view: opt(z.enum(['film', 'scene', 'compare'])), films: opt(z.array(str(120)).max(3)), scene: opt(z.union([num, str(200)])) }],
      ['export_checklist', 'Write the propaganda analysis into the thesis (one paragraph per scene, or a film summary plus every scene), with an in-text citation if the film is in the sources, and save quoted evidence to the quote list. Scenes already exported are skipped unless again is true. Ask the user first.', { film: str(120), scene: opt(z.union([num, str(200)])), again: opt(z.boolean()) }],
      ['list_checklists', 'List every checked scene with its answers.', {}, true],
      ['arrange_windows', 'Move windows around the user. place: front, left, right, far-left, far-right, behind, above, below or desk. Windows sharing a place stand side by side. Ids come from list_windows.', { layout: z.array(z.object({ id: z.string(), place: z.enum(['front', 'left', 'right', 'far-left', 'far-right', 'behind', 'above', 'below', 'desk']) })).max(20) }],
    ];
    for (const [name, description, inputSchema, readOnly] of studyTools) {
      server.registerTool(name, { title: name.replace(/_/g, ' '), description, inputSchema, annotations: readOnly ? { readOnlyHint: true } : undefined }, input => world(name, input || {}));
    }
    // Future tools added to the Sunnyvale page can be used without restarting this bridge
    server.registerTool('list_study_tools', { title: 'List study tools', description: 'List every tool name the Sunnyvale page understands (including newer ones not listed here).', inputSchema: {}, annotations: { readOnlyHint: true } }, () => world('list_study_tools'));
    server.registerTool('use_study_tool', { title: 'Use a study tool', description: 'Use any Sunnyvale tool by name (see list_study_tools), with its input as an object.', inputSchema: { name: z.string(), input: z.record(z.string(), z.any()).optional() } }, ({ name, input }) => world(name, input || {}));

    // ---------- Browser windows (real Chrome tabs shown in VR) ----------
    server.registerTool('list_browser_windows', {
      title: 'List browser windows', description: 'List the real browser windows open in VR, with id, address and page size (in pixels used by screenshots and clicks).',
      inputSchema: {}, annotations: { readOnlyHint: true }
    }, () => browser(async () => text([...connection().tabs].map(([id, t]) => ({ id, url: safeURL(t), width: t.width, height: t.height })))));
    server.registerTool('open_browser_window', {
      title: 'Open a browser window', description: 'Open a web page as a new browser window inside VR (max four at once). Returns its id.',
      inputSchema: { url: z.string().url() }
    }, ({ url }) => browser(async () => text({ id: await connection().openTab(url) })));
    server.registerTool('screenshot_browser_window', {
      title: 'Look at a browser window', description: 'Take a screenshot of a browser window. Its pixel coordinates are the ones click_browser_window uses.',
      inputSchema: { id: z.string() }, annotations: { readOnlyHint: true }
    }, ({ id }) => browser(async () => {
      const t = tab(id);
      const shot = await t.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 70, captureBeyondViewport: false, fromSurface: true,
        clip: { x: 0, y: 0, width: t.width, height: t.height, scale: 0.5 } });
      return { content: [{ type: 'image', data: shot.data, mimeType: 'image/jpeg' }, { type: 'text', text: `Window ${id}: ${safeURL(t)} (${t.width}x${t.height})` }] };
    }));
    server.registerTool('click_browser_window', {
      title: 'Click in a browser window', description: 'Click at x,y (pixels from the top-left, as in the latest screenshot).',
      inputSchema: { id: z.string(), x: z.number(), y: z.number() }
    }, ({ id, x, y }) => browser(async () => { tab(id); await connection().run({ type: 'click', id, x, y }); return text('Clicked.'); }));
    server.registerTool('type_in_browser_window', {
      title: 'Type in a browser window', description: 'Type text into whatever is focused in the window (click a text box first). Set press_enter to submit.',
      inputSchema: { id: z.string(), text: z.string().max(8000), press_enter: z.boolean().optional() }
    }, ({ id, text: words, press_enter }) => browser(async () => {
      tab(id);
      await connection().run({ type: 'text', id, text: words });
      if (press_enter) await connection().run({ type: 'key', id, key: 'Enter' });
      return text('Typed.');
    }));
    server.registerTool('press_key_in_browser_window', {
      title: 'Press a key', description: 'Press one key in a browser window: Enter, Backspace, Tab, Escape, ArrowLeft or ArrowRight.',
      inputSchema: { id: z.string(), key: z.enum(['Enter', 'Backspace', 'Tab', 'Escape', 'ArrowLeft', 'ArrowRight']) }
    }, ({ id, key }) => browser(async () => { tab(id); await connection().run({ type: 'key', id, key }); return text('Pressed ' + key + '.'); }));
    server.registerTool('scroll_browser_window', {
      title: 'Scroll a browser window', description: 'Scroll a browser window. Positive amount scrolls down, negative scrolls up (about 400 is one screen).',
      inputSchema: { id: z.string(), amount: z.number().min(-1600).max(1600) }
    }, ({ id, amount }) => browser(async () => {
      const t = tab(id);
      await connection().run({ type: 'scroll', id, x: t.width / 2, y: t.height / 2, delta: amount });
      return text('Scrolled.');
    }));
    server.registerTool('go_to_address', {
      title: 'Go to a web address', description: 'Load a new web address in an existing browser window.',
      inputSchema: { id: z.string(), url: z.string().url() }
    }, ({ id, url }) => browser(async () => { tab(id); await connection().run({ type: 'navigate', id, url }); return text('Loading ' + url); }));
    server.registerTool('go_back', {
      title: 'Go back', description: 'Go back one page in a browser window.',
      inputSchema: { id: z.string() }
    }, ({ id }) => browser(async () => { tab(id); await connection().run({ type: 'back', id }); return text('Went back.'); }));
    return server;
  }

  return async function handle(req, res) {
    // A small visit log (never the secret itself) to troubleshoot Claude's connection.
    const hasAuth = !!req.headers.authorization, ok = authorized(req);
    res.on('finish', () => log?.(`${new Date().toISOString()} ${req.method} ${String(req.url).replace(/^\/mcp\/[^?]+/, '/mcp/<secret>')} auth:${hasAuth ? (ok ? 'correct' : 'WRONG') : 'missing'} -> ${res.statusCode}` +
      ` | version:${req.headers['mcp-protocol-version'] || '-'} | accept:${req.headers.accept || '-'} | rpc:${res.rpcMethod || '-'} | agent:${String(req.headers['user-agent'] || '-').slice(0, 60)}`));
    if (tooManyFailures()) { res.writeHead(429); res.end(); return; }
    if (!ok) {
      failures.push(Date.now());
      res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); res.end(); return; }
    let body;
    try { body = JSON.parse(await readBody(req, 1024 * 1024)); res.rpcMethod = Array.isArray(body) ? body.map(b => b.method).join(',') : body?.method; }
    catch { res.writeHead(400); res.end(); return; }
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });   // stateless
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  };
}

function safeURL(t) { try { return t.page.url(); } catch { return t.url || ''; } }
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
