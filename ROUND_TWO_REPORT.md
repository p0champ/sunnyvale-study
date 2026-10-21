# Round two: fixes and testing

## Completed: keep Claude inside the world (item 0)

The page previously waited for you to connect manually, and tapping Claude while disconnected could close VR. It now tries the saved PC connection automatically. If it cannot connect, Claude stays inside the world and explains how to reconnect. Opening Claude outside VR is a separate page button and asks first.

PC check: saved connection attempted once, disconnected Claude cannot open an outside tab, cancelling the confirmation keeps the world, and accepting it opens Claude. Existing bridge integration tests are also run before publishing. No real bridge restart or extension reload is needed. After the live build completes, refresh Quest; a stale temporary address still requires the current private link.

## Permanent address: proposal only

A named Cloudflare tunnel would keep both the Quest and Claude connector addresses stable. It needs a Cloudflare account and a domain configured there. The account can be free; a domain may cost money. An alternative is a small address-discovery service that publishes only the current public bridge hostname; pairing/connector secrets stay private. That needs a trusted update mechanism and a one-time setup on Quest. Neither option is implemented or approved yet. Source: https://developers.cloudflare.com/tunnel/get-started/

## Still being worked through

The Part 1 bug list and PDF/video/export checks. New ideas in Parts 2–5 are proposals awaiting your approval, not approved implementation work.

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
