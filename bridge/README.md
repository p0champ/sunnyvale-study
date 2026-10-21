# Sunnyvale PC browser bridge — normal Chrome connection

This keeps real web pages inside the current Sunnyvale world. Your Windows PC and your usual Google Chrome must stay open. The Sunnyvale extension connects to real tabs in the Chrome profile you already use. No API key, copied cookies, copied profile or automated Chromium is used in normal operation. Sign in yourself on the PC if needed. Login sessions last as long as the sites allow; occasional sign-in and verification can still happen.

For the latest user-confirmed setup and the exact next step, see `../HANDOVER.md`. The instructions below are a setup reference; do not repeat completed steps unnecessarily.

## Add the Chrome extension once

1. In your usual Chrome, open `chrome://extensions`.
2. Turn on **Developer mode**, press **Load unpacked**, and select `F:\QuestStudySpace\bridge\chrome-extension`.
3. Click Chrome's puzzle-piece Extensions button, then **Sunnyvale Browser Bridge**.
4. Choose `F:\QuestStudySpace\bridge\private\pairing.txt`, then press **Connect**. The extension says **Connected** when ready. The file and sign-ins stay on this PC.
5. Keep Chrome open. Refresh Sunnyvale on Quest and connect using the current private link or current bridge address. A relay restart changes that address; update any stale Quest address. Open Claude or WhatsApp from the menu.

The extension will reuse an open tab for the requested website when possible, preserving the current page and login. Otherwise it opens a normal Chrome tab with that profile's session. Closing a VR window only stops sharing; it leaves the Chrome tab open. Headset disconnection also stops sharing and leaves tabs alone. Chrome displays its standard debugging notification while a tab is shared. Do not press Cancel on that notification while using VR. Open DevTools can also interrupt sharing. Sign-in popups, account choices and any verification should be completed by you on the PC before reopening the tab in VR.

The extension requests `debugger`, `tabs`, `activeTab`, `tabCapture`, `offscreen` and local storage permissions so it can stream a selected tab and forward VR clicks/typing. Its command allowlist operates only on tabs opened from Sunnyvale. It has no cookies/password API or persistent content scripts. After explicit headset Mic activation, a fixed temporary microphone function is installed in the shared Claude tab only. Chrome's normal sign-in state is reused in place. The local extension connection checks its stable extension origin, the literal loopback Host header and the private pairing credential. The remote relay cannot connect to the browser-side endpoint. It only carries the separately authenticated headset connection.

## Start the bridge on later days

1. Double-click **Start Browser Bridge.bat**. First launch installs Node dependencies and Cloudflare's signed connection helper. Leave the window open. The extension should reconnect; open its popup and press Connect if needed.
2. When it says the private Quest link is ready, open **bridge/private/Open Sunnyvale.url** on the PC. This opens Sunnyvale and connects automatically. Check that **PC browser bridge** says **Connected**.
3. Open that same private link in Quest Browser (for example, transfer it with your usual private PC-to-headset link sharing). It includes a pairing credential, so do not post it or put it on GitHub. Only one device can connect: disconnect the PC preview before connecting Quest.
4. Enter Sunnyvale. Tap Claude or the heart. They open claude.ai or WhatsApp Web on movable panels. Log in yourself. WhatsApp will show its linked-device QR code.

An alternative to transferring the link: open the normal live site on Quest, expand **PC browser bridge**, enter the tunnel's `wss://…/bridge` address and the code from `private/pairing.txt`, then press Connect before entering VR.

Inside a panel: point and pinch to click, touch with a fingertip to tap, use **Up/Down** to scroll, **Keys** to open the keyboard, **URL** to type an address, and **New** for another tab (up to four). Grab the outside frame to move a panel. Keyboard has Shift for capitals. On PC, use the mouse and wheel; PC typing goes to a browser only while its keyboard is visible. The first keyboard is basic; text selection, mouse dragging and clipboard are not implemented yet.

