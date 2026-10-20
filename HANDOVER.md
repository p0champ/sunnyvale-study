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
- **Sunnyvale is still laggy on the Quest** even after merging meshes (4,452 → about 235 draw calls). Next ideas: lower the XR framebuffer scale, turn shadows off on the Quest, split the pine InstancedMesh into chunks so culling works, reduce heavy meshes (three cat scans of 28k triangles each, the projector at 32k, crates at 18k each), and cut alpha-tested foliage overdraw (maple leaves, pine needles).
- **Transition bug:** on the Quest, going to Stark showed a bright "desert" for about 2 seconds before the room. Probably the fading sky sphere. Being fixed so the sky dissolves with the shockwave instead of fading.
- Palm menu, Stark mode and the transition work on the Quest according to the user.
- See the progress log below for what was done after this file was written.

## Progress log
- 2026-10-20: Steps 1–3 done (the park, realism batches, grass, Sketchfab models, the palm menu, Stark mode, the transition, the first lag fix).
