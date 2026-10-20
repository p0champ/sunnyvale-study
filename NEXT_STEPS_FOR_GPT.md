# Continuation plan for Claude, GPT or the next assistant

Read `HANDOVER.md` first, especially **Start here: current checkpoint**, then `bridge/README.md`. This file replaces the earlier proposal to build the browser bridge from scratch. That bridge and its Chrome extension are already built; do not repeat the A/B/C pitch or ask the user to approve them again.

- Project: `F:QuestStudySpace`
- Repository: https://github.com/p0champ/sunnyvale-study
- Live app: https://p0champ.github.io/sunnyvale-study/
- Main world: `index.html`; browser frontend: `browser-bridge.js`; PC bridge: `bridge/`.

## Immediate next step: test the connected normal Chrome bridge

**User-confirmed:** in-world windows appeared in the original version; the Sunnyvale Browser Bridge extension is now installed in their ordinary Google Chrome and they have explicitly said it is connected. Do not repeat extension installation/pairing instructions unless troubleshooting requires them.

**Not yet confirmed:** real Claude/WhatsApp usability inside VR after replacing automated Chromium with normal Chrome. The old version had Claude bot-verification loops and a WhatsApp browser-update message; these motivated the replacement. Never claim that real sign-in or playback passed based only on fixture tests.

Continue simply, one user step at a time:
1. Have the user check Claude and WhatsApp are signed in on their PC's normal Chrome. They complete sign-ins/verification themselves; do not enter passwords, request credentials or handle verification for them.
2. Reconnect the Quest page to the current secure bridge address if needed. A bridge restart changed the temporary relay address, but the pairing code stayed the same. Current private link: `bridge/private/Open Sunnyvale.url`. Do not print its credential or put it in a public file. Only one Sunnyvale frontend can pair at once; disconnect the PC preview page, not the Chrome extension, before Quest connects.
3. Enter Sunnyvale and test Claude first, then the WhatsApp heart: stay in-world, load the normal signed-in tab, click, scroll and type. Check both modes and confirm readable text and hand input. Reuse the existing account sessions; do not copy the Chrome profile or cookies.
4. Check the right-wrist watch and Break menu on Quest. Right hand only; tracking loss hides the watch. Break has all six requested services, hides and closes its choices while `timer.running && timer.phase === 'focus'`, and returns when focus is paused or the timed break starts. Existing open media windows are not forcibly closed by focus mode.
5. Fix observed failures before proceeding. Shared tabs currently have no forwarded headset audio and are muted on PC while attached. Video playback on subscription services is unverified and protected content may not be captured; discuss actual limitations instead of promising all media works.

## Ground rules
- User has never coded. Use plain language and handle technical work. Ask one question at a time when a decision is needed.
- Ask before new design changes. The browser bridge, right-wrist fix and requested Break menu already have authorization.
- Test on PC before publishing; then commit/push and verify the correct GitHub Pages build before asking for a Quest refresh. Check Git status and preserve unrelated changes.
- Keep `HANDOVER.md`, this plan and `bridge/README.md` consistent. Clearly distinguish built, PC-tested, user-confirmed and pending.
- Never commit private data: keys, passwords, pairing codes/links, browser profiles, cookies or girlfriend's number. Keep credits in `CREDITS.md`. No account creation or automated sign-ins.

## Task 1 remaining: Claude subscription controlling the world

The browser panels and Chrome connection are already implemented. Normal runtime uses `bridge/chrome-extension/` and `bridge/extension-browser.mjs`; the old Playwright engine is only an explicit test provider. Do not revert to headless automation to resolve verification or use stealth/verification bypasses. There is no browser debugging TCP port exposed.

After the real browser test succeeds, implement the secure remote MCP connector proposed in the original approved bridge plan:
- Recheck Anthropic's current custom-connector and MCP authentication docs. Prior research found Claude connects from Anthropic's cloud, so the endpoint needs reachable HTTPS and proper authentication. Do not expose an unauthenticated control endpoint or assume a local-only server can be reached by claude.ai.
- World tools: `open_window`, `update_window`, `close_window`, `add_note`, `create_mind_map`, `create_timeline`, `make_flashcards`, `clear_desk`, `list_windows`.
- Browser tools planned: `open_url`, `read_page_text`, `click`, `type`, `screenshot`. Add only the needed, authenticated operations to the extension/provider; current extension deliberately has a restricted page/input command allowlist.
- Forward approved world operations to the headset and reuse existing `runClaudeTool(name, input)` rather than recreating the study tools. Handle disconnected-headset errors and bounded responses.
- The existing API-key Claude path is separate. The user's Claude subscription website currently does NOT control the world. Do not require the user to obtain an API key to replace their subscription.
- Test securely on PC, then guide the user through adding the connector to their Claude account. They handle their account setup/sign-in.
- Browser audio, clipboard, mouse drag/text selection, file picking and calls remain future work; prioritize what the user needs for a usable experience. A native/Unity rewrite was an alternative, not the selected approach; do not start one without discussing it.

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

## WhatsApp heart and personal data
- With the bridge connected, the existing heart opens WhatsApp Web's inbox through the user's normal Chrome session. The girlfriend's number is not required by this path.
- The historical disconnected fallback uses the number stored only in the browser's local settings and opens outside VR. Preserve that existing fallback unless the user asks to change it. Break service buttons intentionally have no external fallback.
- Do not request or store her number to test the new Chrome connection. Never put it in public source or handover documents.
- The label remains BARBERA. A possible rename was only an earlier suggestion; do not change it without the user asking/agreeing.

## What comes after this
1. After browser reliability, the authenticated Claude website connector above.
2. Discuss custom study-material creation/import, then library and saved layouts (Task 2).
3. Polish Quest performance, gestures, watch, readability and audio.
4. Discuss which optional ideas from Task 3 the user wants, including future inside-trailer scene/music changes. Do not treat the whole idea list as approved work.

The user specifically asked to keep these notes ready for Claude to resume. At each checkpoint, record the user's actual result, current code, validation and the next concrete step; preserve privacy and avoid stale "build it from scratch" instructions.
