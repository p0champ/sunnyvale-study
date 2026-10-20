# Sunnyvale Study: handover notes

This is for any AI assistant (ChatGPT, Claude, etc.) continuing this project. Read it fully before changing anything.

## The person you're working with
- They have **never coded**. Explain everything in plain, friendly, non-technical language, one step at a time, and do all the technical work yourself.
- **Don't build or change the design without asking first.** Discuss look, feel and features, one question at a time, then ask "shall I build it?" and wait for a clear yes. Bug fixes and speed fixes they asked for are fine to just do.
- They test everything on a **Meta Quest 3** (hand tracking, no controllers) by refreshing the live link.

## What it is
A WebXR study space for the Quest 3, built as a single web page with three.js. You study inside it, with floating windows you grab with your hands, and Claude as a voice study buddy (Jarvis-style).

- **Live link:** https://p0champ.github.io/sunnyvale-study/
- **Code:** `F:\QuestStudySpace\index.html`. It's essentially the whole app: one HTML file, with three.js 0.169.0 loaded from the jsDelivr CDN through an import map.
- **Repo:** https://github.com/p0champ/sunnyvale-study (public, branch `main`, GitHub Pages serves the repo root).
- **Publishing:** commit and push in `F:\QuestStudySpace`, and GitHub Pages rebuilds in about a minute. `gh` is at `C:\Program Files\GitHub CLI\gh.exe` and may not be on PATH. Check the build with `gh api repos/p0champ/sunnyvale-study/pages/builds --jq '.[0].status'`.
- **Local preview:** `python -m http.server 8123 --directory F:\QuestStudySpace`, then open http://localhost:8123. On the PC: drag to look around, **M** shows the palm menu, **S** runs the mode transition. `window.studyDebug` has `{scene, camera, renderer, look(px,py,pz, tx,ty,tz)}` for inspecting.
- **Credits:** `CREDITS.md`. Every Sketchfab model is CC-BY and must stay credited. Poly Haven assets are CC0.

## The design (agreed with the user)
Theme: **Trailer Park Boys**, plus Tony Stark, plus their own touches. Everything should reference the show where possible.

- **Two modes:**
  - **Sunnyvale mode (VR):** a rainy trailer park at night. Their beat-up trailer with a blue tarp over a study corner, milk-crate bookshelves (Bukowski books), a worn armchair with duct tape, a typewriter on a table, a bottle in a paper bag, a record player on cinder blocks, a burn barrel, black cats (a Bubbles nod), string lights, a bedsheet drive-in screen with a projector on a plastic chair, the Breaking Bad RV, mobile homes, red maples, pines, a fence, and a covered car. A velvet Elvis painting and a taped-up Bukowski page hang on the trailer. "Brenda" (their girlfriend) is carved into the picnic table as a **secret**, so don't tell them where it is.
  - **Stark mode (passthrough):** their real room through the Quest cameras. Windows become red-and-gold holograms.
- **Palm menu:** turn your palm up.
  - In Sunnyvale, **Julian's rum and coke glass** appears in your hand with clean buttons above it. The **arc reactor** button goes to Stark mode.
  - In Stark mode, a glowing **3D arc reactor** hovers over your palm. The **Bubbles' glasses** button goes back to Sunnyvale.
  - Tap buttons with the other hand's index fingertip.
- **Transition:** the Jarvis HUD boots up (typed text, rings, progress bar), then a red-and-gold shockwave dissolves the park outward with a gold grid on the floor, with a whoosh and a boom from WebAudio. Going back, it reverses and the park rebuilds inward.
- **Claude:** a **rum bottle with the Claude logo** in the menu. Tap to talk, tap again to stop, and the cap pops off while listening. In Stark mode it's a glowing Claude button. Claude is **just normal Claude** (no persona) and should do everything it can: talk and explain, open windows Jarvis-style, take notes, quiz the user, and read what's in the open windows.
- **Windows:** opened from the menu. Gestures (some not built yet): pinch to grab, far pinch with a ray, the **Tony Stark fist-pull** to bring a window to you, two-hand resize, close (a cigarette-burn X in Sunnyvale, a glowing X in Stark), and flick away to put a window in the menu.
- **Planned later:** an inside-the-trailer scene ("hermit grind") with a menu button whose icon swaps between a trailer door (go in) and the burn barrel (go out). Sounds: rain, fire, cats. The record player plays stations (vintage Elvis-era, lo-fi, Willie Nelson-style), using free music only plus the user's own files, since the real recordings are copyrighted. A volume slider in the menu.
- **Ideas the user raised but hasn't decided on:** a cartoony look like the *Trailer Park Boys* animated series.

