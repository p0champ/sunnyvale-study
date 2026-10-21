# Round two: fixes and testing

## Completed: keep Claude inside the world (item 0)

The page previously waited for you to connect manually, and tapping Claude while disconnected could close VR. It now tries the saved PC connection automatically. If it cannot connect, Claude stays inside the world and explains how to reconnect. Opening Claude outside VR is a separate page button and asks first.

PC check: saved connection attempted once, disconnected Claude cannot open an outside tab, cancelling the confirmation keeps the world, and accepting it opens Claude. Existing bridge integration tests are also run before publishing. No real bridge restart or extension reload is needed. After the live build completes, refresh Quest; a stale temporary address still requires the current private link.

## Permanent address: proposal only

A named Cloudflare tunnel would keep both the Quest and Claude connector addresses stable. It needs a Cloudflare account and a domain configured there. The account can be free; a domain may cost money. An alternative is a small address-discovery service that publishes only the current public bridge hostname; pairing/connector secrets stay private. That needs a trusted update mechanism and a one-time setup on Quest. Neither option is implemented or approved yet. Source: https://developers.cloudflare.com/tunnel/get-started/

## Status

The authorized round-two repairs have PC validation. Physical headset behavior and signed-in Google Docs still need the short checks below. New ideas in Parts 2–5 remain proposals awaiting approval; see NEXT_FEATURES_PROPOSAL.md.

## Completed: briefing, thesis menus, orb and saved layouts (1, 2, 3, 7, 8)

- The briefing now refreshes while you add sources, deadlines and writing, and after a desk restore. It shows the saved-source count. New sources start as unread; existing read/unread choices are kept.
- Quotes, Sources and Deadlines bring an existing hidden/stashed window back in front of you, instead of finding it and leaving it hidden.
- The orb no longer stops pointing after five seconds. It stays on the selected event, accepts event index/year/label, follows the target when moved, and returns home if that window closes or is stashed.
- Workspace saving keeps exact position, rotation and full scale, including browser panels. Restore cancels animations that could shift the saved layout. The old save format still works. Recentring the headset can change the tracking origin across sessions; this is not a physical-room anchor system.
- Long thesis titles wrap/shrink to fit two lines instead of being cut off.

PC checks: an open briefing changed from empty to a deadline, eight saved sources and a 64-word draft; all three menus reopened stashed windows; timeline labels stayed targeted after twenty seconds and while moving; window/browser poses retained all decimal values and no spawn/fly override; the full long title was drawn inside its bounds. Existing bridge suites passed. No real bridge restart or extension reload is needed. Refresh Quest after the completed live build.

## Completed: citations, listening indicator, light flick and English (9, 11, 12, 15)

Citations now build their parts only when the details exist, so a film without a studio no longer ends in stray full stops. Tested all four styles, every supported source type and partial metadata. This handles punctuation; check your university's precise citation requirements when preparing the final bibliography.

Claude's window and the HUD now keep a listening indicator visible while the Quest microphone is shared. Connecting and listening are distinct. Closing/toggling/disconnecting or losing the audio track clears sharing. The light flick threshold is lower and uses a short motion average, rejecting slow placement, jitter, stale motion and single tracking jumps in simulations. Actual hand feel still needs Quest testing.

Sunnyvale speech explicitly defaults to English (US), with English (UK) available under Library, deadlines and thesis on the page. If Claude itself speaks German, change Claude's separate Settings > General > Voice > Language to English; changing Sunnyvale or the app display language cannot override that. Official instructions: https://support.claude.com/en/articles/11101966-use-voice-mode

PC checks: citation/motion/voice-selection unit cases; real audio worklet and microphone cleanup tests; window/HUD listening display and close-to-stop; saved language selection; all existing bridge integrations. No bridge restart or extension reload for these changes. Refresh after the live build completes.


## Completed: browser context, recovery and aiming (4, 5, 6)

Looking at a shared browser now gives Claude its address, title and up to 8,000 characters of visible page text, plus the existing picture of the virtual scene. It reads only the already shared tab; it does not inspect input values, cookies or browser storage. If page inspection times out, it marks cached context as stale rather than claiming it is fresh.

Extension 0.4.1 re-attaches to a tab's current target and retries once after a lost-debugger error. It restores the viewport, capture and an already enabled microphone. Explicitly cancelling Chrome sharing is respected. A sleeping or closed tab can still need reopening.

Clicks use the logical page coordinates once, independent of the double-density image and page scroll. A hover ring shows where you aim; the small Lens button optionally magnifies that area. Existing Text + remains available. PC mouse tests checked the cursor, Lens, center-coordinate mapping and browser gaze response. A real disposable Chrome extension test injected a lost-target screenshot error and verified recovery, page text/title/address and normal input. No user account/profile was automated.

## Completed: tool permissions and late requests (10)

Every connector tool now states whether it reads, can remove/overwrite data, is repeatable and accesses a website. Local additive tools and clear_desk (which stashes) are marked non-destructive. close_window remains destructive because it really can discard an unsaved text window; labelling it safe would be incorrect. A trash/undo feature is proposed separately.

