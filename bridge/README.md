# Sunnyvale PC browser bridge — first Quest test

This keeps real web pages inside the current Sunnyvale world. Your Windows PC and your usual Google Chrome must stay open. The Sunnyvale extension connects to real tabs in the Chrome profile you already use. No API key, copied cookies, copied profile or automated Chromium is used in normal operation. Sign in yourself on the PC if needed. Login sessions last as long as the sites allow; occasional sign-in and verification can still happen.

## Add the Chrome extension once

1. In your usual Chrome, open `chrome://extensions`.
2. Turn on **Developer mode**, press **Load unpacked**, and select `F:\QuestStudySpace\bridge\chrome-extension`.
3. Click Chrome's puzzle-piece Extensions button, then **Sunnyvale Browser Bridge**.
4. Choose `F:\QuestStudySpace\bridge\private\pairing.txt`, then press **Connect**. The extension says **Connected** when ready. The file and sign-ins stay on this PC.
5. Keep Chrome open. Refresh Sunnyvale on Quest and reconnect with the same bridge details. Open Claude or WhatsApp from the menu.

The extension will reuse an open tab for the requested website when possible, preserving the current page and login. Otherwise it opens a normal Chrome tab with that profile's session. Closing a VR window only stops sharing; it leaves the Chrome tab open. Headset disconnection also stops sharing and leaves tabs alone. Chrome displays its standard debugging notification while a tab is shared. Do not press Cancel on that notification while using VR. Open DevTools can also interrupt sharing. Sign-in popups, account choices and any verification should be completed by you on the PC before reopening the tab in VR.

The extension requests `debugger`, `tabs` and local storage permissions so it can stream a selected tab and forward VR clicks/typing. Its command allowlist operates only on tabs opened from Sunnyvale. It has no cookies/password API or content scripts. Chrome's normal sign-in state is reused in place. The local extension connection checks its stable extension origin, the literal loopback Host header and the private pairing credential. The remote relay cannot connect to the browser-side endpoint. It only carries the separately authenticated headset connection.

## Start the bridge on later days

1. Double-click **Start Browser Bridge.bat**. First launch installs Node dependencies and Cloudflare's signed connection helper. Leave the window open. The extension should reconnect; open its popup and press Connect if needed.
2. When it says the private Quest link is ready, open **bridge/private/Open Sunnyvale.url** on the PC. This opens Sunnyvale and connects automatically. Check that **PC browser bridge** says **Connected**.
3. Open that same private link in Quest Browser (for example, transfer it with your usual private PC-to-headset link sharing). It includes a pairing credential, so do not post it or put it on GitHub. Only one device can connect: disconnect the PC preview before connecting Quest.
4. Enter Sunnyvale. Tap Claude or the heart. They open claude.ai or WhatsApp Web on movable panels. Log in yourself. WhatsApp will show its linked-device QR code.

An alternative to transferring the link: open the normal live site on Quest, expand **PC browser bridge**, enter the tunnel's `wss://…/bridge` address and the code from `private/pairing.txt`, then press Connect before entering VR.

Inside a panel: point and pinch to click, touch with a fingertip to tap, use **Up/Down** to scroll, **Keys** to open the keyboard, **URL** to type an address, and **New** for another tab (up to four). Grab the outside frame to move a panel. Keyboard has Shift for capitals. On PC, use the mouse and wheel; PC typing goes to a browser only while its keyboard is visible. The first keyboard is basic; text selection, mouse dragging and clipboard are not implemented yet.

The relay is encrypted, protected by a random private pairing credential and allows only the app's origin. The PC service listens on loopback. Project files, profile files and credentials are never served by it. The public code excludes all private files, installed programs and dependencies. Anyone with your private link can operate shared tabs, so keep it private. To revoke a link, stop the bridge, delete `private/pairing.txt`, and restart, then choose the new pairing file in the extension. The temporary relay address changes each relay restart. Shared tabs are muted; detaching restores their previous mute state. Microphone forwarding, audio streaming, calls and file picking are not supported by this version.

Until connected, the existing buttons still open outside VR as requested in NEXT_STEPS. A disconnection displays a message; existing panels freeze until you reconnect and reopen them. Connecting again clears old panels. WhatsApp opens its inbox; the girlfriend's number is not sent to the bridge. The original number-based fallback is unchanged.

## Validation and next stage

`npm test` covers authentication rejection, JPEG streaming, click, text, scroll, multiple tabs, close and invalid URL schemes with a local fixture. An actual loaded extension test verifies reuse of an existing tab without reloading, existing session-cookie/local-storage continuity, streamed frames, input, scrolling, and retaining/reusing the tab after VR close. Tests use an isolated disposable Chromium profile; normal operation uses the user's Chrome extension. The former Playwright engine is available only through explicit `BRIDGE_BROWSER=playwright` for tests; it is not a fallback for Claude verification. Quest and real account behavior require the user's final test. Do not promise 20–30 fps: the bridge caps delivery at 25 fps, but the browser supplies frames when the page changes and the actual rate depends on the PC, relay and Quest.

**Not built yet:** remote MCP/OAuth connector for Claude to control world tools. Anthropic's current custom connector documentation confirms that connections originate from Anthropic's cloud, requiring public HTTPS and proper authentication. This is stage 5, after the user tests the browser stages. No unauthenticated MCP endpoint is exposed.

References: [Playwright persistent contexts](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context), [Chromium screencast protocol](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-startScreencast), [Anthropic custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp), [Cloudflare quick tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

Chrome references: [Debugger extension API](https://developer.chrome.com/docs/extensions/reference/api/debugger), [WebSocket service worker lifetime](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets), [Default-profile debugging restrictions](https://developer.chrome.com/blog/remote-debugging-port).
