# Voice continuation, 22 October 2026

The voice changes are built and PC-tested on `gpt-fixes`. They are not merged, deployed or activated on the real bridge. Actual Quest voice quality remains to be confirmed. The user's original instruction was to finish voice first and stop before appearance work, so the recovered appearance changes remain in private staging.

## What changed

- Claude tab audio has a separately authenticated WebSocket tied to the active headset session. An unrelated page cannot replace it. The existing connection remains the fallback.
- Audio packets share sequence numbers and cumulative delivery acknowledgements across both transports. On a connection switch, unacknowledged packets are replayed and the headset orders/de-duplicates them. Early sound is accepted even if panel metadata is still waiting on the picture stream.
- A twenty-packet delivery window measures actual receipt, including data hidden inside a tunnel queue. The server retains at most 256 pending packets or 2 MiB. A link that exceeds this exceptional limit explicitly reconnects rather than silently growing memory indefinitely.
- All browser windows reduce pictures during actual Claude speech. Quiet Sound ON and ordinary movie sound keep the normal sharp picture path. Pictures use smaller JPEGs during conversations, measured round-trip pacing, a six-second ceiling and prompt updates after deliberate input.
- The player preserves an ordinary three-second burst, skips only near-zero silence when catching up, and gently accelerates delayed speech. An exceptional backlog beyond eight seconds trims the oldest pending pieces rather than flushing every queued piece. These limits mean this is not a guarantee against arbitrary network loss or stalls.
- Automatic backup transfers and periodic desk snapshots wait during actual Claude speech. Explicit saves remain available, and automatic backups retry after speech. World-tool batches yield between builds so canvas work does not run as one long microtask burst.
- Screenshot capture and coordinate input are serialized; a reproduced half-distance click race was corrected. The prior one-pinch/one-click protection is preserved.
- Sound OFF stops local playback immediately; explicitly closed/stopped tabs stay silent. Avatar speech timing follows the playback timeline, including a short tail between words.

## Validation

The complete isolated PC suite passed **28/28**. The final independent voice review scored **9/10**, after three rounds. The reviewer independently reran nine targeted transport, pairing, ordering, retry and playback tests. No remaining blocker was found within that scope.

The slow-link fixture runs the real bridge against a synthetic Chrome-extension peer and generated PCM audio, not signed-in accounts. Pictures are shaped to 150 KB/s and audio to 85 KB/s. Twelve actual authenticated MCP tool calls run concurrently. The final stress run exercises four browser windows. Delivery metrics are retained privately at `bridge/private/voice-simulation-latest.json`; they contain counts/timing only, no recorded speech or private links.

The final four-window stress run delivered **95/95 packets**, with a maximum gap of **103 ms**, **zero playback underruns** and **zero dropped pieces**, while the main picture connection's round trip peaked at **4.382 seconds**. Separate tests cover continuous speech, silence with Sound ON, movie sound, a three-second playback burst, migration/replay, invalid pairing, duplicate reconnects, missing acknowledgements and bounded overflow. This is PC evidence, not a completed headset listening test.

No new Chrome-extension change is needed; the last published extension is already 0.4.5. Activation needs the matching frontend and backend, then one planned bridge restart and a Quest page refresh. Do not restart or connect a competing PC frontend during an existing headset session. The existing instruction to use `gpt-fixes` and not merge main remains in force until the user explicitly authorizes publication.

## Faster same-Wi-Fi route: proposal only

A private local route could remove the public Funnel relay from the path. Tailscale Serve is designed for tailnet-only access, whereas Funnel accepts public Internet traffic through a relay. The headset would need a supported way to reach the tailnet; Quest compatibility must be checked before choosing that option. Do not replace the existing Funnel listener casually, because Serve and Funnel cannot use the same port simultaneously. [Tailscale documentation](https://tailscale.com/docs/features/tailscale-funnel)

A direct LAN alternative would keep pairing authentication and use a trusted HTTPS/WSS endpoint, with local DNS/certificate setup. WebXR needs a secure context, and a plain unencrypted LAN socket is not an equivalent replacement for the current secure connection. Potential benefits are less relay latency and less dependence on Internet congestion; costs include certificate/network setup, Wi-Fi isolation problems and a fallback for use away from home. No new route, service, account or security exception was implemented. [Meta WebXR guidance](https://developers.meta.com/vr/documentation/web/port-vr-xr/), [MDN mixed-content guidance](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content)

## Remaining Claude work

The complete last `index.html` was recovered from Claude's saved file viewer. Its seven final edits were never followed by a recorded test, review, commit or publication. Keep that recovered file separate until the voice phase is accepted. The rest of the overnight avatar/HUD/stash, gesture/analyzer and Bubble batches still need source reconciliation, remaining review fixes and fresh visual validation. Do not label those batches finished or live based on the old session's task checkmarks.
