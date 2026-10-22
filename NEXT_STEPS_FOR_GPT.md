# Next steps (22 Oct, after Claude's overnight reconciliation)

1. **Voice first.** When Bastian approves publishing, deploy `gpt-fixes` (Codex's reviewed voice fix) as one planned transition.
   - Mind the live watcher on F: (see HANDOVER): it restarts the bridge about 3 s after bridge files change.
   - Then refresh the Quest and have him test a real Claude voice conversation. Nothing else goes live before that check.
2. **Push the branch.** If `claude-features` isn't on GitHub yet, run `bridge/private/Save Claude branch to GitHub.bat` on the PC. It fetches the bundle and pushes only that branch.
3. **After the voice check passes,** merge `claude-features`. It contains the avatar, HUD, stash delete, clean passthrough, fist polish, gesture log/coach, Propaganda Analyzer and soft spark. The bubble look is in the branch but stays off until he picks WORLD › LOOK.
   - Run the PC-only tests first: test.mjs, test-http, test-extension, test-browser-input-ui, test-startup.
4. **Real-headset checks still needed:**
   - voice;
   - avatar readability at 2 m;
   - fist feel;
   - the gesture coach with real hands;
   - analyzer readability and tapping;
   - bubble buttons growing near the hand.
5. **Leave alone:** the same-Wi-Fi route (VOICE_FIX_REPORT.md) and AESTHETIC_IDEAS.md are proposals only.

# Voice first: current continuation

Read VOICE_FIX_REPORT.md and the newest HANDOVER checkpoint. Voice code is PC-tested (28/28), independently reviewed (9/10), and awaiting publication authorization under the earlier gpt-fixes-only rule. Do not deploy the recovered appearance source with this voice phase. No live bridge restart has occurred. After an authorized deployment, use one planned backend transition and one Quest refresh, then have the user confirm voice before resuming the other overnight work.

The older checkpoint below is historical where it differs.

# Current continuation (2026-10-21)

Read the newest HANDOVER checkpoint and GPT_FIXES_REPORT.md first. The branch `gpt-fixes` is separate from main; no merge or deployment is authorized during Claude's gesture test.

1. Finish independent review and record its result if absent from the report. Preserve the real bridge and the headset's single frontend slot.
2. The user will merge after the gesture test. Then refresh Quest for the browser pinch routing and test one pinch per click with real hands. Do not change the protected Jarvis gestures while Claude owns them.
3. Actual signed-in Claude clicks at its saved 75% zoom still need a human/available computer-control check. Real Chrome fixture: 18 exact clicks passed. Disposable Chrome: saved75%, reload and zoom restoration passed. Extension remains 0.4.4; no reload instruction is needed for these branch changes.
4. Connector public health/authenticated 73-tool checks passed; Chrome and Quest connected. If claude.ai still shows a cached connector error, refresh Claude and retry the existing connector. Do not generate a new address or publish private links.
5. Automatic Windows-login startup is already installed. Keep the current process running. At an agreed next login/transition, the installed supervisor targets F:/QuestStudySpace/bridge. Reconcile newest private recovery backups before removing any recovery folder. No automatic main merge occurs.
6. Local backups were verified from the actual Quest. Optional Google Drive setup is documented in bridge/README.md; do not install without a new user request. No actual library/frame data was present in this live backup; synthetic round-trip tests cover those types.

Already built: bridge, Claude connector, 73 tools, six Break logos, Focus hides Break, right wrist watch work, spark moods, five-category menu, permanent address/reconnect/heartbeat/crash restart, Display sharpness/Aa, and Safety Net. Consult code and HANDOVER for confirmed scope; do not rebuild them from old proposals.

Unapproved: compositor/quad layers, new design, new features, accounts/services or paid keys. Real movie smoothness, DRM playback, live account-editor workflows and hand comfort are not implied by fixture tests.
