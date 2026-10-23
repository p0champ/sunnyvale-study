import test from "node:test";
import assert from "node:assert/strict";
import { appFixture } from "./app-fixture.mjs";
import { fixtures } from "./spatial-fixtures.mjs";
test(
  "all25 spatial tools construct; interactions, saved layouts and model parts work in the actual app",
  { timeout: 180000 },
  async () => {
    const f = await appFixture();
    try {
      await f.page.evaluate(() => {
        const d = studyDebug;
        d.renderer.setAnimationLoop(null);
        d.setMode("stark");
        document.getElementById("hint").style.display = "none";
        for (const p of [...d.workspace.allPanels()])
          d.workspace.closeWindow(p);
      });
      const ids = {};
      for (const [name, input] of Object.entries(fixtures)) {
        const r = await f.page.evaluate(
          async ({ name, input }) =>
            JSON.parse(await studyDebug.worldTool(name, input)),
          { name, input },
        );
        ids[name] = r.id;
        assert.ok(r.id, name);
      }
      const result = await f.page.evaluate(async (ids) => {
        const d = studyDebug,
          call = async (n, a) => JSON.parse(await d.worldTool(n, a)),
          get = (n) => d.desk.findWindow(ids[n]);
        const holo = get("create_hologram"),
          lens = holo.userData.nodes.lens,
          before = lens.position.toArray();
        await call("transform_hologram", {
          id: holo.userData.id,
          explode: 1,
          scale: 3,
          rotation: 0.5,
        });
        await call("annotate_hologram", {
          id: holo.userData.id,
          part: "lens",
          text: "Lens elements — schematic annotation",
        });
        const exploded =
          lens.position.distanceTo(new lens.position.constructor(...before)) >
          0.01;
        await call("point_at", { id: holo.userData.id, part: "sensor" });
        const pointed =
          d.thesis.avatar.state.anchor.mesh === holo.userData.nodes.sensor;
        const deck = get("create_scene_cards"),
          arrival = deck.userData.childrenTools.find(
            (p) => p.userData.partKey === "arrival",
          );
        arrival.position.copy(
          deck.localToWorld(new arrival.position.constructor(2, 0, 0)),
        );
        arrival.userData.onRelease();
        d.spatial.update(0);
        const manualOrder = [...deck.userData.state.order];
        await call("update_scene", {
          id: deck.userData.id,
          scene_id: "arrival",
          text: "Rewritten arrival.",
        });
        await call("reorder_scenes", {
          id: deck.userData.id,
          order: ["choice", "arrival", "discovery"],
        });
        const belief = get("create_belief_web");
        const affected = (
          await call("remove_belief", {
            id: belief.userData.id,
            belief_id: "a",
          })
        ).affected;
        const forge = get("create_idea_forge"),
          [a, b] = forge.userData.childrenTools;
        a.position.copy(b.position);
        d.spatial.update(0);
        const pending = await call("pending_combinations", {});
        await call("complete_combination", {
          id: forge.userData.id,
          synthesis:
            "A debate whose participants cannot leave until they revise one belief.",
        });
        await call("show_character_act", {
          id: ids.create_character_orbits,
          index: 1,
        });
        const ride = await call("ride_tension", {
          id: ids.create_tension_track,
          index: 2,
        });
        await call("set_light", {
          id: ids.sculpt_lights,
          light_id: "key",
          intensity: 3,
          color: "#ffccaa",
        });
        await call("move_actor", {
          id: ids.block_actors,
          actor_id: "a",
          position: [0.3, 0, -0.1],
        });
        const set = get("build_film_set");
        set.position.set(0, 1.2, -2);
        set.quaternion.identity();
        d.spatial.update(0);
        const cam = get("create_virtual_camera");
        cam.userData.cameraHandle.position.set(0, 1.3, -1);
        await call("aim_camera", {
          id: cam.userData.id,
          target: [0, 1.2, -2],
          lens_mm: 35,
        });
        const frame = await call("save_camera_frame", { id: cam.userData.id });
        const strengths = get("create_strength_glow").userData.state,
          metrics = get("create_echo_bubble").userData.state.metrics,
          bias = get("create_bias_lens").userData.state.matches;
        d.workspace.saveDesk();
        return {
          exploded,
          pointed,
          manualOrder,
          affected,
          pending: pending.length,
          forge: forge.userData.state.result,
          ride: ride.scene.title,
          frame,
          weak: strengths.weak.score,
          strong: strengths.strong.score,
          metrics,
          bias: bias.length,
          script: JSON.parse(
            localStorage.getItem("sunnyvale.script.v1"),
          ).scenes.map((s) => s.id),
          count: [...d.spatial.live].length,
        };
      }, ids);
      assert.equal(result.count, 25);
      assert.equal(result.exploded, true);
      assert.equal(result.pointed, true);
      assert.deepEqual(result.manualOrder, ["discovery", "choice", "arrival"]);
      assert.deepEqual(result.affected, ["a", "b", "c"]);
      assert.equal(result.pending, 1);
      assert.match(result.forge, /debate/);
      assert.equal(result.ride, "Breath");
      assert.equal(result.frame.saved, true);
      assert.ok(result.frame.fileId);
      assert.equal(result.weak, 0);
      assert.equal(result.strong, 1);
      assert.equal(result.metrics.groups, 2);
      assert.ok(result.bias >= 3);
      assert.deepEqual(result.script, ["choice", "arrival", "discovery"]);
      // Inspect each family from front and side. Other tools are hidden for legibility.
      for (const [name, label] of [
        ["create_hologram", "hologram"],
        ["create_scene_cards", "scene-cards"],
        ["build_film_set", "film-set"],
        ["create_propaganda_radar", "radar"],
        ["create_belief_web", "belief-web"],
        ["create_bias_lens", "bias-lens"],
        ["create_film_globe", "globe"],
        ["create_character_orbits", "characters"],
        ["create_quote_orbits", "quote-orbits"],
        ["create_money_flow", "money-flow"],
        ["create_source_constellation", "sources"],
        ["create_strength_glow", "strength"],
        ["create_counter_duel", "duel"],
        ["create_steelman_statue", "steelman"],
        ["create_echo_bubble", "echo-bubble"],
        ["create_influence_map", "influence"],
        ["create_lineage_tree", "lineage"],
        ["block_actors", "actors"],
        ["create_virtual_camera", "camera"],
        ["sculpt_lights", "lights"],
        ["create_idea_forge", "idea-forge"],
      ]) {
        await f.page.evaluate(
          ({ id, name }) => {
            const d = studyDebug;
            for (const p of d.workspace.allPanels()) p.visible = false;
            const p = d.desk.findWindow(id);
            p.visible = true;
            p.position.set(0, 1.4, -1.7);
            p.quaternion.identity();
            p.scale.setScalar(1);
            p.userData.popIn = undefined;
            d.spatial.update(0);
            if (name === "create_hologram")
              d.spatial.tools.transform_hologram({
                id,
                scale: 1.3,
                rotation: 0.3,
                explode: 0.5,
              });
            for (const c of p.userData.childrenTools) {
              c.visible = true;
              c.userData.powerUp = undefined;
              if (c.userData.scanLine) c.userData.scanLine.visible = false;
            }
            d.look(0, 1.65, 0.5, 0, 1.35, -1.7);
          },
          { id: ids[name], name },
        );
        await f.shot("build-d-" + label + "-front");
        await f.page.evaluate(() =>
          studyDebug.look(0.6, 1.8, 0.5, 0, 1.35, -1.7),
        );
        await f.shot("build-d-" + label + "-side");
      }
      await f.page.reload();
      await f.page.waitForFunction(() => studyDebug.spatial);
      const restored = await f.page.evaluate((ids) => {
        const d = studyDebug;
        d.renderer.setAnimationLoop(null);
        d.spatial.update(0);
        const h = d.desk.findWindow(ids.create_hologram),
          deck = d.desk.findWindow(ids.create_scene_cards);
        return {
          count: d.spatial.live.size,
          scale: h.userData.state.scale,
          annotations: h.userData.state.annotations.length,
          order: deck.userData.state.order,
          draft: deck.userData.draft.userData.body,
          removed: d.desk.findWindow(ids.create_belief_web).userData.state
            .removed,
        };
      }, ids);
      assert.equal(restored.count, 25);
      assert.equal(restored.scale, 1.3);
      assert.equal(restored.annotations, 1);
      assert.deepEqual(restored.order, ["choice", "arrival", "discovery"]);
      assert.match(restored.draft, /Rewritten arrival/);
      assert.deepEqual(restored.removed, ["a"]);
      assert.deepEqual(f.errors, []);
    } finally {
      await f.close();
    }
  },
);

