# Sunnyvale Study — Build A

23 October 2026 · gpt-next · based on main 49e10f1

## Status

- **Built:** Build A only. Builds B–D have not started.
- **PC-tested:** complete `cd bridge && npm test`: **33/33 passed**. Final focused lecture/playback checks also passed after a cancellation guard refinement.
- **Reviewed:** independent critic **7/10 → 8/10**, two rounds. No remaining PC code blocker. Open limitations: Quest behaviour and GPU load; actual device lecture voice; thinking/building sharing one animation; final PC backup now requires a manual backup before immediate log off.
- **Committed:** local gpt-next commit; see Git history for the exact revision.
- **Original build delivery:** not pushed or merged. Subsequently, Bastian explicitly approved temporary Quest activation: the matching test frontend/backend are now active through the existing secure bridge route. Main and canonical checkout code are unchanged. See the newest HANDOVER.md entry.
- **Needs a Quest check:** every item in the checklist below. No headset results are claimed.

## What changed

1. Voice pieces always play at 1.0×, including overflow rescheduling. Catch-up skips near-zero silence; exceptional queues over eight seconds trim oldest pending pieces without stopping current speech. Ordinary three-second bursts retain every piece. The updated playback regression was also run against the original code: it failed, as expected. No new speech service or key.
2. Audio acknowledgements can travel on the separate audio connection. Previously a congested picture connection could withhold acknowledgements and stall the twenty-packet delivery window. Ordering, replay, authentication, fallback and bounds remain. A real-socket regression delivers 45 packets without any picture-channel acknowledgement.
3. Audio received while the browser audio context is suspended waits for unlock instead of disappearing silently. The page gives a tap-to-enable notice. Muting/disconnecting clears waiting audio. Starting the mic also requests tab sound; Chrome may still require its existing one-time Enable sound click. Microphone cancellation also covers logout during permission/unlock.
4. Mind-map, timeline and flashcard tool builds spread canvas paints across frames/event-loop turns. Speech-aware automatic-save deferral remains. The CPU benchmark runs six maps plus six flashcard decks: longest timer gap **150 → 64 ms**; total completion **327 → 4,372 ms**. Rendering was paused and speech-active save deferral simulated. This measures canvas scheduling, not GPU load or Quest frame rate. The earlier fully rendered trial froze badly on this PC; it is not claimed as a successful after measurement.
5. `present_slides` submits the entire deck and spoken text in one tool call. Device speech advances only on speech completion; PLAY LECTURE allows one initial permission tap, STOP cancels. It uses the existing English voice selection. This is **device voice, not Claude's voice**. We could not establish Claude's own between-tool narration behaviour without an account session, so that cause remains unconfirmed. Mocked speech events verify deck sequencing; actual Quest voice and long-deck reliability remain pending.
6. Slides accept saved `frame_id` or library `image_id`. Images keep their aspect ratio beside the text, load failures are visible, and stale image callbacks cannot repaint a closed deck. Text fits down to a readable minimum, then an overfull slide returns a clear request to split it; it never silently drops accepted bullets. Arbitrary URL fetching was not added: saved frames and library images cover the requested image sources without introducing a fetch proxy.
7. Log off stops lecture/device speech, wake-word recognition, video players (including stashed players), scanner tracks and pending scanner permissions, microphone/tab playback, browser windows and bridge reconnects. It leaves the PC bridge running. The desk is saved locally before the menu disconnects. Because disconnect is immediate, log off no longer initiates a final PC backup upload; use **Back up now before Log off** when an immediate final PC copy is wanted. Existing periodic backups and existing backup files are untouched.
8. Removed decorative workbench, floor rings and floating dust from passthrough. Kept Claude's meaningful listening indicator and existing menu controls. Existing stash deletion, HUD timing, fist glow and orb behaviours passed checks; they were not redesigned. Thinking/building share the existing working animation.

## Evidence and limits

