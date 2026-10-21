# Round two: fixes and testing

## Completed: keep Claude inside the world (item 0)

The page previously waited for you to connect manually, and tapping Claude while disconnected could close VR. It now tries the saved PC connection automatically. If it cannot connect, Claude stays inside the world and explains how to reconnect. Opening Claude outside VR is a separate page button and asks first.

PC check: saved connection attempted once, disconnected Claude cannot open an outside tab, cancelling the confirmation keeps the world, and accepting it opens Claude. Existing bridge integration tests are also run before publishing. No real bridge restart or extension reload is needed. After the live build completes, refresh Quest; a stale temporary address still requires the current private link.

## Permanent address: proposal only

A named Cloudflare tunnel would keep both the Quest and Claude connector addresses stable. It needs a Cloudflare account and a domain configured there. The account can be free; a domain may cost money. An alternative is a small address-discovery service that publishes only the current public bridge hostname; pairing/connector secrets stay private. That needs a trusted update mechanism and a one-time setup on Quest. Neither option is implemented or approved yet. Source: https://developers.cloudflare.com/tunnel/get-started/

## Still being worked through

The Part 1 bug list and PDF/video/export checks. New ideas in Parts 2–5 are proposals awaiting your approval, not approved implementation work.
