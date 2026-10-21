# GPT fixes branch — concurrent gesture test

All code work is on gpt-fixes, based on main 3d76373. No main push or merge. Claude owns the Jarvis gesture section and its debug helpers; they are not part of these edits.

## 1. Bridge and connector

The F: drive was unavailable in this session. Local port 8130 was not listening; Tailscale Funnel was configured and returned 502 because the local bridge was absent. A fresh separate checkout was pulled from main. The unchanged bridge was started ONCE from that checkout using the preserved private settings in Documents/Sunnyvale private copy. No PC Sunnyvale frontend connected, and no existing bridge was stopped. Local/public health now pass. Authenticated public MCP checks pass with 73 tools, while missing credentials receive 401. Saved Quest and connector links already use the permanent address; no replacement is needed.

The checker/setup writer now prefer public-address.txt, support BRIDGE_PRIVATE_DIR, validate settings, and suppress errors that could expose credential-bearing URLs. At this early checkpoint Chrome had not connected; the final checks below confirm Chrome and Quest connected. If claude.ai retains an earlier error, refresh Claude and retry its connector.

The project drive later returned; its canonical code/main was not replaced. Private links/credentials remain outside Git.

## 2. Automatic Windows-login startup

Installed the approved per-user Startup shortcut. It runs a hidden supervisor from LocalAppData and targets the canonical F: bridge at the next Windows login. It checks port 8130 before starting Node, uses a per-port mutex, respects the existing exit code 3, and retries a crashed process after five seconds. A missing project drive is waited for rather than spawning duplicate processes. It installs no service/account and requires no new paid API.

The isolated Windows integration test covered an occupied port (no Node launch), crash recovery, repeated launcher, and shortcut install/remove. The actual installed guard was invoked while the real bridge was up: its process ID stayed unchanged. Eleven current test cases passed.

To disable future automatic startup, double-click bridge/Disable Automatic Startup.bat in this branch, or delete Sunnyvale Browser Bridge from the Windows Startup folder. This deliberately leaves the current bridge running so the headset test is not interrupted. A shortcut entry is already installed even though source changes are not merged.

## 3. One browser click per pinch

Browser input now shares one per-hand latch between native select and fingertip contact, ignores repeated selectstart events, retains contact through small depth/edge jitter, and waits for a physically opened hand before re-arming after a noisy release. Controllers re-arm on release. Mirrored DOM pointer events are ignored during immersive XR. Lost/disconnected inputs and reconnects clear browser latches. A fresh pinch still works while a fingertip remains near the page.

Fourteen tests passed, including the full actual app with synthetic controller events, an isolated bridge and a click-reporting browser fixture. Multiple starts/contact jitter/mirrored pointer produced one click; separate actions produced separate clicks. Three.js is a pinned test-only dependency for offline testing. The Jarvis gesture block and studyDebug.gestures are identical to 3d76373; index.html edits are limited to browser event routing and its cache version outside that block. Nothing is deployed to main.

## Current recovery and task 4: exact clicks

F: returned; canonical code/main was left untouched. Recovery and canonical pairing/connector/address files match. Chrome and Quest connected. A real-Chrome anonymous fixture, operated through the existing Quest slot, received 18 clicks within one CSS pixel at DPR 2 and logical 1280x800. It did not automate accounts or copy a profile. The isolated 0.4.4 extension suite now explicitly starts at saved 75% origin zoom, checks a three-point grid, reload click accuracy and restoration of 75% on detach. No production extension change is necessary. The actual signed-in Claude page at saved 75% is still unverified because computer-control initialization failed; this is a scoped limitation, not a completed account test.

## Task 5: local backups

A real Quest study backup parsed successfully (8 storage keys). Seven missing private backup files were copied to the canonical F: backup folder, without replacing differing existing files. The running process still writes recovery-folder snapshots; keep both folders until a planned reconciliation. No real library/frame items were present. The new isolated backup test covers UTF-8 across chunk boundaries, a 200003-byte binary file, frames, keys and invalid inputs. Malformed base64 and incomplete library uploads are now rejected without replacing a good prior file. Filesystem error replies suppress local paths. Google Drive was not installed; optional official steps are in bridge/README.md.

## Task 6: documentation and release status

HANDOVER and NEXT_STEPS now distinguish current work from superseded history. README covers permanent addressing, startup/disable and optional cloud copies; proposal marks Safety Net BUILT. No design change, quad layers, account setup or paid key was added. Protected Jarvis code remains unchanged. Backend fixes await a planned merge/restart; browser fixes await merge and Quest refresh. No restart or refresh is requested during the current gesture test.

## Final PC validation

All 15 npm test cases pass, including isolated Windows startup, actual-app synthetic XR, extension streaming/input/media, HTTP fallback, connector auth and backup round trips. No production extension edits were needed. Secret scans precede each commit. Real-headset pinch confirmation and actual Claude-at-75% account-page clicks remain pending; the branch is not deployed.
