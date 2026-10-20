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

const text = value => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] });
const failure = message => ({ content: [{ type: 'text', text: message }], isError: true });

export function createConnector({ secret, getConnection }) {
  const failures = [];
  function authorized(req) {
    const header = String(req.headers.authorization || '');
    const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7).trim() : '');
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
    try { return text(await connection().world(name, input)); } catch (e) { return failure(e.message); }
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
      instructions: "Controls the user's VR study space \"Sunnyvale Study\" on their Meta Quest 3: floating windows, notes, 3D mind maps, timelines, flashcards, and the real browser windows open in VR. Keep window text short (about 120 words per window); use several windows for bigger topics. Call list_windows to see what is open before changing things. In browser windows, take a screenshot first and use its pixel coordinates for clicks. Ask the user before sending messages, posting, buying or submitting anything in a browser window."
    });
    const shortText = z.string().max(4000);

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
      inputSchema: { text: z.string().max(500) }
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
    server.registerTool('show_message', {
      title: 'Show a HUD message', description: 'Flash a short message on the Jarvis HUD in front of the user (up to 3 short lines).',
      inputSchema: { lines: z.array(z.string().max(40)).min(1).max(3) }
    }, input => world('show_message', input));

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
    if (tooManyFailures()) { res.writeHead(429); res.end(); return; }
    if (!authorized(req)) {
      failures.push(Date.now());
      res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); res.end(); return; }
    let body;
    try { body = JSON.parse(await readBody(req, 1024 * 1024)); }
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
