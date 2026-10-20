# Prompt for the next AI assistant (ChatGPT): Sunnyvale Study, next steps

You're taking over a project from Claude. Read **`HANDOVER.md`** in this repo first. It explains the person, the design, the code layout, how to publish, and every decision so far. Then do the work below.

- Repo: https://github.com/p0champ/sunnyvale-study (the live app is at https://p0champ.github.io/sunnyvale-study/)
- Main code: `index.html` (a single-file three.js WebXR app). Local copy: `F:\QuestStudySpace`.

## Ground rules
1. The user has **never coded**. Explain everything in plain language, one step at a time, and do all the technical work yourself.
2. **Discuss design before you build.** Propose, ask one question at a time, and wait for a clear "yes". Bug fixes they've asked for can just be done.
3. Test on the PC first (`python -m http.server 8123 --directory F:\QuestStudySpace`, then open localhost:8123; test keys M/S/C/W). Then commit, push, and tell them to refresh on the Quest.
4. **Never put secrets or personal data in the repo** (it's public): no API keys, passwords, or Barbera's phone number. Those live in the page's settings box (localStorage) or in a local config file that's gitignored.
5. Keep crediting the CC-BY models in `CREDITS.md`.
6. Don't create accounts or enter passwords for the user. They do sign-ins themselves.

## Where things stand (what the user said after testing)
- They **love the Tony Stark tools** (holo workbench, wrist timer, air drawing, flashcards, mind maps, timelines, fist-pull / resize / flick-to-stash).
- **Problem 1: leaving the world to open a website makes it useless for studying.** Right now the Claude button and the Barbera (WhatsApp) button end the XR session and open the page outside. They want **real browser windows inside the world**, and they want **Claude to be able to interact with them**.
- **Problem 2: they can only open the built-in example tools.** They have no way to make their **own** flashcards, mind maps, timelines or windows.
- **They have a Claude subscription (Pro/Max), not an API key.** Subscription sign-in for third-party apps isn't available, so any in-world Claude has to go through something they're allowed to use with a subscription (claude.ai itself, or a claude.ai custom connector; see Task 1).
- Not yet confirmed on the Quest: whether the park still lags after the last speed fixes, and how the gestures feel.

## Task 1: Real browsers inside the world (highest priority)
WebXR can't render real websites into 3D (cross-origin iframes can't be drawn to WebGL, and Quest Browser has no DOM layers in immersive mode). Present these options to the user in plain words and **recommend A**:

**A. The "browser bridge" (keeps the current web app):**
- A small **Node.js app** on the user's Windows PC runs **Playwright (or Puppeteer) with real Chromium**, using a persistent profile so logins stick (claude.ai, YouTube, Google Docs, school portals).
- It streams each tab to the headset over a **WebSocket**, using CDP `Page.startScreencast` (JPEG frames) drawn onto a canvas texture on a holographic panel. Target 20–30 fps at 1280×800, and reduce quality while frames queue.
- **Input:** the hand ray or fingertip hits the panel, which gives a UV coordinate. Map that to page coordinates and send `Input.dispatchMouseEvent` (move/down/up/wheel). A **holographic keyboard** panel sends `Input.insertText` / `dispatchKeyEvent`. Add back/forward/reload/URL bar buttons, plus a "new tab" button that opens another panel.
- **Connecting:** the Quest and PC are on the same Wi-Fi. WebXR needs HTTPS and the WebSocket needs `wss://`, so use a tunnel (e.g. Cloudflare Tunnel or Tailscale Funnel) or a local HTTPS certificate. Add a pairing code or token so nobody else can drive the browser. Make startup one double-click (a `.bat` file) for a non-coder.
- **Audio:** start with video playback muted on the PC. Optionally forward tab audio later with WebRTC.
- **Claude interacting with the world (subscription-friendly):** build a small **MCP server** (inside the same bridge app) that exposes world tools: `open_window`, `update_window`, `close_window`, `add_note`, `create_mind_map`, `create_timeline`, `make_flashcards`, `clear_desk`, `list_windows`, and browser tools such as `open_url`, `read_page_text`, `click`, `type`, `screenshot`. The bridge forwards these to the headset page over the same WebSocket (the page already has `runClaudeTool(name, input)`, so reuse it). Expose the MCP server at an HTTPS URL with auth, and have the user add it in **claude.ai → Settings → Connectors → Add custom connector** (a Pro/Max feature). Then the user talks to Claude in the **claude.ai panel inside the world**, and Claude can open windows and mind maps in their space and read or control the in-world browser tabs. Check Anthropic's current docs on custom connectors / remote MCP before building, because the details change.
- **Barbera:** with in-world browser panels, the heart button can open **web.whatsapp.com** in a panel (log in once with a QR code) instead of leaving the world. Note that WhatsApp Web can't make voice calls in a browser, so keep "leave the world and open the WhatsApp app" as the "Call" option.

**B. A native Quest app** (for example with **Meta Spatial SDK**, which has real Android WebView panels, passthrough and hand tracking): better browsers and smoother performance, but a full rewrite in Kotlin with sideloading. Mention it as the long-term option.

