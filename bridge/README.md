# Sunnyvale PC browser bridge — first Quest test

This keeps real web pages inside the current Sunnyvale world. Your Windows PC must stay awake. Chromium has a separate, persistent profile. Sign in yourself; no API key is needed for the claude.ai website.

1. Double-click **Start Browser Bridge.bat**. First launch installs the browser and Cloudflare's signed connection helper. Leave the window open.
2. When it says the private Quest link is ready, open **bridge/private/Open Sunnyvale.url** on the PC. This opens Sunnyvale and connects automatically. Check that **PC browser bridge** says **Connected**.
3. Open that same private link in Quest Browser (for example, transfer it with your usual private PC-to-headset link sharing). It includes a pairing credential, so do not post it or put it on GitHub. Only one device can connect: disconnect the PC preview before connecting Quest.
4. Enter Sunnyvale. Tap Claude or the heart. They open claude.ai or WhatsApp Web on movable panels. Log in yourself. WhatsApp will show its linked-device QR code.

An alternative to transferring the link: open the normal live site on Quest, expand **PC browser bridge**, enter the tunnel's `wss://…/bridge` address and the code from `private/pairing.txt`, then press Connect before entering VR.

Inside a panel: point and pinch to click, touch with a fingertip to tap, use **Up/Down** to scroll, **Keys** to open the keyboard, **URL** to type an address, and **New** for another tab (up to four). Grab the outside frame to move a panel. Keyboard has Shift for capitals. On PC, use the mouse and wheel; PC typing goes to a browser only while its keyboard is visible. The first keyboard is basic; text selection, mouse dragging and clipboard are not implemented yet.

The relay is encrypted, protected by a random private pairing credential and allows only the app's origin. The PC service listens on loopback. Project files, profile files and credentials are never served by it. The public code excludes all private files, installed programs and dependencies. Anyone with your private link can operate this browser, so keep it private. To revoke a link, stop the bridge, delete `private/pairing.txt`, and restart. The temporary relay address changes each restart. Audio is muted; microphone forwarding, audio streaming, calls and file picking are not supported by this first version.

Until connected, the existing buttons still open outside VR as requested in NEXT_STEPS. A disconnection displays a message; existing panels freeze until you reconnect and reopen them. Connecting again clears old panels. WhatsApp opens its inbox; the girlfriend's number is not sent to the bridge. The original number-based fallback is unchanged.

## Validation and next stage

`npm test` covers authentication rejection, JPEG streaming, click, text, scroll, multiple tabs, close and invalid URL schemes with a local fixture. The app itself is also checked in a PC browser. Quest hand tracking, readability, lag and real site sign-ins still require the user's headset test. Do not promise 20–30 fps: the bridge caps delivery at 25 fps, but Chromium supplies frames when the page changes and the actual rate depends on the PC, relay and Quest.

**Not built yet:** remote MCP/OAuth connector for Claude to control world tools. Anthropic's current custom connector documentation confirms that connections originate from Anthropic's cloud, requiring public HTTPS and proper authentication. This is stage 5, after the user tests the browser stages. No unauthenticated MCP endpoint is exposed.

References: [Playwright persistent contexts](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context), [Chromium screencast protocol](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-startScreencast), [Anthropic custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp), [Cloudflare quick tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).
