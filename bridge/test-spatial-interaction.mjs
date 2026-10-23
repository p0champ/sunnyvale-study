import test from "node:test";
import assert from "node:assert/strict";
import { appFixture } from "./app-fixture.mjs";
import { fixtures } from "./spatial-fixtures.mjs";
const call = (page, name, input) =>
  page.evaluate(
    async ({ name, input }) =>
      JSON.parse(await studyDebug.worldTool(name, input)),
    { name, input },
  );
async function start() {
  const f = await appFixture();
  await f.page.evaluate(() => {
    const d = studyDebug;
    d.renderer.setAnimationLoop(null);
    d.setMode("stark");
    document.getElementById("hint").style.display = "none";
    for (const p of [...d.workspace.allPanels()]) d.workspace.closeWindow(p);
  });
  return f;
}

test(
  "actual pointer grab/release reorders cards, keeps size and restores rotated parent/child poses",
  { timeout: 40000 },
  async () => {
    const f = await start();
    try {
      const { id } = await call(
        f.page,
        "create_scene_cards",
        fixtures.create_scene_cards,
      );
      const points = await f.page.evaluate((id) => {
        const d = studyDebug,
          THREE = d.workspace.THREE,
          p = d.desk.findWindow(id);
        p.position.set(0, 1.4, -2);
        p.quaternion.identity();
        d.spatial.update(0);
        d.look(0, 1.5, 0.4, 0, 1.4, -2);
        const c = p.userData.childrenTools.find(
          (c) => c.userData.partKey === "arrival",
        );
        const project = (v) => {
          v.project(d.camera);
          return { x: (v.x + 1) * 720, y: (1 - v.y) * 500 };
        };
        return {
          from: project(c.position.clone()),
          to: project(p.localToWorld(new THREE.Vector3(1.05, 0.02, 0.15))),
        };
      }, id);
      await f.page.mouse.move(points.from.x, points.from.y);
      await f.page.mouse.down();
      await f.page.mouse.move(points.to.x, points.to.y, { steps: 10 });
      await f.page.mouse.up();
      const moved = await f.page.evaluate((id) => {
        const d = studyDebug,
          p = d.desk.findWindow(id);
        d.spatial.update(0);
        const c = p.userData.childrenTools.find(
          (c) => c.userData.partKey === "arrival",
        );
        return {
          order: p.userData.state.order,
          scale: c.scale.x,
          held: c.userData.held,
        };
      }, id);
      assert.deepEqual(moved.order, ["discovery", "choice", "arrival"]);
      assert.equal(moved.scale, 0.65);
      assert.equal(moved.held, false);
      const saved = await f.page.evaluate((id) => {
        const d = studyDebug,
          THREE = d.workspace.THREE,
          p = d.desk.findWindow(id);
        p.position.add(new THREE.Vector3(0.4, 0.1, -0.2));
        p.rotation.y = 0.35;
        p.scale.setScalar(1.25);
        p.userData.baseScale = 1.25;
        d.spatial.update(0);
        d.workspace.stash(p);
        d.spatial.update(0);
        if (p.userData.childrenTools.some((c) => c.visible))
          throw Error("Stashed parent left children visible");
        d.workspace.reveal(p);
        p.userData.popIn = undefined;
        p.scale.setScalar(1.25);
        d.spatial.update(0);
        const children = p.userData.childrenTools.map((c) => ({
          key: c.userData.partKey,
          p: c.position.toArray(),
          q: c.quaternion.toArray(),
          s: c.scale.toArray(),
        }));
        const group = d.gestures.groupWindows();
        if (group.some((c) => c.userData.spatialParent === p))
          throw Error("Group move includes both parent and child");
        d.workspace.saveDesk();
        return { children, pose: p.position.toArray() };
      }, id);
      await f.page.reload();
      await f.page.waitForFunction(() => studyDebug.spatial);
      const restored = await f.page.evaluate((id) => {
        const d = studyDebug;
        d.renderer.setAnimationLoop(null);
        d.spatial.update(0);
        const p = d.desk.findWindow(id);
        return {
          children: p.userData.childrenTools.map((c) => ({
            key: c.userData.partKey,
            p: c.position.toArray(),
            q: c.quaternion.toArray(),
            s: c.scale.toArray(),
          })),
          pose: p.position.toArray(),
        };
      }, id);
      const close = (a, b) =>
        a.forEach((v, i) =>
          assert.ok(Math.abs(v - b[i]) < 0.00001, `${v} != ${b[i]}`),
        );
      close(saved.pose, restored.pose);
      for (const before of saved.children) {
        const after = restored.children.find((c) => c.key === before.key);
        for (const key of ["p", "q", "s"]) close(before[key], after[key]);
      }
      assert.deepEqual(f.errors, []);
    } finally {
      await f.close();
    }
  },
);