The bridge's own world-response limit was 15 seconds, not the reported Claude approval timer. It is now 60 seconds, with a clear connection error. Requests that arrive after their expiry are rejected before changing the world. This cannot remove Claude's separate approval prompt or change its timer.

To avoid approving each trusted study action on claude.ai: Customize > Connectors > Sunnyvale Study > Tool permissions > Always allow for the tools you trust. Leave website sending/posting actions requiring approval if preferred. Tool hints help Claude classify actions; Claude controls approvals. Official help: https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities?subjects=product

PC checks: authenticated local MCP client, unauthorized request rejection, tool-list annotations and forwarding; expired world-call does not execute in the actual app. Bridge test suite: nine tests passed in sequence. A test-only Chromium race was fixed by starting its screenshot stream after first navigation; normal Chrome already attaches to an existing page. HTTP polling tests also reuse a frame already received with other messages.

## Completed: honest Scan and wake-word limits (13, 14)

Scan refuses virtual/avatar cameras and stops their tracks. If no real camera is available, it opens instructions to take a phone photo, transfer it to Quest and upload it through Library. It never presents an avatar image as a page scan.

An unchecked page setting can request experimental camera access on the next AR entry. If the browser actually exposes an XR camera, Scan offers an explicit Capture control. Camera pixels are copied only on that tap inside an XR frame and saved to the local library. A physical environment camera is the other supported route. Unsupported/denied access offers the photo alternative. This is runtime detection, not a promise that a particular Quest Browser version exposes passthrough.

PC checks: avatar rejection and track cleanup, real-environment acceptance, unsupported XR fallback, setting off by default, and a GPU test copying a synthetic camera texture with correct orientation and restored rendering state. Real Quest passthrough remains unverified. Web standard: https://immersive-web.github.io/raw-camera-access/ . Meta's reported browser camera investigation: https://developers.meta.com/vr/support/investigations/1557993751977106/

Quest's missing SpeechRecognition remains a clear unsupported state. No always-listening replacement was added. Proposed alternatives, needing approval: a palm push-to-talk gesture using the existing shared mic, or a local PC wake-word model (more setup, CPU use and continuous microphone processing). The first is recommended.

## PDF, video, study tools and exports

Real sample PDF and CORS-enabled MP4 tests passed: upload to the actual library, PDF render/text/highlight, quote with page/source/citation, video play/pause/seek/speed, pin, captured frame and caption, linked two-video comparison, storyboard with frame, two-slide presentation, session counts/summary and next briefing. The PDF reader now waits for its actual load result instead of assuming it finishes in 1.5 seconds. A deliberately slow worker reproduced that bug and passed after the fix.

Word download passed, including literal angle brackets and ampersands: document content is now escaped before building the download. Google Docs export passed its bridge handoff (address and text payload); this did not exercise the user's real Google account or prove that the live Docs editor accepts the final click/type step. That remains a manual check. Samples: https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf and https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4 . Private fixtures/profiles are not committed.

## What to do after deployment

The final browser/backend group needs one bridge restart and one extension reload. The private pairing and connector credentials stay the same; the temporary tunnel hostname changes. The current link files under bridge/private are the source of truth. Never paste those private links in a public issue.

1. In PC Chrome, open chrome://extensions and reload Sunnyvale Browser Bridge. Its version should show 0.4.1. Keep normal Chrome open and your accounts signed in.
2. Use the newly generated private Open Sunnyvale shortcut/link on Quest, then refresh the page. Disconnect any PC Sunnyvale frontend first; only one may connect.
3. In claude.ai, remove the old Sunnyvale connector and add the current private link from Claude connector setup.txt. Set trusted study tools to Always allow if desired.
4. If Claude Sound is off, invoke the Sunnyvale extension on the PC Claude tab and enable sound again. Use the existing Quest microphone permission, then Mic and Claude's own voice control.

### Short Quest check, one small group at a time

- Open Claude: confirm aiming ring follows the ray, Lens enlarges the target, clicks land correctly and text is comfortable. Ask “What page am I looking at?” Confirm address/title/content, then speak; the window and HUD must say LISTENING until Mic is off.
- Add a deadline, sources and a paragraph. Open Briefing and the three thesis menu buttons. Ask the orb to point to one timeline event, wait and move it. Save a workspace, move its windows, then reload it. Try one light flick.
- Upload a small PDF and MP4 through Library. Open PDF, select/highlight a phrase and check Quotes includes the page. Play/pause/seek the video; save a pin and frame. Compare two clips, add that frame to a storyboard, then open a small presentation.
- Type a short thesis paragraph. Download Word, then test Google Docs export and confirm the text appears in the signed-in document. End a session, ask Claude to save what was done/next, and reopen Briefing.
- Try Scan. If real camera access is unavailable, it should offer a phone photo, never an avatar. Leave the optional raw-camera setting off unless testing it deliberately. Change Claude's separate voice language to English if needed.

These are headset/account confirmations still pending, not claims of completed real-device testing. Protected streaming and the four-screenshot-per-second browser video limit are unchanged.