test(
  "GLB library model validates, loads named parts, explodes and rejects unknown schematic promises",
  { timeout: 40000 },
  async () => {
    const f = await appFixture();
    try {
      const r = await f.page.evaluate(async () => {
        const d = studyDebug;
        d.renderer.setAnimationLoop(null);
        const json = {
          asset: { version: "2.0" },
          scene: 0,
          scenes: [{ nodes: [0] }],
          nodes: [{ name: "sensor", mesh: 0 }],
          meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
          buffers: [{ byteLength: 36 }],
          bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
          accessors: [
            {
              bufferView: 0,
              componentType: 5126,
              count: 3,
              type: "VEC3",
              min: [0, 0, 0],
              max: [1, 1, 0],
            },
          ],
        };
        const bytes = new TextEncoder().encode(JSON.stringify(json)),
          len = Math.ceil(bytes.length / 4) * 4,
          total = 12 + 8 + len + 8 + 36,
          buf = new ArrayBuffer(total),
          v = new DataView(buf);
        v.setUint32(0, 0x46546c67, true);
        v.setUint32(4, 2, true);
        v.setUint32(8, total, true);
        v.setUint32(12, len, true);
        v.setUint32(16, 0x4e4f534a, true);
        const out = new Uint8Array(buf);
        out.fill(32, 20, 20 + len);
        out.set(bytes, 20);
        v.setUint32(20 + len, 36, true);
        v.setUint32(24 + len, 0x004e4942, true);
        new Float32Array(buf, 28 + len, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
        await d.thesis.addFiles([
          new File([buf], "Fixture.glb", { type: "model/gltf-binary" }),
        ]);
        const fileId = JSON.parse(localStorage.getItem("sunnyvale.library")).at(
          -1,
        ).id;
        const made = JSON.parse(
            await d.worldTool("create_hologram", {
              title: "Imported fixture",
              fileId,
            }),
          ),
          p = d.desk.findWindow(made.id);
        await p.userData.ready;
        if (p.userData.error) throw Error(p.userData.error);
        const parts = Object.keys(p.userData.nodes);
        await d.worldTool("transform_hologram", { id: made.id, explode: 2 });
        let rejected = false;
        try {
          await d.worldTool("create_hologram", {
            title: "Unprovided exact product",
          });
        } catch {
          rejected = true;
        }
        await d.worldTool("annotate_hologram", {
          id: made.id,
          part: parts[0],
          text: "Fixture part",
        });
        return {
          parts,
          rejected,
          exploded: Object.values(p.userData.nodes)[0].position.length() > 0,
          annotations: p.userData.state.annotations.length,
        };
      });
      assert.ok(r.parts.length);
      assert.equal(r.rejected, true);
      assert.equal(r.exploded, true);
      assert.equal(r.annotations, 1);
      assert.deepEqual(f.errors, []);
    } finally {
      await f.close();
    }
  },
);
