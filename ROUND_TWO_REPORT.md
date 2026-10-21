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