**C. Unity + a WebView plugin (e.g. Vuplex, paid):** also a full rewrite.

Build A in small steps and test each with the user: (1) one streamed tab you can look at, (2) clicking and scrolling, (3) the keyboard, (4) several tabs, (5) the MCP connector for claude.ai, (6) WhatsApp Web.

## Task 2: Let the user make their own tools
Discuss the design with the user first. A suggested plan:
- A **Create** button in the palm menu, which opens a holographic builder: pick a type (window / flashcards / mind map / timeline), then fill it in.
- **Text input in VR:** a holographic keyboard (reuse the one from Task 1), plus voice dictation if `SpeechRecognition` exists in Quest Browser (test it).
- **Builder on the 2D page:** simple forms before entering VR, for typing on the PC or phone.
- **Import from Claude:** a "Copy prompt" button that copies a ready-made prompt ("Make flashcards about ___ in this JSON format: …") for claude.ai, and an "Import" box where the JSON is pasted. Once the Task 1 connector exists, Claude can create them directly.
- A **Library** button: everything the user makes is saved (localStorage, with an option to export/import a JSON file), and they can spawn, edit, rename or delete items.
- **Remember layouts:** save every open object's position, size and content, and restore it next time. Optionally use WebXR anchors so things stay put in the real room in Stark mode. Support named workspaces (e.g. "Film history", "Exam prep").
- Editing an existing object: tap and hold it to get Edit / Duplicate / Delete.

## Task 3: Show the user these 20 tool ideas, and let them pick
1. **Film clip player:** load video files onto a holo screen or the drive-in bedsheet, with frame-by-frame scrubbing, slow motion and loop A–B.
2. **Shot analyzer overlay:** rule-of-thirds and golden-ratio grids, aspect-ratio masks (2.39, 1.85, 4:3) and a shot-length counter over a paused frame.
3. **Storyboard wall:** grab frames from a clip, arrange them in sequence on a wall, and add notes per shot.
4. **Holographic PDF reader** (pdf.js) for course readings, with highlight → notes.
5. **Spaced-repetition flashcards:** cards come back at smart intervals, and Jarvis reminds you of the daily review.
6. **Study stats hologram:** a 3D bar chart on the workbench of time studied per subject, streaks and focus sessions.
7. **Voice memos in space:** record a quick audio note and pin it in the air, then tap it to replay.
8. **Sticky notes on real walls:** in Stark mode, stick notes to your real walls and desk (WebXR plane detection and anchors).
9. **3D model viewer:** inspect glTF models (camera rigs, film sets, props) with two-handed rotate and zoom.
10. **Quiz arena:** a timed multiple-choice quiz show hosted by Jarvis, with a Sunnyvale version where Ricky mangles the questions.
11. **Essay outliner:** drag idea cards into an outline tree, then export it to a document.
12. **Deadline countdown:** assignment due dates on your wrist display and on the workbench (import a calendar `.ics` file).
13. **Film comparison matrix:** a holographic table comparing films side by side (director, year, techniques, themes).
14. **Color palette extractor:** pull the dominant colors from a paused frame to study color grading.
15. **Sound lab:** a waveform and spectrum visualizer for a clip's audio, for studying diegetic vs non-diegetic sound.
16. **Explode a text:** paste a long reading, and Claude breaks it into a constellation of key ideas you can walk through.
17. **PC screen mirror:** show your PC screen on a holo panel (WebRTC screen share), to use any desktop app while in VR.
18. **Study buddy room:** invite Barbera or a classmate as a simple avatar to study together (WebRTC voice + positions).
19. **Holo whiteboard:** shapes, arrows and connectors snapped to a board, with saving.
20. **Break buddy:** Jarvis check-ins during long sessions (stretch, water, posture), plus a lo-fi or rain "focus radio" on the record player.

## The girlfriend's WhatsApp button (must keep working)
- The user's girlfriend is **Brenda**. The heart button is currently labelled "BARBERA", so ask the user whether it should say "BRENDA".
- Her number must **never** go in the repo, the code or any file that gets pushed, because the repo and site are public. The user has her number and will give it to you directly if needed.
- It works today if the user types her number (with country code, digits only) into **Claude settings → WhatsApp number** on the page, on the Quest itself, and presses Save. It stays saved in that browser.
- When you build the PC bridge (Task 1), you can also keep her number in a **gitignored** local config file on the PC (e.g. `bridge/private.json`, added to `.gitignore`) that the bridge serves to the headset over its authenticated connection, so it's set up automatically without being public.

## Do this first
1. Read `HANDOVER.md` and skim `index.html`.
2. Ask the user how the latest version runs on the Quest (lag, gestures).
3. Explain Task 1 options A/B/C simply, recommend A, and get a yes.
4. Build Task 1 step by step, then Task 2, then whichever Task 3 ideas the user picks.
5. Keep `HANDOVER.md` updated as you go, so the next assistant (or Claude) can continue.