test(
  "camera pixels contain virtual stage and exclude unrelated global UI",
  { timeout: 40000 },
  async () => {
    const f = await start();
    try {
      const set = await call(f.page, "build_film_set", fixtures.build_film_set),
        camera = await call(
          f.page,
          "create_virtual_camera",
          fixtures.create_virtual_camera,
        );
      const result = await f.page.evaluate(
        async ({ set, camera }) => {
          const d = studyDebug,
            THREE = d.workspace.THREE,
            s = d.desk.findWindow(set.id),
            p = d.desk.findWindow(camera.id);
          s.position.set(0, 1.3, -2);
          s.quaternion.identity();
          d.spatial.update(0);
          p.userData.cameraHandle.position.set(0, 1.4, -0.9);
          await d.worldTool("aim_camera", {
            id: camera.id,
            target: [0, 1.3, -2],
            lens_mm: 35,
          });
          async function pixels() {
            const r = JSON.parse(
                await d.worldTool("save_camera_frame", { id: camera.id }),
              ),
              blob = await d.thesis.getLibraryFile(r.fileId),
              image = await createImageBitmap(blob),
              c = document.createElement("canvas");
            c.width = image.width;
            c.height = image.height;
            const g = c.getContext("2d");
            g.drawImage(image, 0, 0);
            return g.getImageData(0, 0, c.width, c.height).data;
          }
          const before = await pixels();
          const poison = new THREE.Mesh(
            new THREE.PlaneGeometry(10, 10),
            new THREE.MeshBasicMaterial({
              color: 0x00ff00,
              side: THREE.DoubleSide,
            }),
          );
          poison.position.set(0, 1.3, -1.4);
          d.scene.add(poison);
          await d.worldTool("show_message", {
            lines: ["CAMERA MUST NOT CAPTURE THIS"],
            seconds: 30,
          });
          const after = await pixels();
          let changed = 0,
            nonblack = 0;
          for (let i = 0; i < before.length; i += 4) {
            if (
              before[i] !== after[i] ||
              before[i + 1] !== after[i + 1] ||
              before[i + 2] !== after[i + 2]
            )
              changed++;
            if (before[i] + before[i + 1] + before[i + 2] > 20) nonblack++;
          }
          d.scene.remove(poison);
          poison.geometry.dispose();
          poison.material.dispose();
          return { changed, nonblack };
        },
        { set, camera },
      );
      assert.equal(result.changed, 0);
      assert.ok(result.nonblack > 1000);
      assert.deepEqual(f.errors, []);
    } finally {
      await f.close();
    }
  },
);

