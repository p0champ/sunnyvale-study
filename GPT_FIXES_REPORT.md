# GPT fixes branch — concurrent gesture test

All code work is on gpt-fixes, based on main 3d76373. No main push or merge. Claude owns the Jarvis gesture section and its debug helpers; they are not part of these edits.

## 1. Bridge and connector

The F: drive was unavailable in this session. Local port 8130 was not listening; Tailscale Funnel was configured and returned 502 because the local bridge was absent. A fresh separate checkout was pulled from main. The unchanged bridge was started ONCE from that checkout using the preserved private settings in Documents/Sunnyvale private copy. No PC Sunnyvale frontend connected, and no existing bridge was stopped. Local/public health now pass. Authenticated public MCP checks pass with 73 tools, while missing credentials receive 401. Saved Quest and connector links already use the permanent address; no replacement is needed.

The checker/setup writer now prefer public-address.txt, support BRIDGE_PRIVATE_DIR, validate settings, and suppress errors that could expose credential-bearing URLs. The normal Chrome extension is not yet connected at this checkpoint. If claude.ai retains an earlier error, refresh Claude and retry its connector.

The missing project drive has been raised with the user; do not silently overwrite or replace the canonical F: checkout. Private links/credentials remain outside Git.

## 2. Automatic Windows-login startup

Installed the approved per-user Startup shortcut. It runs a hidden supervisor from LocalAppData and targets the canonical F: bridge at the next Windows login. It checks port 8130 before starting Node, uses a per-port mutex, respects the existing exit code 3, and retries a crashed process after five seconds. A missing project drive is waited for rather than spawning duplicate processes. It installs no service/account and requires no new paid API.

The isolated Windows integration test covered an occupied port (no Node launch), crash recovery, repeated launcher, and shortcut install/remove. The actual installed guard was invoked while the real bridge was up: its process ID stayed unchanged. Eleven current test cases passed.

To disable future automatic startup, double-click bridge/Disable Automatic Startup.bat in this branch, or delete Sunnyvale Browser Bridge from the Windows Startup folder. This deliberately leaves the current bridge running so the headset test is not interrupted. A shortcut entry is already installed even though source changes are not merged.

## 3. One browser click per pinch

Browser input now shares one per-hand latch between native select and fingertip contact, ignores repeated selectstart events, retains contact through small depth/edge jitter, and waits for a physically opened hand before re-arming after a noisy release. Controllers re-arm on release. Mirrored DOM pointer events are ignored during immersive XR. Lost/disconnected inputs and reconnects clear browser latches. A fresh pinch still works while a fingertip remains near the page.

Fourteen tests passed, including the full actual app with synthetic controller events, an isolated bridge and a click-reporting browser fixture. Multiple starts/contact jitter/mirrored pointer produced one click; separate actions produced separate clicks. Three.js is a pinned test-only dependency for offline testing. The Jarvis gesture block and studyDebug.gestures are identical to 3d76373; index.html edits are limited to browser event routing and its cache version outside that block. Nothing is deployed to main.
