import { installSpatialExperiences } from "./spatial-experiences.js";
// Local geometry and interactions. Research and explanations are supplied by
// Claude or the user; a schematic is never presented as an exact product model.
export function installSpatialTools(ctx) {
  const {
    THREE,
    scene,
    panels,
    holoLabel,
    makeHoloObject,
    placeInFront,
    touchables,
    readJSON,
    writeJSON,
    markDirty,
  } = ctx;
  const live = new Set(),
    pending = new Map(),
    ambient = new THREE.HemisphereLight(0xffffff, 0x536070, 1.8);
  scene.add(ambient);
  let busy = Promise.resolve();
  const V = (a) => new THREE.Vector3(...a),
    ok = (o) => JSON.stringify(o),
    copy = (o) => JSON.parse(JSON.stringify(o));
  const sameMatrix = (a, b) =>
    a.elements.every((v, i) => Math.abs(v - b.elements[i]) < 0.000001);
  const P = {
    coral: 0xd97757,
    blue: 0x91bfea,
    amber: 0xdfb478,
    green: 0x9bc8a6,
    red: 0xdd827a,
  };
  const text = (v, max = 6000) => String(v ?? "").slice(0, max);
  function list(a, name, min = 1, max = 24) {
    if (!Array.isArray(a) || a.length < min || a.length > max)
      throw Error(name + " requires " + min + "–" + max + " items.");
    return a;
  }
  function num(v, name, min = -1000, max = 1000) {
    if (!Number.isFinite(v) || v < min || v > max)
      throw Error(name + " must be " + min + "–" + max + ".");
    return v;
  }
  function vec(v, name, min = -20, max = 20) {
    if (!Array.isArray(v) || v.length !== 3)
      throw Error(name + " needs three coordinates.");
    return v.map((x) => num(x, name, min, max));
  }
  function unique(a) {
    const ids = a.map((x, i) => String(x.id ?? i));
    if (new Set(ids).size !== ids.length) throw Error("Items need unique ids.");
    a.forEach((x, i) => (x.id = ids[i]));
    return a;
  }
  function mesh(geo, color = P.blue) {
    return new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.72,
        metalness: 0.05,
      }),
    );
  }
  const box = (size, color) => mesh(new THREE.BoxGeometry(...size), color),
    ball = (r, color) => mesh(new THREE.SphereGeometry(r, 20, 12), color);
  function line(parent, pts, color = P.coral) {
    const o = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        pts.map((p) => (p.isVector3 ? p : V(p))),
      ),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }),
    );
    parent.add(o);
    return o;
  }
  function dispose(root) {
    root.traverse((o) => {
      o.geometry?.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        if (m) {
          for (const k of [
            "map",
            "normalMap",
            "roughnessMap",
            "metalnessMap",
            "emissiveMap",
          ])
            m[k]?.dispose();
          m.dispose();
        }
    });
  }
  function label(parent, t, position, w = 0.28, h = 0.065, action) {
    const l = holoLabel(text(t, 100), { w, h });
    l.userData.spatialLabel = true;
    l.position.fromArray(position);
    parent.add(l);
    if (action) touchables.push({ mesh: l, w, h, owner: parent, action });
    return l;
  }
  function detail(title, data) {
    const p = ctx.openWindow(
      title,
      typeof data === "string" ? data : JSON.stringify(data, null, 2),
    );
    p.userData.noSave = true;
    return p;
  }
  const button = (p, t, x, fn) =>
    label(
      p.children[0],
      t,
      [x, p.userData.controlY ?? -0.38, 0.06],
      0.21,
      0.065,
      fn,
    );
  function node(p, id, title, at, info, color = P.blue, shape = "sphere") {
    const g = p.children[0],
      o = shape === "box" ? box([0.13, 0.13, 0.09], color) : ball(0.055, color);
    o.position.fromArray(at);
    g.add(o);
    p.userData.nodes[id] = o;
    label(
      o,
      text(title, 28) + (String(title).length > 28 ? "…" : ""),
      [0, -0.09, 0.03],
      0.3,
      0.075,
      () => detail(title, info),
    );
    touchables.push({
      mesh: o,
      w: 0.14,
      h: 0.14,
      owner: p,
      action: () => detail(title, info),
    });
    return o;
  }
  function edge(p, a, b, weight = 1, color = P.coral) {
    const start = V(a),
      end = V(b),
      dir = end.clone().sub(start),
      length = dir.length();
    if (length < 0.00001) return;
    const o = mesh(
      new THREE.CylinderGeometry(
        0.002 + Math.min(10, weight) * 0.0015,
        0.002 + Math.min(10, weight) * 0.0015,
        length,
        8,
      ),
      color,
    );
    o.position.copy(start).add(end).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(V([0, 1, 0]), dir.normalize());
    p.children[0].add(o);
    return o;
  }
  const ring = (n, r = 0.48) =>
    Array.from({ length: n }, (_, i) =>
      n > 8
        ? [
            ((i % (n > 20 ? 6 : 4)) - ((n > 20 ? 6 : 4) - 1) / 2) * 0.41,
            ((Math.ceil(n / (n > 20 ? 6 : 4)) - 1) / 2 -
              Math.floor(i / (n > 20 ? 6 : 4))) *
              0.32,
            ((i % 3) - 1) * 0.06,
          ]
        : [
            Math.cos((i / n) * Math.PI * 2) * r,
            Math.sin((i / n) * Math.PI * 2) * r * 0.65,
            Math.sin((i / n) * Math.PI * 4) * 0.09,
          ],
    );
  function base(kind, s) {
    const count = Math.max(
      s.sources?.length || 0,
      s.claims?.length || 0,
      s.beliefs?.length || 0,
      s.influences?.length || 0,
      s.entities?.length || 0,
      s.characters?.length || 0,
      s.quotes?.length || 0,
    );
    const diagram = [
      "source_constellation",
      "strength_glow",
      "belief_web",
      "influence_map",
      "money_flow",
      "character_orbits",
      "quote_orbits",
    ].includes(kind);
    const height =
      kind === "hologram"
        ? 1.25
        : kind === "money_flow" || kind === "film_globe"
          ? Math.max(1.2, Math.ceil(count / (count > 20 ? 6 : 4)) * 0.32 + 0.45)
          : diagram && count > 8
            ? Math.max(
                0.95,
                Math.ceil(count / (count > 20 ? 6 : 4)) * 0.32 + 0.45,
              )
            : 0.95;
    const width = diagram && count > 8 ? (count > 20 ? 2.7 : 1.85) : 1.35;
    const g = new THREE.Group(),
      p = makeHoloObject(
        g,
        width,
        height,
        s.title || kind.replaceAll("_", " "),
        kind,
      );
    p.userData.controlY =
      diagram && count > 8
        ? -height / 2 + 0.055
        : height > 0.96
          ? -height / 2 + 0.2
          : -0.38;
    p.userData.spatial = { kind, spec: s };
    p.userData.nodes = {};
    p.userData.body = text(JSON.stringify(s), 5000);
    p.userData.childrenTools = [];
    p.userData.state = {};
    label(
      g,
      s.title || kind.replaceAll("_", " ").toUpperCase(),
      [0, height / 2 - 0.065, 0.04],
      0.9,
      0.085,
    );
    placeInFront(p, 1.3, -0.04);
    p.userData.popIn = undefined;
    p.userData.save = () => ({
      type: "spatial",
      kind,
      spec: copy(s),
      state: copy(p.userData.state),
      children: p.userData.childrenTools
        .filter((c) => c.parent)
        .map((c) => childPose(p, c)),
    });
    p.userData.onClose = () => {
      for (const c of [...p.userData.childrenTools])
        if (c.parent) ctx.closeWindow(c);
      pending.delete(p.userData.id);
      live.delete(p);
      dispose(g);
    };
    live.add(p);
    return p;
  }
  function childPose(p, c) {
    p.updateMatrixWorld(true);
    c.updateMatrixWorld(true);
    const local = p.matrixWorld.clone().invert().multiply(c.matrixWorld),
      position = new THREE.Vector3(),
      q = new THREE.Quaternion(),
      scale = new THREE.Vector3();
    local.decompose(position, q, scale);
    return {
      key: c.userData.partKey,
      position: position.toArray(),
      q: q.toArray(),
      scale: scale.toArray(),
      stashed: !panels.includes(c),
    };
  }
  function child(p, key, title, body, at, content) {
    const c = content
      ? makeHoloObject(content, 0.28, 0.32, title, "spatial-part")
      : ctx.openWindow(title, body);
    c.userData.noSave = true;
    c.userData.partKey = key;
    c.userData.spatialParent = p;
    c.userData.body = body;
    c.userData.popIn = undefined;
    c.scale.setScalar(content ? 1 : 0.65);
    c.userData.baseScale = c.scale.x;
    p.updateMatrixWorld(true);
    c.position.copy(p.localToWorld(V(at)));
    c.quaternion.copy(p.quaternion);
    p.userData.childrenTools.push(c);
    c.userData.paintReady = false;
    c.visible = false;
    const revealPainted = () => {
      c.userData.paintReady = true;
      c.visible =
        !!p.parent && p.visible && panels.includes(p) && panels.includes(c);
    };
    if (ctx.afterPaint) ctx.afterPaint(revealPainted);
    else revealPainted();
    c.userData.onRelease = () => {
      p.userData.changed = true;
      markDirty();
    };
    return c;
  }
  function resolve(id, kind) {
    const p = ctx.findWindow(id);
    if (!p?.userData.spatial || (kind && p.userData.spatial.kind !== kind))
      throw Error("Choose an open " + (kind || "3D tool") + " id.");
    return p;
  }
  function order(p, ids) {
    const s = p.userData.spatial.spec;
    if (
      !Array.isArray(ids) ||
      ids.length !== s.scenes.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !s.scenes.some((x) => x.id === id))
    )
      throw Error("Provide every scene id exactly once.");
    s.scenes.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    p.userData.state.order = [...ids];
    let draft = p.userData.draft;
    if (!draft?.parent) {
      draft = child(p, "draft", "Script draft", "", [0, -0.75, 0.15]);
      p.userData.draft = draft;
    }
    const body = s.scenes
      .map(
        (v, i) => i + 1 + ". " + v.title + "\n" + (v.text || v.summary || ""),
      )
      .join("\n\n");
    ctx.setWindowContent(draft, "Script draft", body);
    writeJSON("sunnyvale.script.v1", { title: s.title, scenes: s.scenes });
    p.userData.body = body;
    markDirty();
    return ids;
  }
  const builders = {
    hologram(p, s) {
      if (
        !s.fileId &&
        !s.components &&
        !["camera", "building", "set"].includes(s.preset)
      )
        throw Error(
          "Choose camera/building/set schematic, supply component geometry, or load a library GLB. Exact product models require the actual asset.",
        );
      const model = new THREE.Group();
      p.children[0].add(model);
      p.userData.model = model;
      Object.assign(p.userData.state, { explode: 0, scale: 1, rotation: 0 });
      if (s.fileId) {
        p.userData.ready = loadModel(p, s.fileId).catch((e) => {
          p.userData.error = e.message;
          ctx.announce("MODEL: " + e.message);
        });
      } else {
        const defaults =
          s.preset === "building"
            ? [
                {
                  id: "structure",
                  size: [0.5, 0.4, 0.35],
                  position: [0, 0, 0],
                },
                { id: "roof", size: [0.56, 0.04, 0.4], position: [0, 0.23, 0] },
              ]
            : s.preset === "set"
              ? [
                  {
                    id: "back wall left",
                    size: [0.35, 0.5, 0.035],
                    position: [-0.325, 0, -0.3],
                  },
                  {
                    id: "back wall right",
                    size: [0.35, 0.5, 0.035],
                    position: [0.325, 0, -0.3],
                  },
                  {
                    id: "door lintel",
                    size: [0.3, 0.1, 0.035],
                    position: [0, 0.2, -0.3],
                  },
                  {
                    id: "side wall",
                    size: [0.035, 0.5, 0.6],
                    position: [-0.5, 0, 0],
                  },
                  {
                    id: "table",
                    size: [0.35, 0.03, 0.25],
                    position: [0, -0.03, 0],
                  },
                ]
              : [
                  { id: "body", size: [0.3, 0.2, 0.18], position: [0, 0, 0] },
                  {
                    id: "sensor",
                    size: [0.1, 0.08, 0.015],
                    position: [0, 0, 0.11],
                  },
                  {
                    id: "lens",
                    shape: "cylinder",
                    size: [0.07, 0.07, 0.22],
                    position: [0, 0, 0.25],
                  },
                  {
                    id: "viewfinder",
                    size: [0.12, 0.07, 0.06],
                    position: [0.15, 0.14, 0],
                  },
                ];
        const parts = s.components || defaults;
        list(parts, "components", 1, 40);
        unique(parts);
        parts.forEach((c, i) => {
          vec(c.position || [0, 0, 0], "position");
          vec(c.size, "size", 0.001, 10);
          const m =
            c.shape === "sphere"
              ? ball(c.size[0], P.blue)
              : c.shape === "cylinder"
                ? mesh(new THREE.CylinderGeometry(...c.size, 24), P.amber)
                : box(c.size, i % 2 ? P.blue : 0x667886);
          if (c.shape === "cylinder") m.rotation.x = Math.PI / 2;
          m.position.fromArray(c.position || [0, 0, 0]);
          m.name = c.id;
          m.userData.home = m.position.clone();
          m.userData.explode = V(
            vec(
              c.explode || [i % 2 ? 0.12 : -0.12, (i - 1) * 0.12, 0.09 * i],
              "explode",
            ),
          );
          model.add(m);
          p.userData.nodes[c.id] = m;
          touchables.push({
            mesh: m,
            w: Math.max(0.12, c.size[0]),
            h: Math.max(0.12, c.size[1]),
            owner: p,
            action: () =>
              detail(
                c.id,
                c.description ||
                  "Generated schematic; not a verified product model.",
              ),
          });
        });
        label(
          p.children[0],
          "GENERATED SCHEMATIC · NOT PRODUCT-ACCURATE",
          [0, -0.545, 0.02],
          1,
          0.065,
        );
      }
      button(p, "EXPLODE", -0.43, () =>
        transform(p, { explode: p.userData.state.explode ? 0 : 1 }),
      );
      button(p, "TURN", -0.2, () =>
        transform(p, { rotation: p.userData.state.rotation + Math.PI / 4 }),
      );
      button(p, "GROW", 0.04, () =>
        transform(p, { scale: Math.min(20, p.userData.state.scale * 1.5) }),
      );
      button(p, "SHRINK", 0.28, () =>
        transform(p, { scale: Math.max(0.1, p.userData.state.scale / 1.5) }),
      );
    },
    scene_cards(p, s) {
      list(s.scenes, "scenes", 1, 30);
      unique(s.scenes);
      s.scenes.forEach((v, i) =>
        child(
          p,
          v.id,
          v.title || "Scene " + (i + 1),
          v.text || v.summary || "",
          [(i - (s.scenes.length - 1) / 2) * 0.72, 0.02, 0.15],
        ),
      );
      order(
        p,
        s.scenes.map((v) => v.id),
      );
      p.userData.addScene = async ({
        id,
        title = "Untitled scene",
        text: body = "",
      } = {}) => {
        if (s.scenes.length >= 30) throw Error("Deck limit30 scenes.");
        const sceneId = id || "scene-" + Date.now().toString(36);
        if (s.scenes.some((v) => v.id === sceneId))
          throw Error("Scene id already exists.");
        const v = {
          id: sceneId,
          title: text(title, 200),
          text: text(body, 20000),
        };
        const create = () => {
          s.scenes.push(v);
          child(p, v.id, v.title, v.text, [
            (s.scenes.length - 1) * 0.72,
            0,
            0.15,
          ]);
          order(
            p,
            s.scenes.map((v) => v.id),
          );
          return v;
        };
        return ctx.buildTextures ? ctx.buildTextures(create) : create();
      };
      button(p, "ADD SCENE", -0.25, () =>
        p.userData.addScene().catch((e) => ctx.announce(e.message)),
      );
      button(p, "SHOW CARDS", 0.25, () => {
        const create = () => {
          s.scenes.forEach((v, i) => {
            const existing = p.userData.childrenTools.find(
              (c) => c.parent && c.userData.partKey === v.id,
            );
            if (existing) {
              ctx.reveal(existing);
              return;
            }
            child(p, v.id, v.title, v.text || v.summary || "", [
              (i - (s.scenes.length - 1) / 2) * 0.72,
              0,
              0.15,
            ]);
          });
        };
        if (ctx.buildTextures)
          ctx.buildTextures(create).catch((e) => ctx.announce(e.message));
        else create();
      });
      p.userData.reorder = (ids) => order(p, ids);
      label(
        p.children[0],
        "Move cards left/right; release to reorder the draft.",
        [0, 0.28, 0.04],
        1.1,
        0.065,
      );
    },
    character_orbits(p, s) {
      list(s.characters, "characters", 1, 12);
      unique(s.characters);
      list(s.acts, "acts", 1, 12);
      const positions = ring(s.characters.length);
      s.characters.forEach((c, i) =>
        node(p, c.id, c.name || c.id, positions[i], c),
      );
      p.userData.act = 0;
      const group = new THREE.Group();
      p.children[0].add(group);
      p.userData.showAct = (i) => {
        p.userData.act = Math.max(0, Math.min(s.acts.length - 1, i));
        while (group.children.length) {
          const o = group.children[0];
          group.remove(o);
          dispose(o);
        }
        s.characters.forEach((c, i) =>
          p.userData.nodes[c.id].position.fromArray(positions[i]),
        );
        const act = s.acts[p.userData.act];
        for (const r of act.relationships || []) {
          const a = p.userData.nodes[r.from],
            b = p.userData.nodes[r.to];
          if (!a || !b) throw Error("Unknown relationship character.");
          num(r.strength, "strength", 0, 1);
          const center = a.position.clone().add(b.position).multiplyScalar(0.5);
          a.position.lerp(center, r.strength * 0.45);
          b.position.lerp(center, r.strength * 0.45);
          line(group, [a.position, b.position]);
        }
        p.userData.state.act = p.userData.act;
        ctx.announce("ACT " + (act.title || p.userData.act + 1));
      };
      button(p, "PREV ACT", -0.25, () =>
        p.userData.showAct(p.userData.act - 1),
      );
      button(p, "NEXT ACT", 0.25, () => p.userData.showAct(p.userData.act + 1));
      p.userData.showAct(0);
    },
    block_actors(p, s) {
      list(s.actors, "actors", 1, 12);
      unique(s.actors);
      s.actors.forEach((a, i) => {
        const g = new THREE.Group(),
          body = mesh(new THREE.CapsuleGeometry(0.025, 0.1, 4, 8), P.blue),
          head = ball(0.035, P.amber);
        head.position.y = 0.11;
        g.add(body, head);
        const c = child(
          p,
          a.id,
          a.name || a.id,
          a.notes || "",
          vec(a.position || [(i - 2) * 0.18, 0, 0], "position"),
          g,
        );
        if (a.path) {
          list(a.path, "actor path", 2, 30);
          a.path.forEach((v) => vec(v, "path"));
          c.userData.path = a.path.map(V);
        }
      });
      p.userData.playing = false;
      button(p, "PLAY / PAUSE", 0, () => {
        p.userData.playing = !p.userData.playing;
        p.userData.time = 0;
      });
    },
    virtual_camera(p, s) {
      num(s.lens_mm || 50, "lens", 12, 200);
      const g = new THREE.Group();
      g.add(box([0.12, 0.09, 0.08], 0x536477));
      const lens = mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.08, 20),
        P.blue,
      );
      lens.rotation.x = Math.PI / 2;
      lens.position.z = -0.08;
      g.add(lens);
      const c = child(
          p,
          "camera",
          "Virtual camera",
          "Grab to position; aim_camera sets a precise target.",
          [0, 0, 0.3],
          g,
        ),
        cam = new THREE.PerspectiveCamera(
          (2 * Math.atan(36 / (2 * (s.lens_mm || 50))) * 180) / Math.PI,
          16 / 9,
          0.01,
          100,
        );
      c.add(cam);
      cam.position.set(0, 0, -0.12);
      p.userData.virtualCamera = cam;
      p.userData.cameraHandle = c;
      const helper = new THREE.CameraHelper(cam);
      const updateFrustum = helper.update.bind(helper);
      helper.update = () => {
        updateFrustum();
        const a = helper.geometry.attributes.position;
        for (let i = 0; i < a.count; i++) {
          const v = new THREE.Vector3().fromBufferAttribute(a, i);
          if (v.length() > 0.65) v.setLength(0.65);
          a.setXYZ(i, v.x, v.y, v.z);
        }
        a.needsUpdate = true;
      };
      helper.material.vertexColors = false;
      helper.material.color.setHex(P.blue);
      helper.material.transparent = true;
      helper.material.opacity = 0.25;
      helper.material.depthWrite = false;
      helper.update();
      scene.add(helper);
      p.userData.cameraHelper = helper;
      p.userData.previewTarget = new THREE.WebGLRenderTarget(480, 270);
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.72, 0.405),
        new THREE.MeshBasicMaterial({
          map: p.userData.previewTarget.texture,
          toneMapped: false,
        }),
      );
      screen.position.set(0, 0.02, 0.04);
      p.children[0].add(screen);
      p.userData.previewScreen = screen;
      p.userData.previewOn = true;
      p.userData.lastPreview = 0;
      const prev = p.userData.onClose;
      p.userData.onClose = () => {
        scene.remove(helper);
        helper.dispose();
        p.userData.previewTarget.dispose();
        prev();
      };
      button(p, "SAVE FRAME", -0.25, () =>
        capture(p).catch((e) => ctx.announce(e.message)),
      );
      button(p, "AIM FORWARD", 0.25, () => {
        c.quaternion.identity();
        ctx.announce("Camera aimed along room forward.");
      });
    },
    film_set(p, s) {
      if (!s.description && !s.components)
        throw Error("Provide a set description or components.");
      const t = (s.description || "").toLowerCase(),
        g = p.children[0],
        w = s.width || 1.2,
        d = s.depth || 0.8;
      num(w, "width", 0.3, 8);
      num(d, "depth", 0.3, 8);
      const floor = box(
        [w, 0.02, d],
        /night|warm|kitchen/.test(t) ? 0x776550 : 0x55636c,
      );
      floor.position.y = -0.25;
      g.add(floor);
      const back = box([w, 0.5, 0.025], 0x68737b);
      back.position.set(0, 0, -d / 2);
      g.add(back);
      const side = box([0.025, 0.5, d], 0x68737b);
      side.position.set(-w / 2, 0, 0);
      g.add(side);
      const furniture =
        s.components ||
        (/kitchen/.test(t)
          ? [
              { id: "table", size: [0.3, 0.14, 0.2], position: [0, -0.17, 0] },
              {
                id: "counter",
                size: [w * 0.75, 0.2, 0.16],
                position: [0, -0.15, -d / 2 + 0.1],
              },
            ]
          : [
              {
                id: "blocking block",
                size: [0.2, 0.15, 0.2],
                position: [0, -0.17, 0],
              },
            ]);
      list(furniture, "set components", 0, 24);
      furniture.forEach((c) => {
        vec(c.size, "size", 0.01, 8);
        vec(c.position, "position");
        const o = box(c.size, P.amber);
        o.position.fromArray(c.position);
        g.add(o);
        p.userData.nodes[c.id] = o;
      });
      label(
        g,
        "PROCEDURAL SET · " + text(s.description, 50),
        [0, 0.3, 0.02],
        1,
        0.07,
      );
      button(p, "GROW", -0.25, () => {
        p.scale.setScalar(Math.min(20, p.scale.x * 1.5));
        p.userData.baseScale = p.scale.x;
        markDirty();
      });
      button(p, "SHRINK", 0.25, () => {
        p.scale.setScalar(Math.max(0.1, p.scale.x / 1.5));
        p.userData.baseScale = p.scale.x;
        markDirty();
      });
      g.traverse((o) => {
        if (o.isMesh && !o.userData.spatialLabel) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
    },
    sculpt_lights(p, s) {
      list(s.lights, "lights", 1, 4);
      unique(s.lights);
      s.lights.forEach((l, i) => {
        num(l.intensity ?? 2, "intensity", 0, 20);
        const g = new THREE.Group();
        g.add(ball(0.04, new THREE.Color(l.color || "#ffe2b6").getHex()));
        const lamp = new THREE.PointLight(
          l.color || "#ffe2b6",
          l.intensity ?? 2,
          5,
          2,
        );
        lamp.castShadow = true;
        lamp.shadow.mapSize.set(256, 256);
        g.add(lamp);
        const c = child(
          p,
          l.id,
          l.name || "Light " + (i + 1),
          "Grab to sculpt the set.",
          vec(l.position || [(i - 1) * 0.3, 0.2, 0.2], "position"),
          g,
        );
        c.userData.light = lamp;
      });
      ctx.renderer.shadowMap.enabled = true;
      ctx.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    },
    film_globe(p, s) {
      list(s.films, "films", 1, 40);
      unique(s.films);
      const globe = new THREE.Group();
      p.children[0].add(globe);
      const earth = mesh(new THREE.SphereGeometry(0.3, 48, 24), 0xffffff);
      earth.rotation.y = -Math.PI / 2;
      earth.material.map = new THREE.TextureLoader().load(
        new URL("./assets/maps/earth-land.svg", import.meta.url).href,
      );
      earth.material.map.colorSpace = THREE.SRGBColorSpace;
      globe.add(earth);
      globe.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(0.301, 16, 8),
          new THREE.MeshBasicMaterial({
            color: 0x7c9eb0,
            wireframe: true,
            transparent: true,
            opacity: 0.18,
          }),
        ),
      );
      for (const f of s.films) {
        num(f.latitude, "latitude", -90, 90);
        num(f.longitude, "longitude", -180, 180);
        if (!f.sources?.length)
          throw Error("Film pins need a location source.");
        const lat = (f.latitude * Math.PI) / 180,
          lon = (f.longitude * Math.PI) / 180,
          pin = ball(0.018, P.coral);
        pin.position.set(
          0.315 * Math.cos(lat) * Math.sin(lon),
          0.315 * Math.sin(lat),
          0.315 * Math.cos(lat) * Math.cos(lon),
        );
        globe.add(pin);
        p.userData.nodes[f.id] = pin;
        touchables.push({
          mesh: pin,
          w: 0.05,
          h: 0.05,
          owner: p,
          action: () => detail(f.title, f),
        });
      }
      button(p, "TURN GLOBE", 0, () => globe.rotateY(Math.PI / 4));
      label(
        p.children[0],
        "LOCATION SOURCES ON EACH PIN",
        [0, -0.52, 0.04],
        1.05,
        0.055,
      );
    },
    money_flow(p, s) {
      list(s.entities, "entities", 2, 20);
      unique(s.entities);
      list(s.links, "links", 1, 40);
      const at = ring(s.entities.length);
      s.entities.forEach((n, i) => node(p, n.id, n.label, at[i], n));
      s.links.forEach((l) => {
        const a = p.userData.nodes[l.from],
          b = p.userData.nodes[l.to];
        if (!a || !b) throw Error("Unknown linked entity.");
        num(l.weight, "weight", 0, 10);
        if (!l.sources?.length || !l.units)
          throw Error("Links require sources and weight units.");
        const thread = edge(
          p,
          a.position.toArray(),
          b.position.toArray(),
          l.weight,
        );
        if (thread)
          touchables.push({
            mesh: thread,
            w: 0.045,
            h: a.position.distanceTo(b.position),
            owner: p,
            action: () => detail("Support / script changes", l),
          });
        if (s.entities.length <= 8 && s.links.length <= 12)
          label(
            p.children[0],
            l.label || String(l.weight),
            a.position.clone().add(b.position).multiplyScalar(0.5).toArray(),
            0.21,
            0.06,
            () => detail("Support / script changes", l),
          );
      });
      label(
        p.children[0],
        "Thickness = supplied weight; inspect links for units and sources.",
        [0, -p.userData.size.h / 2 + 0.06, 0.04],
        1.15,
        0.055,
      );
    },
    propaganda_radar(p, s) {
      list(s.films, "films", 2, 3);
      const axes = ["enemy", "music", "military", "framing", "message"];
      axes.forEach((a, i) => {
        const angle = (i / 5) * Math.PI * 2;
        line(
          p.children[0],
          [
            [0, 0, 0],
            [Math.sin(angle) * 0.38, Math.cos(angle) * 0.3, 0],
          ],
          0x647a89,
        );
        label(
          p.children[0],
          a,
          [Math.sin(angle) * 0.53, Math.cos(angle) * 0.33 - 0.03, 0],
          0.23,
          0.055,
        );
      });
      s.films = s.films.map((f) => {
        if (typeof f !== "string" && f.scores) return f;
        const title = typeof f === "string" ? f : f.title;
        const rows = readJSON("sunnyvale.checklists", []).filter(
          (r) => r.film?.toLowerCase() === title?.toLowerCase(),
        );
        if (!rows.length) throw Error("No saved analysis for " + title);
        const scores = {};
        for (const key of [
          "enemy",
          "music",
          "military",
          "framing",
          "message",
        ]) {
          const scored = rows
            .map((r) => r.scores?.[key])
            .filter(
              (v) =>
                v !== null &&
                v !== undefined &&
                v !== "" &&
                Number.isFinite(+v),
            );
          if (!scored.length)
            throw Error("Analysis has no " + key + " score for " + title);
          scores[key] =
            scored.reduce((n, v) => n + Number(v), 0) / scored.length;
        }
        return { title, scores, evidence: rows, from_checklist: true };
      });
      s.films.forEach((f, j) => {
        const pts = axes.map((a, i) => {
          num(f.scores?.[a], a + " score", 0, 5);
          return [
            (Math.sin((i / 5) * Math.PI * 2) * 0.38 * f.scores[a]) / 5,
            (Math.cos((i / 5) * Math.PI * 2) * 0.3 * f.scores[a]) / 5,
            j * 0.045,
          ];
        });
        pts.push(pts[0]);
        line(p.children[0], pts, [P.blue, P.coral, P.green][j]);
        label(
          p.children[0],
          f.title,
          [(j - (s.films.length - 1) / 2) * 0.42, -0.49, 0.08],
          0.38,
          0.07,
          () => detail(f.title, f),
        );
      });
    },
    quote_orbits(p, s) {
      if (!s.claim) throw Error("Provide the claim these quotes support.");
      list(s.quotes, "quotes", 1, 16);
      const center = node(
        p,
        "claim",
        "CLAIM",
        [0, 0, 0],
        s.claim,
        P.coral,
        "box",
      );
      s.quotes.forEach((q, i) => {
        if (!q.text || !q.source)
          throw Error("Quotes require text and source.");
        const a = (i / s.quotes.length) * Math.PI * 2,
          at = [Math.cos(a) * 0.43, Math.sin(a) * 0.27, Math.sin(a * 2) * 0.08];
        node(p, q.id || String(i), text(q.text, 28), at, q, P.blue);
        line(p.children[0], [center.position, V(at)], 0x657c8b);
      });
    },
    source_constellation(p, s) {
      list(s.sources, "sources", 1, 30);
      unique(s.sources);
      const at = ring(s.sources.length);
      s.sources.forEach((n, i) => {
        num(n.citations ?? 0, "citation count", 0, 100000);
        const o = node(p, n.id, n.title, at[i], n);
        o.scale.setScalar(
          0.6 + Math.min(2, Math.log2(1 + (n.citations || 0)) * 0.18),
        );
        if (s.sources.length > 8 && o.scale.x > 1.8) o.scale.setScalar(1.8);
        for (const l of o.children)
          if (l.userData.spatialLabel) {
            l.scale.setScalar(1 / o.scale.x);
            l.position.y = -(0.055 * o.scale.x + 0.04) / o.scale.x;
          }
      });
      for (const n of s.sources)
        for (const target of n.cites || []) {
          const a = p.userData.nodes[n.id],
            b = p.userData.nodes[target];
          if (!b) throw Error("Unknown cited source.");
          line(p.children[0], [a.position, b.position], 0x657c8b);
        }
    },
    counter_duel(p, s) {
      if (!s.claim || !s.objection)
        throw Error("Provide a claim and its strongest objection.");
      node(p, "claim", "CLAIM", [-0.35, 0.05, 0], s.claim, P.blue, "box");
      node(
        p,
        "objection",
        "OBJECTION",
        [0.35, 0.05, 0],
        s.objection,
        P.coral,
        "box",
      );
      line(p.children[0], [
        [-0.28, 0.05, 0],
        [0.28, 0.05, 0],
      ]);
      button(p, "PRACTISE", -0.25, () => {
        p.userData.state.started = Date.now();
        ctx.announce("Give your rebuttal; ask Claude for feedback.");
      });
      button(p, "SHOW RESPONSE", 0.25, () =>
        detail(
          "Rebuttal",
          p.userData.state.response ||
            s.response ||
            "No model response supplied. Practise your own response.",
        ),
      );
    },
    strength_glow(p, s) {
      list(s.claims, "claims", 1, 16);
      unique(s.claims);
      const at = ring(s.claims.length);
      s.claims.forEach((c, i) => {
        const evidence = list(c.evidence || [], "evidence", 0, 30),
          verified = evidence.filter(
            (e) => e.verified === true && e.source,
          ).length,
          score = Math.min(1, verified / 3),
          color = new THREE.Color(P.red)
            .lerp(new THREE.Color(P.green), score)
            .getHex();
        const o = node(
          p,
          c.id,
          c.claim,
          at[i],
          {
            ...c,
            verified,
            indicator:
              "Evidence completeness, not truth. Green requires3 sourced, caller-verified items.",
          },
          color,
        );
        o.material.emissive.setHex(color);
        o.material.emissiveIntensity = 0.25;
        p.userData.state[c.id] = { verified, score };
      });
      label(
        p.children[0],
        "EVIDENCE COMPLETENESS · NOT A TRUTH SCORE",
        [
          0,
          p.userData.size.h > 0.96 ? -p.userData.size.h / 2 + 0.06 : 0.28,
          0.04,
        ],
        1,
        0.055,
      );
    },
    belief_web(p, s) {
      list(s.beliefs, "beliefs", 1, 20);
      unique(s.beliefs);
      const at = ring(s.beliefs.length);
      s.beliefs.forEach((b, i) => node(p, b.id, b.claim, at[i], b, P.blue));
      for (const b of s.beliefs)
        for (const support of b.depends_on || []) {
          if (!p.userData.nodes[support])
            throw Error("Unknown supporting belief.");
          line(
            p.children[0],
            [
              p.userData.nodes[support].position,
              p.userData.nodes[b.id].position,
            ],
            0x657c8b,
          );
        }
      p.userData.state.removed = [];
      p.userData.removeBelief = (id) => {
        if (!s.beliefs.some((b) => b.id === id)) throw Error("Unknown belief.");
        p.userData.state.removed = [
          ...new Set([...p.userData.state.removed, id]),
        ];
        const affected = new Set(p.userData.state.removed);
        let changed = true;
        while (changed) {
          changed = false;
          for (const b of s.beliefs)
            if (
              !affected.has(b.id) &&
              (b.depends_on || []).some((x) => affected.has(x))
            ) {
              affected.add(b.id);
              changed = true;
            }
        }
        for (const b of s.beliefs) {
          const m = p.userData.nodes[b.id];
          m.visible = !p.userData.state.removed.includes(b.id);
          m.material.color.setHex(affected.has(b.id) ? P.red : P.blue);
        }
        p.userData.state.affected = [...affected];
        return [...affected];
      };
      s.beliefs.forEach((b, i) => {
        const c = child(
          p,
          "belief:" + b.id,
          "Pull: " + b.claim,
          "Pull outward to test removing this belief.",
          at[i].map((x) => x * 1.2),
        );
        c.scale.setScalar(0.18);
        c.userData.baseScale = 0.18;
        c.userData.pullBelief = b.id;
      });
      button(p, "UNDO REMOVALS", 0, () => {
        p.userData.state.removed = [];
        for (const m of Object.values(p.userData.nodes)) {
          m.visible = true;
          m.material.color.setHex(P.blue);
        }
        p.userData.state.affected = [];
      });
    },
    steelman_statue(p, s) {
      if (!s.view || !s.strongest_case)
        throw Error("Supply the view and its strongest fair case.");
      const g = p.children[0],
        head = ball(0.07, P.amber),
        body = mesh(new THREE.CapsuleGeometry(0.07, 0.18, 4, 12), 0x68798d);
      head.position.y = 0.15;
      g.add(head, body);
      label(g, "STRONGEST CASE · TAP TO READ", [0, -0.2, 0.03], 0.8, 0.09, () =>
        detail(s.view, s.strongest_case),
      );
      button(p, "ARGUE", 0, () => {
        p.userData.state.started = Date.now();
        detail(
          "Practise against this view",
          s.strongest_case + "\n\nSpeak your reply to Claude for feedback.",
        );
      });
    },
    idea_forge(p, s) {
      if (!s.a || !s.b) throw Error("Supply two concepts.");
      const a = child(p, "a", s.a, "Concept A", [-0.3, 0, 0]),
        b = child(p, "b", s.b, "Concept B", [0.3, 0, 0]);
      a.scale.setScalar(0.3);
      b.scale.setScalar(0.3);
      a.userData.baseScale = b.userData.baseScale = 0.3;
      p.userData.combine = () => {
        if (s.synthesis) {
          detail("Idea synthesis", s.synthesis);
          p.userData.state.result = s.synthesis;
          pending.delete(p.userData.id);
          return { ready: true, text: s.synthesis };
        }
        pending.set(p.userData.id, { id: p.userData.id, a: s.a, b: s.b });
        ctx.announce(
          "Concepts combined. Ask Claude to complete the synthesis.",
        );
        return { ready: false, needs: "Claude synthesis", a: s.a, b: s.b };
      };
      button(p, "COMBINE", 0, () => p.userData.combine());
      label(
        p.children[0],
        "Push the two concept cards together.",
        [0, 0.24, 0.04],
        0.95,
        0.07,
      );
    },
    echo_bubble(p, s) {
      list(s.sources, "sources", 1, 24);
      unique(s.sources);
      const groups = new Set(s.sources.map((n) => n.group).filter(Boolean)),
        inside = s.sources.filter((n) => n.inside !== false),
        outside = s.sources.filter((n) => n.inside === false);
      p.children[0].add(
        new THREE.Mesh(
          new THREE.SphereGeometry(0.36, 28, 18),
          new THREE.MeshBasicMaterial({
            color: P.blue,
            transparent: true,
            opacity: 0.1,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        ),
      );
      s.sources.forEach((n, i) => {
        const a = (i / s.sources.length) * Math.PI * 2,
          r = n.inside === false ? 0.5 : 0.24;
        node(
          p,
          n.id,
          n.title,
          [Math.cos(a) * r, Math.sin(a) * r * 0.7, 0],
          n,
          n.inside === false ? P.coral : P.blue,
        );
      });
      p.userData.state.metrics = {
        inside: inside.length,
        outside: outside.length,
        groups: groups.size,
        agreement:
          s.sources.filter((n) => n.agrees === true).length / s.sources.length,
      };
      label(
        p.children[0],
        inside.length +
          " inside · " +
          outside.length +
          " outside · " +
          groups.size +
          " supplied groups",
        [0, -0.31, 0.04],
        1,
        0.065,
        () => detail("Bubble measures", p.userData.state.metrics),
      );
    },
    influence_map(p, s) {
      list(s.influences, "influences", 1, 20);
      unique(s.influences);
      node(
        p,
        "self",
        s.person || "ME",
        [0, 0, 0],
        s.context || "Self-reported influences",
        P.coral,
        "box",
      );
      const at = ring(s.influences.length);
      s.influences.forEach((n, i) => {
        num(n.weight, "influence weight", 0, 10);
        node(p, n.id, n.name + " / " + (n.channel || "unspecified"), at[i], n);
        edge(p, [0, 0, 0], at[i], n.weight);
      });
    },
    lineage_tree(p, s) {
      list(s.nodes, "nodes", 1, 24);
      unique(s.nodes);
      const depths = new Map();
      function depth(id, path = []) {
        if (path.includes(id)) throw Error("Lineage contains a cycle.");
        if (depths.has(id)) return depths.get(id);
        const n = s.nodes.find((n) => n.id === id);
        if (!n) throw Error("Unknown lineage parent.");
        const d = n.parent ? depth(n.parent, [...path, id]) + 1 : 0;
        depths.set(id, d);
        return d;
      }
      const levels = {};
      for (const n of s.nodes) {
        if (n.parent && !n.sources?.length)
          throw Error("Lineage links require sources, not inferred ancestry.");
        const d = depth(n.id);
        (levels[d] ||= []).push(n);
      }
      for (const [d, nodes] of Object.entries(levels))
        nodes.forEach((n, i) =>
          node(
            p,
            n.id,
            n.idea,
            [
              (i - (nodes.length - 1) / 2) * 0.4,
              0.25 - Number(d) * 0.22,
              -Number(d) * 0.04,
            ],
            n,
          ),
        );
      for (const n of s.nodes)
        if (n.parent)
          line(
            p.children[0],
            [
              p.userData.nodes[n.parent].position,
              p.userData.nodes[n.id].position,
            ],
            0x657c8b,
          );
    },
  };
  const experiences = installSpatialExperiences({
    THREE,
    ctx,
    builders,
    V,
    P,
    box,
    ball,
    mesh,
    line,
    label,
    button,
    node,
    detail,
    list,
    num,
    unique,
    text,
  });
  function transform(
    p,
    {
      explode = p.userData.state.explode,
      scale = p.userData.state.scale,
      rotation = p.userData.state.rotation,
    },
  ) {
    num(explode, "explode", 0, 3);
    num(scale, "scale", 0.1, 20);
    num(rotation, "rotation", -100, 100);
    const m = p.userData.model;
    p.userData.applyImportedExplosion?.(explode);
    for (const part of m.children)
      if (part.userData.home)
        part.position
          .copy(part.userData.home)
          .addScaledVector(part.userData.explode, explode);
    m.scale.setScalar(scale);
    m.rotation.y = rotation;
    if (p.userData.state.groundY !== undefined) {
      p.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(m);
      p.position.y += p.userData.state.groundY - bounds.min.y;
    }
    Object.assign(p.userData.state, { explode, scale, rotation });
    markDirty();
    return p.userData.state;
  }
  async function loadModel(p, fileId) {
    const blob = await ctx.thesis.getLibraryFile(fileId);
    if (blob.size > 20 * 1024 * 1024) throw Error("GLB limit is20MB.");
    const buffer = await blob.arrayBuffer(),
      view = new DataView(buffer);
    if (
      buffer.byteLength < 20 ||
      view.getUint32(0, true) !== 0x46546c67 ||
      view.getUint32(4, true) !== 2
    )
      throw Error("Use a binary GLB2 model.");
    const len = view.getUint32(12, true);
    if (len > buffer.byteLength - 20) throw Error("Invalid GLB JSON chunk.");
    const data = JSON.parse(
      new TextDecoder().decode(new Uint8Array(buffer, 20, len)),
    );
    if (
      [...(data.buffers || []), ...(data.images || [])].some(
        (x) => x.uri && !x.uri.startsWith("data:"),
      )
    )
      throw Error("GLB must embed textures and buffers.");
    if ((data.nodes || []).length > 2000)
      throw Error("Model exceeds2000 nodes.");
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const gltf = await new GLTFLoader().parseAsync(buffer, "");
    if (!p.parent) {
      dispose(gltf.scene);
      return;
    }
    const model = gltf.scene;
    let vertices = 0;
    model.traverse((o) => {
      if (o.geometry) vertices += o.geometry.attributes.position?.count || 0;
    });
    if (vertices > 600000) {
      dispose(model);
      throw Error("Model exceeds600,000 vertices.");
    }
    const bounds = new THREE.Box3().setFromObject(model),
      size = bounds.getSize(new THREE.Vector3()),
      center = bounds.getCenter(new THREE.Vector3()),
      scale = 0.6 / Math.max(size.x, size.y, size.z, 0.001);
    model.position.sub(center).multiplyScalar(scale);
    model.scale.setScalar(scale);
    const assembly = new THREE.Group();
    assembly.add(model);
    p.userData.model.add(assembly);
    let i = 0;
    model.traverse((o) => {
      if (o.isMesh) {
        o.name = o.name || "part" + i++;
        if (p.userData.nodes[o.name]) o.name += ":" + i++;
        p.userData.nodes[o.name] = o;
        o.castShadow = true;
        o.receiveShadow = true;
        o.userData.home = o.position.clone();
        o.userData.explode = V([
          ((i % 3) - 1) * 0.12,
          Math.floor(i++ / 3) * 0.1,
          0.1,
        ]);
      }
    });
    p.userData.applyImportedExplosion = (value) => {
      for (const o of Object.values(p.userData.nodes))
        if (o.userData.home)
          o.position
            .copy(o.userData.home)
            .addScaledVector(o.userData.explode, value);
    };
    label(
      p.children[0],
      "LIBRARY MODEL · TAP PARTS TO INSPECT",
      [0, 0.3, 0.04],
      0.9,
      0.065,
    );
    for (const [id, o] of Object.entries(p.userData.nodes))
      touchables.push({
        mesh: o,
        w: 0.12,
        h: 0.12,
        owner: p,
        action: () => detail(id, "Named mesh in your imported library model."),
      });
    p.userData.applyImportedExplosion(p.userData.state.explode);
    for (const a of p.userData.state.annotations || []) addAnnotation(p, a);
  }
  function renderCamera(p, target, readPixels = false) {
    if (!p.parent) throw Error("Camera closed.");
    const renderer = ctx.renderer,
      camera = p.userData.virtualCamera;
    const previous = renderer.getRenderTarget(),
      xr = renderer.xr.enabled,
      oldCameraMask = camera.layers.mask,
      oldBackground = scene.background;
    const masks = new Map(),
      stage =
        p.userData.captureKinds ||
        new Set(["film_set", "hologram", "block_actors", "sculpt_lights"]);
    const include = (o) => {
      if (!masks.has(o)) {
        masks.set(o, o.layers.mask);
        o.layers.enable(31);
      }
    };
    function includeGeometry(o) {
      if (
        o.userData.spatialLabel ||
        o === p.userData.previewScreen ||
        p.userData.captureExcluded?.has(o)
      )
        return;
      if (o.isMesh || o.isLine || o.isLight) include(o);
      for (const child of o.children) includeGeometry(child);
    }
    try {
      // Only stage content enters this layer. Global HUD, menu, orb, tint,
      // close controls and camera helpers are excluded without relying on names.
      for (const panel of ctx.allPanels()) {
        const kind =
          panel.userData.spatial?.kind ||
          panel.userData.spatialParent?.userData.spatial?.kind;
        if (stage.has(kind) && panel.visible)
          includeGeometry(panel.children[0]);
      }
      include(ambient);
      if (p.userData.spatial.kind === "tension_track")
        scene.background = new THREE.Color(0x172735);
      camera.layers.set(31);
      renderer.xr.enabled = false;
      camera.updateWorldMatrix(true, false);
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      if (readPixels) {
        const pixels = new Uint8Array(target.width * target.height * 4);
        renderer.readRenderTargetPixels(
          target,
          0,
          0,
          target.width,
          target.height,
          pixels,
        );
        return pixels;
      }
    } finally {
      renderer.setRenderTarget(previous);
      renderer.xr.enabled = xr;
      camera.layers.mask = oldCameraMask;
      scene.background = oldBackground;
      for (const [o, mask] of masks) o.layers.mask = mask;
    }
  }
  async function capture(p) {
    const target = new THREE.WebGLRenderTarget(960, 540);
    let pixels;
    try {
      pixels = renderCamera(p, target, true);
    } finally {
      target.dispose();
    }
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 540;
    const g = canvas.getContext("2d"),
      data = g.createImageData(960, 540);
    for (let y = 0; y < 540; y++)
      data.data.set(
        pixels.subarray(y * 960 * 4, (y + 1) * 960 * 4),
        (539 - y) * 960 * 4,
      );
    g.putImageData(data, 0, 0);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    if (!blob) throw Error("Could not encode storyboard frame.");
    await ctx.thesis.addFiles([
      new File([blob], "Storyboard-" + Date.now() + ".png", {
        type: "image/png",
      }),
    ]);
    const frames = readJSON("sunnyvale.spatial-storyboard", []);
    frames.push({
      at: Date.now(),
      camera: p.userData.cameraHandle.position.toArray(),
      lens_mm: p.userData.spatial.spec.lens_mm || 50,
      fileId: readJSON("sunnyvale.library", []).at(-1)?.id,
    });
    writeJSON("sunnyvale.spatial-storyboard", frames.slice(-100));
    return { saved: true, ...frames.at(-1) };
  }
  function build(kind, input = {}) {
    if (!builders[kind]) throw Error("Unknown3D tool.");
    const s = copy(input);
    if (JSON.stringify(s).length > 180000)
      throw Error("Tool data limit180,000 characters.");
    const p = base(kind, s);
    try {
      builders[kind](p, s);
    } catch (e) {
      ctx.closeWindow(p);
      throw e;
    }
    p.updateMatrixWorld(true);
    p.userData.lastMatrix = p.matrixWorld.clone();
    for (const c of p.userData.childrenTools) {
      c.updateMatrixWorld(true);
      c.userData.previousSpatialMatrix = c.matrixWorld.clone();
    }
    return p;
  }
  function addAnnotation(p, a) {
    const o = p.userData.nodes[a.part];
    if (!o) throw Error("Unknown model part; wait for the model to load.");
    return label(o, text(a.text, 40), [0, 0.12, 0.02], 0.28, 0.09, () =>
      detail(a.part, a.text),
    );
  }
  const definitions = {
    create_hologram: "hologram",
    create_scene_cards: "scene_cards",
    create_beat_corridor: "beat_corridor",
    create_character_orbits: "character_orbits",
    create_tension_track: "tension_track",
    block_actors: "block_actors",
    create_virtual_camera: "virtual_camera",
    build_film_set: "film_set",
    sculpt_lights: "sculpt_lights",
    create_film_globe: "film_globe",
    create_money_flow: "money_flow",
    create_propaganda_radar: "propaganda_radar",
    create_argument_tower: "argument_tower",
    create_quote_orbits: "quote_orbits",
    create_source_constellation: "source_constellation",
    create_counter_duel: "counter_duel",
    create_strength_glow: "strength_glow",
    create_belief_web: "belief_web",
    create_steelman_statue: "steelman_statue",
    create_idea_forge: "idea_forge",
    create_assumption_xray: "assumption_xray",
    create_echo_bubble: "echo_bubble",
    create_influence_map: "influence_map",
    create_lineage_tree: "lineage_tree",
    create_bias_lens: "bias_lens",
  };
  const tools = Object.fromEntries(
    Object.entries(definitions).map(([name, kind]) => [
      name,
      (input) => {
        const run = () =>
            ctx.buildTextures
              ? ctx.buildTextures(() => build(kind, input))
              : build(kind, input),
          job = busy.then(run);
        busy = job.catch(() => {});
        return job.then(async (p) => {
          if (p.userData.ready) {
            await p.userData.ready;
            if (p.userData.error) {
              const error = p.userData.error;
              ctx.closeWindow(p);
              throw Error(error);
            }
          }
          return ok({
            id: p.userData.id,
            kind,
            parts: Object.keys(p.userData.nodes),
            note:
              kind === "hologram" && !input.fileId
                ? "Generated schematic, not an exact product model."
                : undefined,
          });
        });
      },
    ]),
  );
  Object.assign(tools, {
    navigate_beat: ({ id, index }) =>
      ok(resolve(id, "beat_corridor").userData.selectBeat(index)),
    navigate_argument_floor: ({ id, index }) =>
      ok(resolve(id, "argument_tower").userData.selectFloor(index)),
    start_tension_ride: ({ id }) => {
      resolve(id, "tension_track").userData.startRide();
      return ok({
        playing: true,
        view: "on-panel ride; real-room viewpoint stays fixed",
      });
    },
    ground_hologram: ({ id, height = 0 }) => {
      const p = resolve(id, "hologram");
      p.userData.state.groundY = num(height, "ground height", -1, 3);
      return ok(transform(p, {}));
    },
    open_scene_cards: async () => {
      let p = [...live]
        .reverse()
        .find((p) => p.userData.spatial.kind === "scene_cards");
      if (p) {
        ctx.reveal(p);
        return ok({ id: p.userData.id });
      }
      const saved = readJSON("sunnyvale.script.v1", null);
      return tools.create_scene_cards(
        saved || {
          title: "Scene cards",
          scenes: [{ id: "scene-1", title: "Scene 1", text: "" }],
        },
      );
    },
    add_scene: async ({ id, scene_id, ...input }) =>
      ok(
        await resolve(id, "scene_cards").userData.addScene({
          ...input,
          id: scene_id,
        }),
      ),
    open_script_draft: () => {
      const draft = readJSON("sunnyvale.script.v1", null);
      if (!draft) throw Error("Create scene cards or supply a script first.");
      const p = ctx.openWindow(
        draft.title || "Script draft",
        draft.scenes
          .map(
            (s, i) =>
              i + 1 + ". " + s.title + "\n" + (s.text || s.summary || ""),
          )
          .join("\n\n"),
      );
      return ok({ id: p.userData.id });
    },
    import_hologram_url: async ({ url, title }) => {
      const u = new URL(url);
      if (u.protocol !== "https:" || u.username || u.password)
        throw Error("Use an HTTPS GLB URL.");
      const r = await fetch(u, {
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      if (!r.ok)
        throw Error("Could not fetch model; the host must allow browser CORS.");
      if (Number(r.headers.get("content-length")) > 20 * 1024 * 1024)
        throw Error("GLB limit20MB.");
      const reader = r.body.getReader(),
        chunks = [];
      let count = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        count += value.length;
        if (count > 20 * 1024 * 1024) {
          await reader.cancel();
          throw Error("GLB limit20MB.");
        }
        chunks.push(value);
      }
      await ctx.thesis.addFiles([
        new File(chunks, text(title || "Imported model", 100) + ".glb", {
          type: "model/gltf-binary",
        }),
      ]);
      return tools.create_hologram({
        title,
        fileId: readJSON("sunnyvale.library", []).at(-1).id,
      });
    },
    transform_hologram: (input) => {
      const p = resolve(input.id, "hologram"),
        state = transform(p, input);
      p.userData.applyImportedExplosion?.(state.explode);
      return ok(state);
    },
    annotate_hologram: ({ id, part, text: body }) => {
      const p = resolve(id, "hologram");
      if (!body) throw Error("Provide annotation text.");
      const a = { part, text: text(body, 2000) };
      addAnnotation(p, a);
      (p.userData.state.annotations ||= []).push(a);
      markDirty();
      return ok({ part, annotation: p.userData.state.annotations.length - 1 });
    },
    reorder_scenes: ({ id, order: ids }) => {
      const p = resolve(id, "scene_cards"),
        result = order(p, ids?.map(String));
      result.forEach((id, i) => {
        const c = p.userData.childrenTools.find(
          (c) => c.userData.partKey === id,
        );
        if (c?.parent)
          c.position.copy(
            p.localToWorld(V([(i - (result.length - 1) / 2) * 0.72, 0, 0.15])),
          );
      });
      return ok({ order: result });
    },
    update_scene: ({ id, scene_id, text: body, title }) => {
      const p = resolve(id, "scene_cards"),
        s = p.userData.spatial.spec.scenes.find((s) => s.id === scene_id);
      if (!s) throw Error("Scene not found.");
      if (body !== undefined) s.text = text(body, 20000);
      if (title !== undefined) s.title = text(title, 200);
      const c = p.userData.childrenTools.find(
        (c) => c.userData.partKey === scene_id,
      );
      if (c?.parent)
        ctx.setWindowContent(c, s.title, s.text || s.summary || "");
      order(
        p,
        p.userData.spatial.spec.scenes.map((s) => s.id),
      );
      return ok({ updated: scene_id });
    },
    show_character_act: ({ id, index }) => {
      const p = resolve(id, "character_orbits");
      if (!Number.isInteger(index)) throw Error("Use an integer act index.");
      p.userData.showAct(
        num(index, "act index", 0, p.userData.spatial.spec.acts.length - 1),
      );
      return ok({ act: p.userData.act });
    },
    ride_tension: ({ id, index }) => {
      if (!Number.isInteger(index)) throw Error("Use an integer scene index.");
      const p = resolve(id, "tension_track");
      return ok(
        p.userData.ride(
          num(
            index,
            "scene index",
            0,
            p.userData.spatial.spec.scenes.length - 1,
          ),
        ),
      );
    },
    move_actor: ({ id, actor_id, position }) => {
      const p = resolve(id, "block_actors"),
        c = p.userData.childrenTools.find(
          (c) => c.userData.partKey === actor_id,
        );
      if (!c?.parent) throw Error("Actor not found.");
      c.position.copy(p.localToWorld(V(vec(position, "position"))));
      markDirty();
      return ok({ moved: actor_id });
    },
    aim_camera: ({ id, target, lens_mm }) => {
      const p = resolve(id, "virtual_camera");
      if (lens_mm !== undefined) {
        num(lens_mm, "lens", 12, 200);
        p.userData.spatial.spec.lens_mm = lens_mm;
        p.userData.virtualCamera.fov =
          (2 * Math.atan(36 / (2 * lens_mm)) * 180) / Math.PI;
        p.userData.virtualCamera.updateProjectionMatrix();
      }
      p.userData.cameraHandle.lookAt(V(vec(target, "target")));
      p.userData.cameraHandle.rotateY(Math.PI);
      return ok({ lens_mm: p.userData.spatial.spec.lens_mm || 50 });
    },
    save_camera_frame: ({ id }) =>
      capture(resolve(id, "virtual_camera")).then(ok),
    set_light: ({ id, light_id, color, intensity, position }) => {
      const p = resolve(id, "sculpt_lights"),
        c = p.userData.childrenTools.find(
          (c) => c.userData.partKey === light_id,
        );
      if (!c?.parent) throw Error("Light not found.");
      if (color) c.userData.light.color.set(color);
      if (intensity !== undefined)
        c.userData.light.intensity = num(intensity, "intensity", 0, 20);
      if (position)
        c.position.copy(p.localToWorld(V(vec(position, "position"))));
      Object.assign(
        p.userData.spatial.spec.lights.find((l) => l.id === light_id),
        {
          color: "#" + c.userData.light.color.getHexString(),
          intensity: c.userData.light.intensity,
        },
      );
      markDirty();
      return ok({ updated: light_id });
    },
    remove_belief: ({ id, belief_id }) =>
      ok({
        affected: resolve(id, "belief_web").userData.removeBelief(belief_id),
      }),
    pending_combinations: () => ok([...pending.values()]),
    complete_combination: ({ id, synthesis }) => {
      if (!synthesis) throw Error("Provide Claude’s synthesis.");
      const p = resolve(id, "idea_forge");
      p.userData.spatial.spec.synthesis = text(synthesis, 10000);
      return ok(p.userData.combine());
    },
    answer_counterargument: ({ id, response, feedback }) => {
      const p = resolve(id, "counter_duel");
      p.userData.state.response = text(response);
      p.userData.state.feedback = text(feedback);
      detail(
        "Rebuttal and feedback",
        p.userData.state.response + "\n\n" + p.userData.state.feedback,
      );
      return ok({ saved: true });
    },
    inspect_bias_window: async ({ id, analysis }) => {
      const p = ctx.findWindow(id);
      if (!p) throw Error("Choose an open text/shared-browser window.");
      const info = p.userData.browserId
        ? await ctx.browser()?.describe(p.userData.browserId)
        : null;
      if (p.userData.browserId && (!info || info.stale))
        throw Error("Refresh the shared browser connection first.");
      const value = info?.text || p.userData.body;
      if (!value) throw Error("This window has no text to inspect.");
      return tools.create_bias_lens({
        title: "Bias lens: " + p.userData.title,
        text: value,
        window_id: id,
        analysis,
      });
    },
    read_spatial_tool: ({ id }) => {
      const p = resolve(id);
      return ok({
        id,
        kind: p.userData.spatial.kind,
        spec: p.userData.spatial.spec,
        state: p.userData.state,
        error: p.userData.error,
        parts: Object.keys(p.userData.nodes),
      });
    },
  });
  function restoreSpatial(item) {
    const p = build(item.kind, item.spec);
    for (const c of item.children || []) {
      const found = p.userData.childrenTools.find(
        (v) => v.userData.partKey === c.key,
      );
      if (found) {
        const local = new THREE.Matrix4().compose(
          V(c.position),
          new THREE.Quaternion().fromArray(c.q),
          V(c.scale),
        );
        const world = p.matrixWorld.clone().multiply(local);
        world.decompose(found.position, found.quaternion, found.scale);
        found.userData.baseScale = found.scale.x;
        if (c.stashed) ctx.stash(found);
      }
    }
    const state = item.state || {};
    if (item.kind === "hologram") {
      transform(p, state);
      for (const a of state.annotations || [])
        if (p.userData.nodes[a.part]) addAnnotation(p, a);
    }
    if (item.kind === "character_orbits" && state.act !== undefined)
      p.userData.showAct(state.act);
    if (item.kind === "tension_track") p.userData.ride(state.step || 0);
    if (item.kind === "beat_corridor") p.userData.selectBeat(state.beat || 0);
    if (item.kind === "argument_tower")
      p.userData.selectFloor(state.floor || 0);
    if (item.kind === "belief_web")
      for (const id of state.removed || []) p.userData.removeBelief(id);
    Object.assign(p.userData.state, state);
    if (item.kind === "assumption_xray" && state.hidden)
      for (const [id, o] of Object.entries(p.userData.nodes))
        if (id !== "argument") o.visible = false;
    if (item.kind === "idea_forge" && state.touching && !item.spec.synthesis)
      pending.set(p.userData.id, {
        id: p.userData.id,
        a: item.spec.a,
        b: item.spec.b,
      });
    if (item.children) {
      const keys = new Set(item.children.map((c) => c.key));
      for (const c of [...p.userData.childrenTools])
        if (!keys.has(c.userData.partKey) && c.parent) ctx.closeWindow(c);
    }
    p.updateMatrixWorld(true);
    p.userData.lastMatrix = p.matrixWorld.clone();
    for (const c of p.userData.childrenTools) {
      c.updateMatrixWorld(true);
      c.userData.previousSpatialMatrix = c.matrixWorld.clone();
    }
    return p;
  }
  ctx.restorers.spatial = (item) => {
    let restored;
    if (ctx.buildTextures)
      ctx
        .buildTextures(() => {
          restored = restoreSpatial(item);
          return restored;
        })
        .catch((e) => ctx.announce("Restore: " + e.message));
    else restored = restoreSpatial(item);
    return restored;
  };
  function update(dt) {
    ambient.visible = live.size > 0;
    ambient.intensity = 1.8 * (ctx.getBrightness?.() || 1);
    for (const p of live) {
      if (!p.parent) continue;
      p.updateMatrixWorld(true);
      const previous = p.userData.lastMatrix;
      if (!sameMatrix(p.matrixWorld, previous)) {
        const delta = p.matrixWorld.clone().multiply(previous.clone().invert());
        for (const c of p.userData.childrenTools)
          if (c.parent) {
            c.updateMatrixWorld(true);
            if (
              !c.userData.previousSpatialMatrix ||
              sameMatrix(c.matrixWorld, c.userData.previousSpatialMatrix)
            )
              c.applyMatrix4(delta);
            c.userData.baseScale = c.scale.x / (c.userData.held ? 1.05 : 1);
          }
        previous.copy(p.matrixWorld);
      }
      const children = p.userData.childrenTools.filter((c) => c.parent),
        kind = p.userData.spatial.kind;
      for (const c of children) {
        const active = p.visible && panels.includes(p);
        c.visible =
          active && panels.includes(c) && c.userData.paintReady !== false;
        if (c.userData.light)
          c.children[0]?.children.forEach((o) => {
            if (o.isMesh) o.material.color.copy(c.userData.light.color);
          });
        if (c.userData.path && p.userData.playing) {
          p.userData.time = (p.userData.time || 0) + dt / children.length;
          const path = c.userData.path,
            t = ((p.userData.time % 5) / 5) * (path.length - 1),
            i = Math.floor(t);
          c.position.copy(
            p.localToWorld(
              path[i]
                .clone()
                .lerp(path[Math.min(i + 1, path.length - 1)], t - i),
            ),
          );
        }
      }
      if (kind === "scene_cards" && p.userData.changed) {
        p.userData.changed = false;
        const cards = children
          .filter((c) => c.userData.partKey !== "draft")
          .sort(
            (a, b) =>
              p.worldToLocal(a.position.clone()).x -
              p.worldToLocal(b.position.clone()).x,
          );
        if (cards.length === p.userData.spatial.spec.scenes.length)
          order(
            p,
            cards.map((c) => c.userData.partKey),
          );
      }
      if (kind === "idea_forge") {
        const [a, b] = children;
        if (a && b) {
          const d = a.position.distanceTo(b.position);
          if (d < 0.14 && !p.userData.state.touching) {
            p.userData.state.touching = true;
            p.userData.combine();
          } else if (d > 0.22) p.userData.state.touching = false;
        }
      }
      if (kind === "belief_web")
        for (const c of children)
          if (
            c.userData.pullBelief &&
            !p.userData.state.removed.includes(c.userData.pullBelief) &&
            p.worldToLocal(c.position.clone()).length() > 0.8
          )
            p.userData.removeBelief(c.userData.pullBelief);
      experiences.update(p, dt);
      for (const c of children) {
        c.updateMatrixWorld(true);
        c.userData.previousSpatialMatrix = c.matrixWorld.clone();
      }
      if (p.userData.cameraHelper) {
        p.userData.cameraHelper.visible = p.visible && panels.includes(p);
        p.userData.cameraHelper.update();
      }
      if (p.userData.previewTarget && p.userData.previewOn) {
        const now = performance.now();
        if (
          p.visible &&
          panels.includes(p) &&
          now - p.userData.lastPreview > (ctx.voiceActive() ? 500 : 160)
        ) {
          p.userData.lastPreview = now;
          renderCamera(p, p.userData.previewTarget);
        }
      }
    }
  }
  const schemas = {
    hologram:
      "{title,preset:camera|building|set,components?:[{id,shape:box|sphere|cylinder,size:[x,y,z],position:[x,y,z],description}],fileId?:libraryGLB}",
    scene_cards: "{title,scenes:[{id,title,text}]}",
    beat_corridor: "{title,beats:[{title,description}]}",
    character_orbits:
      "{title,characters:[{id,name}],acts:[{title,relationships:[{from,to,strength:0..1}]}]}",
    tension_track:
      "{title,scenes:[{title,tension:0..10}],seconds_per_scene?:.5..15}; start_tension_ride opens the moving first-person track view",
    block_actors:
      "{title,actors:[{id,name,position:[x,y,z],path?:[[x,y,z],...]}]}",
    virtual_camera: "{title,lens_mm:12..200}",
    film_set:
      "{title,description,width?,depth?,components?:[{id,size:[x,y,z],position:[x,y,z]}]}",
    sculpt_lights:
      "{title,lights:[{id,name,color,intensity:0..20,position:[x,y,z]}]}",
    film_globe:
      "{title,films:[{id,title,latitude,longitude,notes,sources:[...]}]}",
    money_flow:
      "{title,entities:[{id,label}],links:[{from,to,label,weight:0..10,units,sources:[...]}]}",
    propaganda_radar:
      "{title,films:[{title,scores:{enemy,music,military,framing,message},evidence}]} all5 scores0..5;2–3films; films may instead be exact saved analysis-board film names, which load averaged scored scenes",
    argument_tower: "{title,claims:[{id,claim,evidence:[{source,text}]}]}",
    quote_orbits: "{title,claim,quotes:[{id,text,source}]}",
    source_constellation:
      "{title,sources:[{id,title,citations:number,cites:[sourceId],url}]}",
    counter_duel: "{title,claim,objection,response?}",
    strength_glow:
      "{title,claims:[{id,claim,evidence:[{source,verified:boolean}]}]}",
    belief_web: "{title,beliefs:[{id,claim,depends_on:[beliefId]}]}",
    steelman_statue: "{title,view,strongest_case}",
    idea_forge:
      "{title,a,b,synthesis?:ClaudeProvidedText}; provide synthesis for an immediate Claude suggestion on physical merge; if deferred, it queues pending_combinations until complete_combination",
    assumption_xray:
      "{title,argument,window_id?,premises:[{text,basis}]}; hold the lens over its argument to reveal proposed premises",
    echo_bubble:
      "{title,sources:[{id,title,group,inside:boolean,agrees:boolean}]}",
    influence_map: "{title,person,influences:[{id,name,channel,weight:0..10}]}",
    lineage_tree: "{title,nodes:[{id,idea,parent?:id,sources:[...]}]}",
    bias_lens:
      "{title,text,window_id?,analysis?:ClaudeProvidedContext}; hold over text/shared browser windows for an inspection overlay; possible wording markers are not verdicts",
  };
  const help = Object.fromEntries(
    Object.entries(definitions).map(([name, kind]) => [
      name,
      { description: schemas[kind] },
    ]),
  );
  const operations = {
    open_scene_cards:
      "{}; reopen the current saved scene deck or start one blank scene",
    add_scene:
      "{id,scene_id?,title,text}; add a scene without replacing existing scenes",
    navigate_beat:
      "{id,index}; bring a human-size doorway to you, or walk through in your real room",
    navigate_argument_floor:
      "{id,index}; move the tower to inspect that floor at your real-room level",
    start_tension_ride:
      "{id}; first-person ride in a viewing window; no XR viewpoint movement",
    ground_hologram:
      "{id,height:floorOrDeskHeightInMetres}; align model bottom and retain contact while growing",
    open_script_draft: "{}; reopen persisted scene-card script",
    transform_hologram: "{id,explode:0..3,scale:.1..20,rotation:radians}",
    annotate_hologram: "{id,part:exactPartId,text}",
    reorder_scenes: "{id,order:[everySceneId]}",
    update_scene: "{id,scene_id,text,title?}",
    import_hologram_url:
      "{url:HTTPSembeddedGLB,title}; CORS required,20MB; saved to library",
    aim_camera: "{id,target:[roomx,y,z],lens_mm:12..200}",
    set_light: "{id,light_id,color?,intensity?,position?}",
    move_actor: "{id,actor_id,position:[localx,y,z]}",
    show_character_act: "{id,index:zeroBased}",
    ride_tension:
      "{id,index:zeroBased}; start_tension_ride plays the on-panel first-person track camera",
    remove_belief: "{id,belief_id}; reversible via UNDO REMOVALS",
    complete_combination: "{id,synthesis:ClaudeGeneratedExplanation}",
    answer_counterargument: "{id,response,feedback}",
    inspect_bias_window: "{id:virtualTextWindow,analysis?}",
    read_spatial_tool: "{id}",
    save_camera_frame: "{id}; saves virtual set PNG to library/storyboard",
    pending_combinations: "{}; combined concepts awaiting Claude",
  };
  for (const name of Object.keys(tools))
    if (!help[name]) help[name] = { description: operations[name] };
  return { tools, help, update, builders, live };
}
