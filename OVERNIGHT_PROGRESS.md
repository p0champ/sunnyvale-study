# Overnight work: progress checklist (2026-10-21)

The user's 37-item list (see their detailed list in the chat, summarised in `HANDOVER.md`) is being built overnight. **Whoever continues (Claude in a scheduled session, or GPT): read `HANDOVER.md` first, then this file, then continue with the first unchecked item.** Keep this file updated as you go. Item numbers follow the user's DETAILED list (1–37).

Rules: never put secrets, pairing codes, connector secrets or the girlfriend's phone number into public files. Test on the PC preview (`python -m http.server 8123 --directory F:\QuestStudySpace`; `window.studyDebug`) before pushing. Don't restart the PC bridge more than once, because each restart changes the Quest link and the Claude connector link.

## Done (committed, or in the working copy waiting for a commit)
- [x] 1 HUD centred (drawHud in index.html).
- [x] 2 Closing browser windows: findWindow accepts `browser:<id>`, `<id>`, "browser".
- [x] 3 Chrome reliability: the extension (0.4.0) skips discarded/frozen tabs, wakes tabs, re-attaches if already attached, and times out Page.enable. The bridge server retries attach once. **The user must reload the extension at chrome://extensions in the morning.**
- [-] 4 Echo cancellation: the user said to DISREGARD it.
- [x] 5 Desk saved between sessions (snapshotDesk/restoreDesk, localStorage `sunnyvale.desk.v1`).
- [x] 6 Window lock (side buttons; browser-bridge hit/touch skip locked panels).
- [x] 7 Scrolling in text windows (side ▲▼ buttons, mouse wheel).
- [x] 8 Stash picker. [x] 9 Stash single windows (side button) + the Claude tool `stash_window` (thesis tools).
- [~] 10 Notes limit: the connector's add_note is max(500) in `bridge/connector.mjs`. RAISE it to 8000 and open_window to 20000 (backend; needs the one bridge restart).
- [x] 22 Workspaces (SPACES button in the THESIS sub-menu; save/load).
- [~] Thesis tools module `thesis-tools.js` written (library, PDF reader + highlights, quotes, sources/citations Harvard/APA/MLA/Chicago, video player + pins + frame grabs + compare, thesis doc + keyboard + Google Docs export, deadlines, status strip, sessions/briefing, orb point_at, gaze tool, storyboard, presentations, counter-arguments, scanner, wake word). It's installed in index.html with a THESIS sub-menu. **TESTING IN PROGRESS.** The PDF coordinate bug is fixed (pdf.js 6 has no convertToViewportRectangle) and the lookups now go by object. Still to check: highlight_passage works, the quotes window, the sources window, video (try a CORS-enabled sample URL), the thesis doc + keyboard, deadlines, the strip, briefing, storyboard, presentation, the orb.

## STATUS: ALL DONE (about 03:10). Connector upgraded (58 tools), bridge restarted once, check-connector passed, MORNING_REPORT.md written. A scheduled continuation session only needs a sanity check (git status clean, Pages built).

## Still to do, in order (all completed)
1. ~~Finish PC testing of thesis-tools.js~~ DONE (commit a962a47): PDF + highlights (Claude and by hand), quotes, sources (Harvard/APA), thesis doc, deadlines, video + pins + frame grab, storyboard, presentation, counter-arguments, briefing, gaze image, session summary, THESIS sub-menu all verified on the PC.
2. Backend `bridge/connector.mjs`: register the new world tools (all keys of `thesisTools.tools`: list_library, open_document, read_document, go_to_page, highlight_passage, add_quote, list_quotes, add_source, update_source, list_sources, set_citation_style, cite, open_quotes, open_bibliography, open_video, video_control, pin_timestamp, list_pins, grab_frame, annotate_frame, compare_videos, read_thesis, edit_thesis, open_thesis, export_thesis_to_google_docs, add_deadline, remove_deadline, list_deadlines, write_session_summary, show_briefing, point_at, what_user_is_looking_at (returns `{"__image": base64jpeg, "text"}`, so convert it to MCP image content), create_storyboard, make_presentation, go_to_slide, add_counterargument, stash_window), plus a generic `use_study_tool(name, input)` + `list_study_tools`. Raise the add_note/open_window limits. Update the server instructions (Harvard default, counter-arguments: proactively add_counterargument when the user argues a thesis point; use point_at when mentioning things; write_session_summary when the user says they're done).
3. Run `npm test` in `bridge/`, restart the bridge ONCE (kill the process on port 8130 and its cloudflared child, then start `bridge/Start Browser Bridge.bat` minimized), run `node make-connector-setup.mjs` and `node check-connector.mjs`.
4. Update HANDOVER.md + bridge/README.md, commit and push, verify the GitHub Pages build.
5. Write `MORNING_REPORT.md` for the user (plain language): what's done, how to use each new thing, what couldn't be done and why (27 DaVinci Resolve live reading: not possible from the browser, alternative = PC screen; 36 phone notifications: not possible without a phone app, alternative = WhatsApp Web panel; 37 wake word: only if Quest Browser supports speech recognition; 35 scanning: only if Quest Browser allows camera access, otherwise use photos; fling-to-close is kept as fling-to-stash, which can be undone), plus the morning steps: reload the extension, then the new Quest link + the new connector link (both from `bridge/private/`, never paste secrets into public files).