The relay is encrypted, protected by a random private pairing credential and allows only the app's origin. The PC service listens on loopback. Project files, profile files and credentials are never served by it. The public code excludes all private files, installed programs and dependencies. Anyone with your private link can operate shared tabs, so keep it private. To revoke a link, stop the bridge, delete `private/pairing.txt`, and restart, then choose the new pairing file in the extension. The temporary relay address changes each relay restart. Shared tabs start muted until tab sound capture is enabled; detaching restores their previous mute state. Tab sound and Claude headset microphone forwarding are available with the permissions below. General website calls and file picking are not implemented.

The app tries its saved bridge connection once on load. Until connected, the Claude button shows a clear HUD message and stays inside VR. The explicit Open Claude outside VR page button requires confirmation. A rotated temporary address still needs the current private link. A disconnection displays a message; existing panels freeze until you reconnect and reopen them. Connecting again clears old panels. WhatsApp opens its inbox; the girlfriend's number is not sent to the bridge. The original number-based fallback is unchanged.

## Validation and next stage

`npm test` covers authentication rejection, JPEG streaming, click, text, scroll, multiple tabs, close and invalid URL schemes with a local fixture. An actual loaded extension test verifies reuse of an existing tab without reloading, existing session-cookie/local-storage continuity, streamed frames, input, scrolling, and retaining/reusing the tab after VR close. Tests use an isolated disposable Chromium profile; normal operation uses the user's Chrome extension. The former Playwright engine is available only through explicit `BRIDGE_BROWSER=playwright` for tests; it is not a fallback for Claude verification. Quest and real account behavior require the user's final test. The reading-clarity revision sends full-resolution screenshots at at most four per second, with acknowledgement/backpressure and duplicate suppression. This prioritizes readable text rather than smooth video. World/head tracking retains its independent render loop; actual Quest performance still requires testing.

**Not built yet:** remote MCP/OAuth connector for Claude to control world tools. Anthropic's current custom connector documentation confirms that connections originate from Anthropic's cloud, requiring public HTTPS and proper authentication. This is stage 5, after the user tests the browser stages. No unauthenticated MCP endpoint is exposed.

