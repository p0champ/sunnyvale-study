// Spatial behaviour shared by the study tools. Intentional navigation moves
// the diagram or an on-panel camera; it never moves the wearer's XR viewpoint.
export function installSpatialExperiences(api) {
  const {
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
  } = api;

  builders.beat_corridor = (p, s) => {
    list(s.beats, "beats", 1, 16);
    const hall = new THREE.Group();
    p.children[0].add(hall);
    const floorOffset = -p.position.y;
    s.beats.forEach((beat, i) => {
      const doorway = new THREE.Group();
      doorway.position.set(0, floorOffset, -i * 1.3);
      hall.add(doorway);
      for (const x of [-0.47, 0.47]) {
        const post = box([0.045, 1.95, 0.06], 0x657f8d);
        post.position.set(x, 0.975, 0);
        doorway.add(post);
      }
      const lintel = box([0.985, 0.045, 0.06], P.blue);
      lintel.position.set(0, 1.95, 0);
      doorway.add(lintel);
      label(
        doorway,
        i + 1 + " · " + beat.title,
        [0, 1.75, 0.04],
        0.8,
        0.13,
        () => detail(beat.title, beat),
      );
      // A doorway is open, with no virtual floor or blocking wall.
      p.userData.nodes[String(i)] = doorway;
    });
    p.userData.stage = hall;
    p.userData.selectBeat = (i) => {
      num(i, "beat", 0, s.beats.length - 1);
      if (!Number.isInteger(i)) throw Error("Use an integer beat index.");
      p.userData.state.beat = i;
      hall.position.z = i * 1.3;
      ctx.announce("BEAT " + (i + 1) + ": " + s.beats[i].title);
      return {
        index: i,
        beat: s.beats[i],
        doorway_metres: [0.94, 1.95],
        note: "Walk through if your real room is clear, or bring each beat to you with NEXT.",
      };
    };
    button(p, "PREV BEAT", -0.3, () =>
      p.userData.selectBeat(Math.max(0, (p.userData.state.beat || 0) - 1)),
    );
    button(p, "NEXT BEAT", 0, () =>
      p.userData.selectBeat(
        Math.min(s.beats.length - 1, (p.userData.state.beat || 0) + 1),
      ),
    );
    button(p, "READ BEAT", 0.3, () =>
      detail(
        "Beat " + ((p.userData.state.beat || 0) + 1),
        s.beats[p.userData.state.beat || 0],
      ),
    );
    p.userData.selectBeat(0);
  };

  builders.argument_tower = (p, s) => {
    list(s.claims, "claims", 1, 12);
    unique(s.claims);
    const tower = new THREE.Group();
    p.children[0].add(tower);
    const floorOffset = -p.position.y;
    s.claims.forEach((claim, i) => {
      if (!Array.isArray(claim.evidence))
        throw Error("Each claim needs an evidence list.");
      const floor = new THREE.Group();
      floor.position.y = floorOffset + i * 1.35;
      tower.add(floor);
      const slab = box(
        [1.45, 0.035, 1.25],
        claim.evidence.length ? 0x567861 : 0x885b53,
      );
      slab.position.z = -0.35;
      slab.material.transparent = true;
      slab.material.opacity = 0.25;
      floor.add(slab);
      label(
        floor,
        "FLOOR " + (i + 1) + " · " + text(claim.claim, 70),
        [0, 1.1, -0.65],
        1.15,
        0.18,
        () => detail("Claim " + (i + 1), claim),
      );
      claim.evidence.slice(0, 8).forEach((e, k) => {
        const support = box([0.055, 1.3, 0.055], P.blue);
        support.position.set(
          k % 2 ? -0.64 : 0.64,
          -0.65,
          -0.85 + Math.floor(k / 2) * 0.28,
        );
        floor.add(support);
        label(
          floor,
          "EVIDENCE " + (k + 1),
          [support.position.x, 0.25, support.position.z + 0.04],
          0.24,
          0.075,
          () => detail("Evidence " + (k + 1), e),
        );
      });
      p.userData.nodes[claim.id] = floor;
    });
    p.userData.stage = tower;
    p.userData.selectFloor = (i) => {
      num(i, "floor", 0, s.claims.length - 1);
      if (!Number.isInteger(i)) throw Error("Use an integer floor index.");
      p.userData.state.floor = i;
      tower.position.y = -i * 1.35;
      ctx.announce("FLOOR " + (i + 1) + ": " + s.claims[i].claim);
      return {
        floor: i,
        claim: s.claims[i],
        note: "The tower moves to your level; your headset viewpoint stays in your real room.",
      };
    };
    button(p, "DOWN", -0.3, () =>
      p.userData.selectFloor(Math.max(0, (p.userData.state.floor || 0) - 1)),
    );
    button(p, "UP", 0, () =>
      p.userData.selectFloor(
        Math.min(s.claims.length - 1, (p.userData.state.floor || 0) + 1),
      ),
    );
    button(p, "EVIDENCE", 0.3, () =>
      detail("Claim and evidence", s.claims[p.userData.state.floor || 0]),
    );
    p.userData.selectFloor(0);
  };

  builders.tension_track = (p, s) => {
    list(s.scenes, "scenes", 2, 30);
    const points = s.scenes.map((v, i) => {
      num(v.tension, "tension", 0, 10);
      return V([
        (i / (s.scenes.length - 1) - 0.5) * 1.1,
        -0.2 + v.tension * 0.04,
        -i * 0.16,
      ]);
    });
    const curve = new THREE.CatmullRomCurve3(points),
      g = p.children[0];
    p.userData.curve = curve;
    num(s.seconds_per_scene || 2.5, "seconds_per_scene", 0.5, 15);
    for (const offset of [-0.025, 0.025]) {
      const shifted = new THREE.CatmullRomCurve3(
        points.map((v, i) => {
          const tangent = curve.getTangent(i / (points.length - 1));
          return v
            .clone()
            .add(
              V([tangent.z, 0, -tangent.x]).normalize().multiplyScalar(offset),
            );
        }),
      );
      g.add(
        mesh(new THREE.TubeGeometry(shifted, 120, 0.006, 6, false), P.coral),
      );
    }
    const car = ball(0.025, P.amber);
    p.userData.captureExcluded = new Set([car]);
    g.add(car);
    const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.003, 30);
    g.add(camera);
    const target = new THREE.WebGLRenderTarget(480, 270),
      screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.78, 0.43875),
        new THREE.MeshBasicMaterial({ map: target.texture, toneMapped: false }),
      );
    screen.position.set(0, 0, 0.3);
    screen.visible = false;
    g.add(screen);
    Object.assign(p.userData, {
      virtualCamera: camera,
      previewTarget: target,
      previewScreen: screen,
      previewOn: false,
      lastPreview: 0,
      captureKinds: new Set(["tension_track"]),
      rideTime: 0,
    });
    const oldClose = p.userData.onClose;
    p.userData.onClose = () => {
      target.dispose();
      oldClose();
    };
    for (let i = 0; i < 32; i++) {
      const t = i / 31,
        at = curve.getPoint(t),
        tangent = curve.getTangent(t);
      const tie = box([0.066, 0.003, 0.012], 0x668492);
      tie.position.copy(at);
      tie.quaternion.setFromUnitVectors(V([0, 0, 1]), tangent);
      g.add(tie);
    }
    const statusCanvas = document.createElement("canvas");
    statusCanvas.width = 768;
    statusCanvas.height = 64;
    const statusTexture = new THREE.CanvasTexture(statusCanvas);
    statusTexture.colorSpace = THREE.SRGBColorSpace;
    const status = new THREE.Mesh(
      new THREE.PlaneGeometry(0.86, 0.072),
      new THREE.MeshBasicMaterial({
        map: statusTexture,
        transparent: true,
        toneMapped: false,
      }),
    );
    status.position.set(0, -0.27, 0.33);
    status.userData.spatialLabel = true;
    g.add(status);
    p.userData.rideAt = (t) => {
      t = Math.max(0, Math.min(0.995, t));
      p.userData.rideTime = t;
      const at = curve.getPoint(t),
        ahead = curve.getPoint(Math.min(1, t + 0.035));
      car.position.copy(at);
      camera.position.copy(at).add(V([0, 0.09, 0]));
      camera.lookAt(g.localToWorld(ahead.clone().add(V([0, 0.06, 0]))));
      const index = Math.min(
        s.scenes.length - 1,
        Math.round(t * (s.scenes.length - 1)),
      );
      p.userData.state.step = index;
      if (p.userData.rideStatus !== index) {
        p.userData.rideStatus = index;
        const c = statusCanvas.getContext("2d");
        c.clearRect(0, 0, 768, 64);
        c.fillStyle = "rgba(23,29,38,.96)";
        c.fillRect(0, 0, 768, 64);
        c.fillStyle = "#f2ece6";
        c.font = '600 30px "Segoe UI",sans-serif';
        c.textAlign = "center";
        c.fillText(
          index +
            1 +
            "/" +
            s.scenes.length +
            " · " +
            s.scenes[index].title +
            " · TENSION " +
            s.scenes[index].tension +
            "/10",
          384,
          43,
          740,
        );
        statusTexture.needsUpdate = true;
      }
    };
    p.userData.ride = (i) => {
      num(i, "scene", 0, s.scenes.length - 1);
      if (!Number.isInteger(i)) throw Error("Use an integer scene index.");
      p.userData.rideAt(i / (s.scenes.length - 1));
      ctx.announce(s.scenes[i].title + " · tension " + s.scenes[i].tension);
      return { scene: s.scenes[i], ride_view: p.userData.previewOn };
    };
    p.userData.startRide = () => {
      p.userData.previewOn = true;
      p.userData.previewScreen.visible = true;
      p.userData.ridePlaying = true;
      if (p.userData.rideTime >= 0.99) p.userData.rideAt(0);
    };
    button(p, "BACK", -0.43, () =>
      p.userData.ride(Math.max(0, (p.userData.state.step || 0) - 1)),
    );
    button(p, "RIDE VIEW", -0.2, () => p.userData.startRide());
    button(p, "PAUSE", 0.04, () => {
      p.userData.ridePlaying = false;
    });
    button(p, "TRACK", 0.28, () => {
      p.userData.ridePlaying = false;
      p.userData.previewOn = false;
      screen.visible = false;
    });
    label(
      g,
      "Ride the track in this viewing window; your room stays still.",
      [0, 0.29, 0.04],
      1.15,
      0.06,
    );
    points.forEach((at, i) =>
      label(g, s.scenes[i].title, [at.x, -0.3, at.z], 0.22, 0.065, () =>
        detail(s.scenes[i].title, s.scenes[i]),
      ),
    );
    p.userData.rideAt(0);
  };

  // Matching terms is a cue to inspect context, never a claim of factual bias.
  function markers(value) {
    const found = [];
    for (const word of [
      "obviously",
      "everyone knows",
      "brainwash",
      "traitor",
      "radical",
      "evil",
      "patriot",
      "so-called",
      "always",
      "never",
    ]) {
      const re = new RegExp("\\b" + word.replaceAll(" ", "\\s+") + "\\b", "gi");
      let hit;
      while ((hit = re.exec(value)) && found.length < 80)
        found.push({
          word: hit[0],
          at: hit.index,
          context: value.slice(Math.max(0, hit.index - 45), hit.index + 100),
        });
    }
    return found.sort((a, b) => a.at - b.at);
  }
  function lensScreen(p, kind) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 640;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.5),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        toneMapped: false,
      }),
    );
    screen.position.set(0, 0, 0.055);
    p.children[0].add(screen);
    p.userData.lensScreen = { canvas, texture, screen };
    return screen;
  }
  function paintLens(p, heading, lines) {
    const { canvas, texture } = p.userData.lensScreen,
      g = canvas.getContext("2d");
    g.clearRect(0, 0, 1024, 640);
    g.fillStyle = "rgba(23,29,38,.97)";
    g.beginPath();
    g.roundRect(0, 0, 1024, 640, 38);
    g.fill();
    g.strokeStyle = "#91bfea";
    g.lineWidth = 3;
    g.stroke();
    g.font = '600 38px "Segoe UI",sans-serif';
    g.fillStyle = "#91bfea";
    g.fillText(heading.slice(0, 44), 36, 58);
    g.font = '37px "Segoe UI",sans-serif';
    let y = 112;
    for (const entry of lines) {
      let line = "";
      g.fillStyle = entry.accent ? "#efb18f" : "#f2ece6";
      for (const word of String(entry.text).split(/\s+/)) {
        if (g.measureText(line + " " + word).width > 940 && line) {
          if (y > 590) break;
          g.fillText(line, 36, y);
          y += 49;
          line = word;
        } else line += (line ? " " : "") + word;
      }
      if (y > 590) break;
      g.fillText(line, 36, y);
      y += 58;
    }
    texture.needsUpdate = true;
  }
  async function targetText(target) {
    if (target.userData.browserId) {
      const info = await ctx.browser()?.describe(target.userData.browserId);
      if (!info || info.stale)
        throw Error(
          "Refresh the shared browser connection before using this lens.",
        );
      return text(info.text, 12000);
    }
    return text(target.userData.body, 12000);
  }
  function lensExcerpt(value, matches) {
    if (!matches.length)
      return [
        {
          text: "No listed wording markers found. This does not establish neutrality.",
        },
      ];
    const first = matches[0].at;
    return [
      {
        text:
          "Possible wording: " +
          [...new Set(matches.map((m) => m.word.toLowerCase()))]
            .slice(0, 10)
            .join(", "),
        accent: true,
      },
      { text: value.slice(Math.max(0, first - 45), first + 290) },
      { text: "Read the surrounding passage before judging its framing." },
    ];
  }
  builders.bias_lens = (p, s) => {
    if (!s.text && !s.window_id)
      throw Error("Supply article text or a virtual/shared-browser window id.");
    lensScreen(p, "bias");
    p.userData.state.matches = markers(s.text || "");
    p.userData.inspectTarget = async (target) => {
      const value = await targetText(target);
      s.text = value;
      s.window_id =
        target.userData.id || "browser:" + target.userData.browserId;
      p.userData.state.matches = markers(value);
      p.userData.state.sourceTitle = target.userData.title;
      paintLens(
        p,
        "FRAMING LENS · " + text(target.userData.title, 22),
        lensExcerpt(value, p.userData.state.matches),
      );
      return p.userData.state.matches;
    };
    paintLens(
      p,
      "FRAMING LENS · CONTEXT MATTERS",
      lensExcerpt(s.text || "", p.userData.state.matches),
    );
    label(
      p.children[0],
      "Hold over a text or shared-browser window to inspect it.",
      [0, 0.3, 0.05],
      1.15,
      0.06,
    );
    button(p, "FULL CONTEXT", 0, () =>
      detail(
        "Framing — human review needed",
        (s.analysis || "") +
          "\n\n" +
          p.userData.state.matches
            .map((m) => m.word + ": " + m.context)
            .join("\n\n"),
      ),
    );
  };
  builders.assumption_xray = (p, s) => {
    if (!s.argument) throw Error("Supply the argument.");
    list(s.premises || [], "premises", 0, 20);
    lensScreen(p, "assumption");
    p.userData.state.hidden = true;
    p.userData.inspectTarget = async (target) => {
      const value = await targetText(target);
      const key = String(s.argument).toLowerCase().slice(0, 60),
        same =
          target.userData.id === s.window_id ||
          value.toLowerCase().includes(key);
      p.userData.state.hidden = !same;
      paintLens(
        p,
        same ? "PROPOSED HIDDEN PREMISES" : "X-RAY · DIFFERENT ARGUMENT",
        same
          ? (s.premises || []).map((v) => ({
              text: text(v.text || v, 500),
              accent: true,
            }))
          : [
              {
                text: "These supplied premises belong to another argument. Ask Claude to analyse this material.",
              },
            ],
      );
      return { revealed: same, premises: same ? s.premises : [] };
    };
    paintLens(p, "ASSUMPTION X-RAY", [
      {
        text: "Hold over the argument window to reveal its proposed hidden premises.",
      },
      { text: s.argument },
    ]);
    label(
      p.children[0],
      "Proposed premises need human review.",
      [0, 0.3, 0.05],
      1.05,
      0.06,
    );
    button(p, "READ ARGUMENT", 0, () =>
      detail("Argument and proposed premises", {
        argument: s.argument,
        premises: s.premises,
      }),
    );
  };

  const oldQuotes = builders.quote_orbits;
  builders.quote_orbits = (p, s) => {
    oldQuotes(p, s);
    for (const o of [...p.children[0].children])
      if (o.isLine) {
        p.children[0].remove(o);
        o.geometry.dispose();
        o.material.dispose();
      }
    p.userData.quoteMotion = Object.entries(p.userData.nodes)
      .filter(([id]) => id !== "claim")
      .map(([id, o], i) => ({
        o,
        angle: (i / s.quotes.length) * Math.PI * 2,
        radius: Math.max(0.43, s.quotes.length * 0.07),
        line: line(p.children[0], [[0, 0, 0], o.position], 0x657c8b),
      }));
  };
  const oldCharacters = builders.character_orbits;
  builders.character_orbits = (p, s) => {
    oldCharacters(p, s);
    const original = p.userData.showAct;
    p.userData.showAct = (i) => {
      const before = Object.values(p.userData.nodes).map((o) =>
        o.position.clone(),
      );
      original(i);
      p.userData.orbitTargets = Object.values(p.userData.nodes).map((o) =>
        o.position.clone(),
      );
      Object.values(p.userData.nodes).forEach((o, j) =>
        o.position.copy(before[j]),
      );
      p.userData.orbitBlend = 0;
      p.userData.orbitFrom = before;
    };
    p.userData.showAct(0);
  };
  const oldBeliefs = builders.belief_web;
  builders.belief_web = (p, s) => {
    oldBeliefs(p, s);
    const original = p.userData.removeBelief;
    p.userData.beliefHomes = Object.fromEntries(
      Object.entries(p.userData.nodes).map(([id, o]) => [
        id,
        o.position.clone(),
      ]),
    );
    p.userData.removeBelief = (id) => {
      const affected = original(id);
      p.userData.wobble = 1.8;
      return affected;
    };
  };

  function update(p, dt) {
    const kind = p.userData.spatial.kind;
    if (p.userData.ridePlaying) {
      const seconds = p.userData.spatial.spec.seconds_per_scene || 2.5;
      p.userData.rideAt(
        p.userData.rideTime +
          dt / (seconds * (p.userData.spatial.spec.scenes.length - 1)),
      );
      if (p.userData.rideTime >= 0.995) p.userData.ridePlaying = false;
    }
    for (const motion of p.userData.quoteMotion || []) {
      motion.angle += dt * 0.12;
      motion.o.position.set(
        Math.cos(motion.angle) * motion.radius,
        Math.sin(motion.angle) * motion.radius * 0.65,
        Math.sin(motion.angle * 2) * 0.08,
      );
      const attr = motion.line.geometry.attributes.position;
      attr.setXYZ(1, ...motion.o.position.toArray());
      attr.needsUpdate = true;
    }
    if (p.userData.orbitTargets) {
      p.userData.orbitBlend = Math.min(1, p.userData.orbitBlend + dt * 1.5);
      p.userData.orbitAngle = (p.userData.orbitAngle || 0) + dt * 0.035;
      const a = p.userData.orbitAngle;
      Object.values(p.userData.nodes).forEach((o, i) => {
        const target = p.userData.orbitTargets[i]
          .clone()
          .applyAxisAngle(V([0, 0, 1]), a);
        o.position.lerpVectors(
          p.userData.orbitFrom[i],
          target,
          p.userData.orbitBlend,
        );
      });
      const rel =
          p.userData.spatial.spec.acts[p.userData.act].relationships || [],
        group = p.children[0].children.find(
          (g) => g.isGroup && g.children.some((c) => c.isLine),
        );
      group?.children
        .filter((c) => c.isLine)
        .forEach((l, i) => {
          const r = rel[i];
          if (r) {
            const attr = l.geometry.attributes.position;
            attr.setXYZ(0, ...p.userData.nodes[r.from].position.toArray());
            attr.setXYZ(1, ...p.userData.nodes[r.to].position.toArray());
            attr.needsUpdate = true;
          }
        });
    }
    if (p.userData.wobble > 0) {
      p.userData.wobble = Math.max(0, p.userData.wobble - dt);
      for (const id of p.userData.state.affected || []) {
        const o = p.userData.nodes[id];
        o.position.copy(p.userData.beliefHomes[id]);
        o.position.x +=
          (Math.sin(p.userData.wobble * 30) * 0.018 * p.userData.wobble) / 1.8;
      }
    }
    if (
      (kind === "bias_lens" || kind === "assumption_xray") &&
      p.visible &&
      ctx.panels.includes(p) &&
      (p.userData.held || p.userData.spatial.spec.window_id) &&
      !p.userData.inspecting
    ) {
      const now = performance.now();
      if (now - (p.userData.lastInspect || 0) < 1200) return;
      const center = p.getWorldPosition(new THREE.Vector3());
      const target = ctx.allPanels().find((w) => {
        if (
          w === p ||
          !w.visible ||
          w.userData.spatial ||
          (!w.userData.body && !w.userData.browserId)
        )
          return false;
        const local = w.worldToLocal(center.clone()),
          size = w.userData.size || { w: 0.8, h: 0.6 };
        return (
          Math.abs(local.z) < 0.2 &&
          Math.abs(local.x) < size.w / 2 &&
          Math.abs(local.y) < size.h / 2
        );
      });
      if (target) {
        p.userData.lastInspect = now;
        p.userData.inspecting = true;
        p.userData
          .inspectTarget(target)
          .catch((e) => ctx.announce(e.message))
          .finally(() => (p.userData.inspecting = false));
      }
    }
  }
  return { update, paintLens };
}