test(
  "human-scale navigation, walk-inside geometry, physical lenses, saved radar and meaningful motion",
  { timeout: 60000 },
  async () => {
    const f = await start();
    try {
      const names = [
        "create_beat_corridor",
        "create_argument_tower",
        "create_tension_track",
        "create_quote_orbits",
        "create_character_orbits",
        "create_belief_web",
      ];
      const ids = {};
      for (const name of names)
        ids[name] = (await call(f.page, name, fixtures[name])).id;
      const result = await f.page.evaluate(async (ids) => {
        const d = studyDebug,
          THREE = d.workspace.THREE,
          call = async (n, a) => JSON.parse(await d.worldTool(n, a));
        const beat = await call("navigate_beat", {
            id: ids.create_beat_corridor,
            index: 1,
          }),
          floor = await call("navigate_argument_floor", {
            id: ids.create_argument_tower,
            index: 1,
          });
        const track = d.desk.findWindow(ids.create_tension_track);
        await call("start_tension_ride", { id: track.userData.id });
        const start = track.userData.virtualCamera.position.clone();
        for (let i = 0; i < 90; i++) d.spatial.update(1 / 60);
        const rideMoves =
          start.distanceTo(track.userData.virtualCamera.position) > 0.05;
        const rideCamera = track.userData.virtualCamera;
        const expectedAim = track.children[0].localToWorld(
          track.userData.curve
            .getPoint(Math.min(1, track.userData.rideTime + 0.035))
            .add(new THREE.Vector3(0, 0.06, 0)),
        );
        const actualAim = rideCamera.getWorldDirection(new THREE.Vector3());
        const rideAimed =
          actualAim.dot(
            expectedAim
              .sub(rideCamera.getWorldPosition(new THREE.Vector3()))
              .normalize(),
          ) > 0.999;
        const q = d.desk.findWindow(ids.create_quote_orbits),
          quote = Object.entries(q.userData.nodes).find(
            ([id]) => id !== "claim",
          )[1],
          old = quote.position.clone();
        d.spatial.update(1);
        const orbits = quote.position.distanceTo(old) > 0.01;
        const belief = d.desk.findWindow(ids.create_belief_web);
        await call("remove_belief", { id: belief.userData.id, belief_id: "a" });
        d.spatial.update(0.1);
        const wobbles =
          belief.userData.nodes.b.position.distanceTo(
            belief.userData.beliefHomes.b,
          ) > 0.0001;
        const article = JSON.parse(
          await d.worldTool("open_window", {
            title: "Synthetic article",
            body: "Obviously everyone knows the traitor always lies. Synthetic test only.",
          }),
        );
        const target = d.desk.findWindow(article.id);
        target.position.set(0, 1.4, -1.7);
        target.quaternion.identity();
        const made = await call("create_bias_lens", {
            title: "Physical framing lens",
            text: "Neutral initial wording.",
          }),
          lens = d.desk.findWindow(made.id);
        lens.position.set(0, 1.4, -1.6);
        lens.quaternion.identity();
        lens.userData.held = true;
        d.spatial.update(0.1);
        await new Promise((r) => setTimeout(r, 30));
        lens.userData.held = false;
        const physicalMatches = lens.userData.state.matches.length;
        const xmade = await call("create_assumption_xray", {
            title: "Physical premise lens",
            argument: "Obviously everyone knows",
            window_id: article.id,
            premises: [
              {
                text: "Consensus establishes truth.",
                basis: "Proposed premise only.",
              },
            ],
          }),
          xray = d.desk.findWindow(xmade.id);
        xray.position.copy(lens.position);
        d.spatial.update(0.1);
        await new Promise((r) => setTimeout(r, 30));
        const premiseRevealed = xray.userData.state.hidden === false;
        const row = {
          film: "Saved A",
          scene: "Fixture",
          scores: { enemy: 1, music: 2, military: 3, framing: 4, message: 5 },
        };
        localStorage.setItem(
          "sunnyvale.checklists",
          JSON.stringify([
            row,
            {
              ...row,
              film: "Saved B",
              scores: {
                enemy: 2,
                music: 3,
                military: 4,
                framing: 5,
                message: 1,
              },
            },
          ]),
        );
        const radar = await call("create_propaganda_radar", {
            title: "From saved analysis",
            films: ["Saved A", "Saved B"],
          }),
          fromStore = d.desk
            .findWindow(radar.id)
            .userData.spatial.spec.films.every((f) => f.from_checklist);
        const h = await call("create_hologram", {
          title: "Walk-inside set schematic",
          preset: "set",
        });
        await call("transform_hologram", { id: h.id, scale: 6 });
        await call("ground_hologram", { id: h.id, height: 0 });
        const hp = d.desk.findWindow(h.id);
        hp.position.x = 4;
        hp.quaternion.identity();
        hp.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(hp.userData.model),
          eye = new THREE.Vector3(4, 1.6, hp.position.z);
        const inside = bounds.containsPoint(eye),
          grounded = Math.abs(bounds.min.y) < 0.00001;
        d.workspace.saveDesk();
        return {
          beat: beat.doorway_metres,
          floor: floor.floor,
          rideMoves,
          rideAimed,
          orbits,
          wobbles,
          physicalMatches,
          premiseRevealed,
          fromStore,
          inside,
          grounded,
          holo: h.id,
          lens: made.id,
          xray: xmade.id,
          article: article.id,
          track: track.userData.id,
        };
      }, ids);
      assert.deepEqual(result.beat, [0.94, 1.95]);
      assert.equal(result.floor, 1);
      for (const k of [
        "rideMoves",
        "rideAimed",
        "orbits",
        "wobbles",
        "premiseRevealed",
        "fromStore",
        "inside",
        "grounded",
      ])
        assert.equal(result[k], true, k);
      assert.ok(result.physicalMatches >= 3);
      // Render evidence of the promised experience rather than just a construction count.
      for (const [name, id] of [
        ["corridor", ids.create_beat_corridor],
        ["tower", ids.create_argument_tower],
        ["ride-view", result.track],
        ["physical-lens", result.lens],
      ]) {
        await f.page.evaluate(
          ({ id, name }) => {
            const d = studyDebug;
            for (const p of d.workspace.allPanels()) p.visible = false;
            const p = d.desk.findWindow(id);
            p.visible = true;
            p.position.set(0, 1.4, -1.6);
            p.quaternion.identity();
            if (name === "physical-lens") {
              const source = d.workspace
                .allPanels()
                .find((p) => p.userData.title === "Synthetic article");
              source.visible = true;
              source.position.set(0.65, 1.4, -1.8);
            }
            d.spatial.update(0.01);
            d.look(
              0,
              name === "corridor" || name === "tower" ? 1.7 : 1.55,
              1,
              0,
              1,
              -1.6,
            );
          },
          { id, name },
        );
        await f.shot("build-d-" + name + "-front");
        await f.page.evaluate(() => studyDebug.look(0.8, 1.8, 1, 0, 1, -1.6));
        await f.shot("build-d-" + name + "-side");
      }
      await f.page.evaluate((id) => {
        const d = studyDebug;
        for (const p of d.workspace.allPanels()) p.visible = false;
        const p = d.desk.findWindow(id);
        p.visible = true;
        p.position.x = 0;
        p.quaternion.identity();
        p.updateMatrixWorld(true);
        d.look(1.8, 1.7, p.position.z + 1.2, -1, 1.35, p.position.z - 2);
      }, result.holo);
      await f.shot("build-d-walk-inside");
      assert.deepEqual(f.errors, []);
    } finally {
      await f.close();
    }
  },
);