## How the code is organized (index.html, top to bottom)
1. Renderer setup, the custom **Enter Sunnyvale** button. It starts an `immersive-ar` session when supported, so passthrough is always running and Stark mode can switch instantly.
2. `park` group: **everything in Sunnyvale goes in `park`** so Stark mode can hide it.
3. Helpers: `mat`, `box`, `cyl`, `canvasTexture`, `photoMaterial` (Poly Haven textures), `loadModel`/`placeModel` (loads each glTF once, clones it, merges pieces with `mergeByMaterial` when there are more than 8 meshes, sizes it, stands it on the ground; options `part`, `hide`, `alongX`, `height`, `length`, `maxLength`), `surfaceY` (raycast for tabletops and seats), `solid`.
4. Sky (`skySphere` with the HDR photo, dimmed), lights, ground (grass plus worn paths), trees (pines as one `InstancedMesh`), trailers and posters, tarp, props, fire (sprites), string lights, drive-in, car, fence, picnic table (with the secret carving decal), cats (scan clipped to hide its table), rain.
5. Windows: `makeCardboardWindow(title, body, pos)` makes a plane with two textures, `userData.cardboard` and `userData.hologram`. `panels[]` holds all windows.
6. Grabbing: near pinch (thumb + index midpoint) and far ray grab. Windows face the viewer.
7. Palm menu: `menu` group, `realGlass`, `reactor`, `makeButton`, `menuButtons`, `palmInfo` (palm normal from the wrist and metacarpals, flipped for the left hand), `updateMenu`.
8. Modes: `setMode` (final state), `applyWindows`, `startTransition` / `updateTransition`, the dissolve shader injected into park materials (`patchTree`), `shockwave`, `scanGrid`, the HUD (a canvas on a plane parented to the camera), and the sounds.
9. Animation loop.

Assets are in `assets/` (`models/<name>/<name>.gltf`, `textures/<name>/{Diffuse,nor_gl,arm}.jpg`, `sky/*.hdr`). Sketchfab downloads are shrunk to 1024px JPG/PNG textures before adding them. The user downloads Sketchfab models themselves (a login is needed). Don't create accounts or enter passwords for the user.

## Known problems and status (keep this updated)
- **Sunnyvale lag:** 4,452 → about 235 draw calls (merged meshes), shadows turned off entirely, pines in 4 instanced batches. Not yet confirmed smooth on the Quest. If it's still laggy, try `renderer.xr.setFramebufferScaleFactor(0.8)` (it blurs text a little), cheaper versions of the heavy meshes (three cat scans of 28k triangles each, the projector at 32k, crates at 18k each), less alpha-tested foliage (maples, pines), or the cartoony style the user floated.
- **Desert flash: FIXED.** It was the sky photo's lower half (a rocky landscape) showing through once the ground had dissolved. The sky sphere now dissolves with the shockwave using a special mode in `patchMaterial(m, reach, sky=true)`: below the horizon it uses the spot on the floor you're looking at, and above the horizon it opens from the zenith. Never change `scene.environment` or `scene.fog` when switching modes, because that recompiles every park shader and makes the Quest stutter.
- Palm menu, Stark mode and the transition work on the Quest according to the user.
- See the progress log below for what was done after this file was written.