- Full PC suite includes disposable bridge folders, separate ports, synthetic extension peers and isolated Chromium. No normal Chrome account automation, profile copying, new accounts or services.
- Slow-network simulation: **95/95 packets**, maximum delivery gap **103 ms**, **0 underruns**, **0 dropped pieces**, while four picture windows were congested (picture RTT peak about 4.4 seconds). This fixture simulates tool responses; the separate real-app benchmark measures canvas work. These are different checks, not a claim that the network fixture renders mind maps.
- New tests cover unchanged playback rate, overflow pitch, suspended first packets, audio-channel acknowledgement, lecture completion/cancellation/English voice, actual deck integration, frame/library images, dense-slide rejection, both stash deletion paths and KEEP, explicit HUD duration, existing orb moods, and connected log off without stopping the isolated bridge.
- Front/side screenshots cover slide pictures, fist glow and waiting/listening/working/speaking orb states. Fixtures force visual states and use a generated film image, not private material or Quest screenshots.
- An initial restricted run failed at the Windows startup fixture; another run hit an intermittent native Node assertion. A later complete run passed all 33 tests with the Windows fixture isolated and no real startup settings changed.
- The private diagnostics log was read in place. Sample tail records show PC packets at roughly 100 ms but headset gaps up to 2,860 ms with much shorter main-thread stalls. This supports delivery congestion as a contributor; it does not identify every historical cut-out.
- Staged current contents passed the secret scan before commit. A pre-existing private bridge address was removed from the current handover notes; earlier Git history was not rewritten. No private log, pairing material, URLs, backups or recovery files are included. No push is part of this build.

## Quest checklist (after a separately approved test setup)

The current live page still runs the old version. These steps apply only once this branch is deliberately made available to the headset, with the matching bridge changes. Only one frontend may connect to the real bridge.

1. Start a fresh session. Enable Sound once if Chrome requests it, then start Claude voice. Check that the first word is audible and the page reports a sound-permission problem if sound is blocked.
2. Ask Claude to speak for two minutes. Listen for pitch changes, missing words, cut-outs and growing delay, including the final words.
3. While Claude speaks, ask for a full eight-branch mind map and thirty flashcards. Check that voice remains normal and the room stays usable while the build appears in stages.
4. Briefly sleep/wake the headset or interrupt its Wi-Fi, then resume. Check reconnection, sentence order, repeated words and whether Sound needs enabling again.
5. Ask Claude to use `present_slides` for a three-slide lecture, with spoken text and a saved frame or library image on each slide. Tap PLAY LECTURE once if prompted. Let the whole deck run without per-slide questions, then test STOP and PLAY. This lecture uses the device voice.
6. Stash two disposable windows. Delete one through Claude. Delete the other using ✕, first KEEP, then DELETE. Reload and confirm deleted items stay gone. Check a longer HUD message remains readable.
7. Move windows with a fist and release them several times. Check the glow and placement. Watch the orb while listening, speaking and building; thinking/building use the same working animation. Confirm the decorative floor rings/dust/workbench are gone.
8. Press Back up now if you want an immediate final PC copy, then Log off while voice/media are active. Check that sound and mic stop, browser windows close, VR ends after the summary, and the PC bridge stays running. Begin a new session and check your saved study work.

## What is needed from Bastian

Bastian subsequently explicitly approved the temporary Quest setup and real bridge restart. That activation is complete; main remains unchanged. Next, Bastian must perform the headset checks and report which step failed and what was heard/seen. Build B remains gated on his explicit go-ahead.

## Temporary activation follow-up

Optional protected preview hosting was added and reviewed8/10. The expanded isolated suite passed35/35, plus2/2 focused origin checks after the last guard. External access, Chrome reconnect, authenticated connector tool discovery and a single real bridge listener were verified. The normal saved desk/backups remain separate and unchanged. No Quest listening or rendering results are claimed. See the newest handover for rollback and storage details.
