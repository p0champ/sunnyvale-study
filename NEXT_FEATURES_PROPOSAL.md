# Feature status and remaining proposals

Safety Net stage 1, the spark avatar, category menu and the tools listed in the newest HANDOVER are already built. Remaining proposals need an explicit yes before implementation, one small group at a time. The listening indicator was an authorized bug fix and is already built.

## Safety Net (39) — BUILT, stage 1

backup.js and bridge/backup.mjs implement local/optional Drive backups, dated study snapshots, library files, frames, bridge keys and restore preview. Real Quest study backup verified; isolated text/binary/frame restore tests pass. Google Drive for desktop is not installed. See bridge/README.md for optional setup. History/trash/undo beyond the existing behavior remain proposals requiring approval.

## Suggested order

Effort is relative, not a promised completion time. Appearance changes need a preview and approval.

| Order | Item | What you would see / how it works | Effort and web limits |
| --- | --- | --- | --- |
| BUILT | 39 Safety Net stage 1 | Private dated backups, status and restore preview. Later history/trash/undo remain proposals. | Needs PC connection and available disk space. |
| 2 | 42 Transparency | A compact list of Claude's completed/failed actions, a working light and confirmation before actual deletion. | Medium. Feasible with local logs and retention limits. Mic indicator already built. |
| 3 | 40 Find anything | Search local notes, sources, quotes, thesis and filenames; select a result to reveal it. | Medium. File contents need indexing; encrypted/DRM files cannot be assumed readable. |
| 4 | 41 Fast capture | Save a note, quote, current shared page or permitted frame to an inbox with one deliberate action. | Medium. No background capture of unrelated tabs or the room. |
| 5 | 43 Comfort | Readable size/distance presets and adjustable HUD placement. | Small/medium. Feasible; real headset comfort tests needed. |
| 6 | 44 Export | A clear export screen for thesis, bibliography and study material. | Medium. Downloads feasible; live account editors need reliable browser focus and real-account checks. |
| 7 | 16 Custom Claude panel | List recent chats from your signed-in Chrome, open one and offer a mic control. | Medium/large. No public chat-list API; reading claude.ai/recents is fragile when the site changes. Mic needs explicit activation/permission. No paid API required. |
| 8 | 17 Orb avatar | An original animated avatar with speaking/listening states. | Medium. Preview an original design inspired by Claude; do not copy trademark artwork. Speaking detection depends on audio signals. |
| 9 | 18 Customisation | Settings for agreed colors, scale and placement presets. | Medium. Saved locally, backed up once Safety Net exists. |
| 10 | 19 Slide images | Choose an uploaded image, fitted crop and caption for a slide. | Small/medium. External images need permission/CORS. |
| 11 | 21–24 Writing | PC/Claude voice dictation, read aloud, paragraph feedback and a spatial outline wall. | Medium/large. Quest lacks SpeechRecognition. Transcription needs an explicit mic route; feedback uses the existing subscription connector. No required paid API. |
| 12 | 25–26 Film study | Frame comparison grid and mood boards using chosen frames, notes and images. | Medium. Good web fit for uploaded media; protected streaming can block extraction. |
| 13 | 27–30 Reading challenge | Daily tracker, reading nook, wrist streak and poem shelf. | Medium. Local tracking feasible; content user-provided/licensed. Nook design needs approval. |
| Later | 20/38 Sharing/shared lab | Invite a guest to selected study material. | Large. Needs guest identity, selective access, revocation, conflict handling and a relay. Never share pairing/connector secrets. |
| Later | 31–37 Models, holo-table, charts | Place licensed free 3D assets, a table surface and interactive 3D data. | Medium/large. Feasible within Quest GPU/model budgets; agree controls and appearance. |
| Later | 31–37 Real-wall placement | Align windows to detected surfaces and use anchors when available. | Large. WebXR plane/anchor support varies. Physical persistence across sessions is not guaranteed; manual alignment may be needed. |
| Later | 31–37 PC screen | An explicit picker shares a chosen screen/window, or uses the existing tab-share path. | Medium/large. Browser/OS permission required; protected content may be black and latency matters. |
| Research | 31–37 Gaussian splats | View a prepared scanned scene reduced for Quest. | Large. Rendering research; does not automatically reconstruct the room. |
| Research | 31–37 Generated 3D/worlds | Import reviewed assets from a selected service or local model. | Large. No built-in free generation guarantee. Agree costs, licensing and hardware first; no mandatory paid API. |

## Wake word (14): choose a deliberate alternative

Recommended: a palm push-to-talk gesture starts/stops the existing shared microphone, with the visible listening state. It would not listen continuously. It does not itself provide speech recognition; Claude's voice conversation still needs to be active.

Alternative: a local PC wake-word model receives the explicitly enabled shared microphone, detects a phrase and then forwards speech. This adds installation, CPU use and continuous audio processing while enabled. It needs a clear privacy/stop state. Neither alternative is built.

## Stable bridge address (0c): decide separately

A named Cloudflare tunnel keeps Quest and Claude connector addresses stable. It needs a Cloudflare account and a domain configured there. The account can be free; a domain may cost money. [Official prerequisites](https://developers.cloudflare.com/tunnel/get-started/).

An alternative is an authenticated address-discovery service publishing only the current public hostname. Pairing/connector secrets stay private and Quest retrieves the hostname after a restart. This needs hosted infrastructure, trusted updates and one-time Quest setup. Neither route is implemented.

## Approval requested

Recommend stage 1 of Safety Net only: private PC backups, last-backup status and restore preview, with a bounded number of dated copies. Choose the backup folder before implementation. This proposal does not authorize cloud upload, shared access, automatic deletion or unrelated design changes.