test(
  "twelve-source and twelve-claim layouts have distinct readable labels and inspectable targets",
  { timeout: 40000 },
  async () => {
    const f = await start();
    try {
      const source = await call(f.page, "create_source_constellation", {
        title: "Twelve sources — density fixture",
        sources: Array.from({ length: 12 }, (_, i) => ({
          id: "s" + i,
          title: "Film theory source " + (i + 1),
          citations: i * 4,
          cites: i ? ["s" + (i - 1)] : [],
        })),
      });
      const claims = await call(f.page, "create_strength_glow", {
        title: "Twelve claims — density fixture",
        claims: Array.from({ length: 12 }, (_, i) => ({
          id: "c" + i,
          claim: "Claim " + (i + 1) + ": check the framing",
          evidence: [],
        })),
      });
      for (const [label, id] of [
        ["dense-sources", source.id],
        ["dense-claims", claims.id],
      ]) {
        const r = await f.page.evaluate(
          ({ id }) => {
            const d = studyDebug,
              T = d.workspace.THREE;
            for (const p of d.workspace.allPanels()) p.visible = false;
            const p = d.desk.findWindow(id);
            p.visible = true;
            p.position.set(0, 1.4, -2.2);
            p.quaternion.identity();
            d.spatial.update(0.01);
            p.updateMatrixWorld(true);
            const boxes = Object.values(p.userData.nodes).map((o) => {
              const label = o.children.find((c) => c.userData.spatialLabel);
              return new T.Box3().setFromObject(label);
            });
            let overlaps = 0;
            for (let i = 0; i < boxes.length; i++)
              for (let j = i + 1; j < boxes.length; j++)
                if (
                  boxes[i].min.x < boxes[j].max.x &&
                  boxes[j].min.x < boxes[i].max.x &&
                  boxes[i].min.y < boxes[j].max.y &&
                  boxes[j].min.y < boxes[i].max.y
                )
                  overlaps++;
            d.look(0, 1.5, 0.5, 0, 1.4, -2.2);d.camera.updateMatrixWorld(true);
            const target = Object.values(p.userData.nodes)[0]
              .children.find((c) => c.userData.spatialLabel)
              .getWorldPosition(new T.Vector3())
              .project(d.camera);
            return {
              count: boxes.length,
              overlaps,
              click: { x: (target.x + 1) * 720, y: (1 - target.y) * 500 },
            };
          },
          { id },
        );
        assert.equal(r.count, 12);
        assert.equal(r.overlaps, 0);
        await f.shot("build-d-" + label + "-front");
        await f.page.evaluate(() =>
          studyDebug.look(0.5, 1.7, 0.4, 0, 1.4, -2.2),
        );
        await f.shot("build-d-" + label + "-side");
        if (label === "dense-sources") {
          await f.page.evaluate(() =>{studyDebug.look(0,1.5,.5,0,1.4,-2.2);studyDebug.camera.updateMatrixWorld(true);});
          await f.page.mouse.click(r.click.x, r.click.y);
          assert.equal(
            await f.page.evaluate(() =>
              studyDebug.workspace
                .allPanels()
                .some(
                  (p) =>
                    p.userData.title === "Film theory source 1" &&
                    p.userData.noSave,
                ),
            ),
            true,
          );
        }
      }
      assert.deepEqual(f.errors, []);
    } finally {
      await f.close();
    }
  },
);