## Claude integration (built 2026-10-20)
- The **rum bottle** (Sunnyvale) or the **glowing coral Claude orb** (Stark) sits above the round buttons in the palm menu. Tap it to talk. The cap pops off while listening, and listening stops on a second tap or after a 2.2-second pause. PC test: the **C** key, or the "type to Claude" box.
- **Keys:** a "Claude settings" box on the 2D page (open it before Enter). The user pastes their own Anthropic API key, which is stored in `localStorage` only and never in the code or repo. There's an optional OpenAI key, used only if the browser lacks `SpeechRecognition` (Whisper `whisper-1` speech-to-text) or has no `speechSynthesis` voices (`tts-1`). Never type keys for the user.
- **API:** the official SDK `@anthropic-ai/sdk@0.131.0`, loaded lazily via the jsDelivr `+esm` build with `dangerouslyAllowBrowser: true`. The call is `client.beta.messages.create` with model `claude-opus-5-5`, `output_config.effort: 'low'` (for snappy voice), `betas: ['server-side-fallback-2026-07-01']` and `fallbacks: 'default'`. It's a manual tool loop (up to 6 rounds) that appends `res.content` unchanged (preserved thinking), and the chat resets after 60 messages instead of being trimmed.
- **Tools (strict):** `open_window`, `update_window`, `close_window`, `add_note` (a "notes" window). Each user turn is prefixed with the list of open windows (id, title, body) so Claude can read them. A "Claude" chat window shows the last exchange. Windows open in an arc around the user.
- **Windows** have a close button (a cigarette burn in Sunnyvale, a glowing X in Stark): fingertip touch, point and pinch, or mouse click.
- **Unknown until tested on the Quest:** whether the Quest browser supports `SpeechRecognition` and has `speechSynthesis` voices. If not, the OpenAI key path is the fallback.

## Stark tools + Barbera (built 2026-10-20, the user approved all four tool sets)
- **Claude button with no API key:** it ends the XR session and opens https://claude.ai/new, so the user can use their Claude subscription there. Subscription OAuth for third-party apps isn't available, and WebXR can't show real websites in 3D. With a key in settings, Claude works inside the world, and it can also use `create_mind_map`, `create_timeline`, `make_flashcards` and `clear_desk`.
- **The Barbera heart button** (main menu row) ends XR and opens `https://wa.me/<number>`. The number is typed into the settings box and stored in localStorage only (`barberaNumber`). NEVER put it in the code, because the repo is public.
- **Menu layout:** the main row (y 0.17) has mode switch / Barbera / Stash, and the tool row (y 0.27, 0.8 scale) has Draw, Erase, Cards, Map, Timeline. The Claude bottle or orb stands left of the glass. The menu yaws to face the viewer, and `layoutRows()` spaces the visible buttons.
- **Holo objects** (`makeHoloObject`): an invisible handle plane goes in `panels` (so grabbing works) with the content as a child, plus a glowing close X. `userData.kind` is 'map' | 'timeline' | 'cards'. The built-in demos are DEMO_MAP (film language), DEMO_TIMELINE (film history) and DEMO_CARDS (film terms).
- **Touchables:** fingertip-touch zones (flashcards: tap flips, tap again for the next card; the wrist timer: tap to start or pause). Controller rays and the mouse work too.
- **Wrist HUD:** look at the back of your wrist (the negated palm normal facing the eyes, within 0.75m). It shows the clock, date, and a 25/5 Pomodoro ring, and Jarvis announces session ends via `jarvisSay` (speechSynthesis + HUD text).
- **Air drawing:** the Draw toggle. Pinch in empty air to draw additive gold lines (`drawings` group), and Erase clears them.
- **Jarvis gestures:** point at a far window and close your fist, and it flies to you (`isFist`, `flyTo`). Pinch the same object with both hands to resize it (`baseScale`). Flick a held object fast (more than 1.6 m/s) and it goes into the stash, and the Stash button (it shows a count) brings everything back. Voice commands weren't built (they need speech recognition / Claude in-world).
- **starkFX** (visible only in Stark mode): the holo workbench (shader disc, rings, light cone) placed 0.75m in front at waist height when entering Stark, floor rings that follow you, and dust particles. Sounds come from `blip()`.
- PC test keys: M menu, S mode, C Claude, W wrist display.

## Progress log
- 2026-10-20: Steps 1–3 done (the park, realism batches, grass, Sketchfab models, the palm menu, Stark mode, the transition, the first lag fix).
- 2026-10-20 (later): Claude voice button + window tools, close buttons, the desert-flash fix, more speed work (no shadows, pine batches). Waiting on the user's Quest test.
- 2026-10-20 (later still): the Stark tools + Barbera + the claude.ai fallback (see above). Waiting on the Quest test.
- **Next up (ask the user first):** test Claude on the Quest, confirm the lag status, then the remaining window gestures (the Stark fist-pull, two-hand resize, flick away into the menu), the inside-trailer scene, sounds and music.