References: [Playwright persistent contexts](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context), [Chromium screencast protocol](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-startScreencast), [Anthropic custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp), [Cloudflare quick tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

Chrome references: [Debugger extension API](https://developer.chrome.com/docs/extensions/reference/api/debugger), [WebSocket service worker lifetime](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets), [Default-profile debugging restrictions](https://developer.chrome.com/blog/remote-debugging-port).

## If Quest cannot establish the live socket

The app first tries a WebSocket for five seconds. If opening it fails, it automatically uses ordinary secure HTTPS POST requests and long polling. The same address, pairing code, Chrome session, input and panels are used. Successful backup status says **Connected through secure HTTPS**. This path can be slower for moving video; it is intended to keep browser pages usable on networks/devices where HTTPS works but WebSocket opening fails.

Both transports authenticate. HTTPS sends the pairing credential in an Authorization header, receives a random short-lived session credential, and uses restricted CORS with the approved app origins. Credentials are never placed in request URLs. Other pages cannot read/control sessions without authorization. Only one Sunnyvale frontend connects at once; keep Chrome's extension connected, but disconnect other PC/Quest Sunnyvale pages. Idle HTTPS sessions expire after 45 seconds; explicit Disconnect releases them immediately.

A bridge restart for this update regenerates the temporary relay address, so use the current private Open Sunnyvale shortcut or its bridge address. The pairing code is unchanged. Refresh the app to load the new versioned browser modules. The setup stays within the current design and does not change your Chrome profile or sign-ins.

HTTPS /health reaching the PC does not prove a WebSocket works. The user confirmed health works on Quest and the address was correct, but the Quest socket-open timed out. The fallback was added for that observed failure. The user subsequently confirmed the HTTPS connection works. The exact underlying socket failure remains unknown; current testing focuses on voice, sound and clarity. Do not claim that account/video playback works based only on a fixture test.

## Update 0.3.0: sharper pages, sound and speaking to Claude

For an existing installation, reload Sunnyvale Browser Bridge at chrome://extensions once; do not remove it or sign out. Its pairing is retained. This version adds Chrome tab-audio permissions. Refresh the published Sunnyvale page after deployment.

1. On PC, open the Claude tab in normal Chrome. Click Sunnyvale's extension action (through the puzzle-piece menu if unpinned) and **Enable sound for this tab**. Chrome requires the actual extension invocation; opening the popup as a normal web page or a background request cannot grant it. Keep Chrome open. Repeat for other tabs you want to hear. Capture continues through same-tab navigation, and ends when sharing closes/disconnects or you press Stop tab sound. It may need enabling again next session.
2. On Quest's normal Sunnyvale page, connect using the current bridge address/code, then press **Allow headset microphone** and approve the microphone prompt before entering VR. This permission check immediately releases the microphone; sharing starts only with the in-world Mic control.
3. Enter VR and open Claude. **Mic** starts sharing your Quest microphone with this Claude tab; **Mic ON** shows when it is active. Use Claude's own voice control to start its conversation. Tap Mic again to stop. Only Claude supports this forwarding currently. No PC microphone is requested.
4. **Sound ON** indicates captured tab audio is enabled. Sound toggles capture; if Chrome refuses starting from VR, invoke the extension on that PC tab and enable sound there. Connect resumes headset audio playback; if Quest blocks sound, leave VR, press Connect on the page and enter again.
5. **Text + / Text -** makes website text larger/smaller through a logical viewport change. Pages use actual double-resolution screenshots even while animated. Capture is capped at four per second for readability; moving video remains limited, especially over HTTPS fallback.

Audio uses bounded 24 kHz mono PCM packets. Microphone tracks stop immediately on toggle off, closing a window, sharing cancellation or disconnect. The remote website's temporary microphone is removed on normal stop/detach. The bridge does not save audio. Chrome sessions/logins and original mute state stay on the PC. Actual Claude voice UI, headset permission behavior, speaker quality and protected video require the real headset test.

`npm test` includes real extension audio/microphone waveforms over both transports, high-resolution still/zoom, and headset media lifecycle tests. Tests use disposable profiles and synthetic tones, never the user's accounts or microphone. Chrome's test-only capture allowlist applies only to the disposable test browser; normal Chrome always requires its toolbar action. See [Chrome tab capture permissions](https://developer.chrome.com/docs/extensions/reference/api/tabCapture).

## Reading clarity follow-up

If text remained blurry after 0.3.0, refresh the live app after this revision deploys and use the current relay address. No extension reload or new permissions are required. Browser windows temporarily disable the world's maximum foveation (edge resolution reduction), restoring it on close. Texture mipmaps improve text stability at reading distance. The panel design/size stays the same.

Every delivered page image now uses the real double-density screenshot, even with an active cursor, spinner or animation. The old low-resolution screencast only signals page changes on the PC; it is not sent to the headset. Snapshot capture is capped at four per second, skips identical images and respects headset acknowledgements. Large PNGs use the existing JPEG95 size fallback. This is intended for sharp study/Claude pages, not smooth movie playback. Test actual headset sharpness and GPU performance after refresh; PC tests cannot establish those.

The necessary backend restart rotates the temporary relay address and stops old tab-audio capture. Keep the same pairing code and Chrome sessions; enable Claude tab sound again through the extension if needed. Read the current handover before troubleshooting.

## Update 0.4.0 and the Claude connector (2026-10-21)

- **Extension 0.4.0:** reload it once at chrome://extensions. It skips tabs Chrome has put to sleep, wakes and focuses the tab before connecting, re-attaches if a previous session is still attached, and times out a stuck tab. The bridge also retries opening once if Chrome doesn't answer.
- **Claude connector:** the bridge serves an MCP endpoint at /mcp (58 tools). The private one-link URL is written to private/Claude connector setup.txt by `node make-connector-setup.mjs`. `node check-connector.mjs` verifies it from the internet without printing secrets. Add it in claude.ai under Settings, Connectors, Add custom connector, with no sign-in. The link changes whenever the bridge restarts (quick tunnel), so remove and re-add the connector then.
