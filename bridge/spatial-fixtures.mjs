// Synthetic material for tests/screenshots only; no historical claims.
export const fixtures = {
  create_hologram: { title: "Camera schematic — demo", preset: "camera" },
  create_scene_cards: {
    title: "Demo script",
    scenes: [
      {
        id: "arrival",
        title: "Arrival",
        text: "A student enters a quiet room.",
      },
      {
        id: "discovery",
        title: "Discovery",
        text: "A projected map reveals a connection.",
      },
      {
        id: "choice",
        title: "Choice",
        text: "The student challenges the claim.",
      },
    ],
  },
  create_beat_corridor: {
    title: "Demo beats",
    beats: [
      { title: "Opening", description: "The room before the change." },
      { title: "Turn", description: "A new piece of evidence." },
      { title: "Resolution", description: "A choice based on evidence." },
    ],
  },
  create_character_orbits: {
    title: "Demo relationships",
    characters: [
      { id: "a", name: "Student" },
      { id: "b", name: "Mentor" },
      { id: "c", name: "Friend" },
    ],
    acts: [
      {
        title: "Act I",
        relationships: [{ from: "a", to: "b", strength: 0.8 }],
      },
      {
        title: "Act II",
        relationships: [{ from: "a", to: "c", strength: 0.9 }],
      },
    ],
  },
  create_tension_track: {
    title: "Demo tension",
    scenes: [
      { title: "Arrival", tension: 2 },
      { title: "Reveal", tension: 8 },
      { title: "Breath", tension: 3 },
      { title: "Choice", tension: 10 },
    ],
  },
  block_actors: {
    title: "Demo blocking",
    actors: [
      {
        id: "a",
        name: "Student",
        position: [-0.2, 0, 0],
        path: [
          [-0.2, 0, 0],
          [0.2, 0, -0.2],
        ],
      },
      { id: "b", name: "Mentor", position: [0.2, 0, 0] },
    ],
  },
  create_virtual_camera: { title: "Demo camera", lens_mm: 35 },
  build_film_set: {
    title: "Kitchen — procedural demo",
    description: "A cramped kitchen, night",
    width: 1.2,
    depth: 0.8,
  },
  sculpt_lights: {
    title: "Demo set lights",
    lights: [
      {
        id: "key",
        name: "Key light",
        color: "#ffe2b6",
        intensity: 2,
        position: [-0.3, 0.2, 0.2],
      },
      {
        id: "fill",
        name: "Fill light",
        color: "#91bfea",
        intensity: 1,
        position: [0.3, 0.2, 0.2],
      },
    ],
  },
  create_film_globe: {
    title: "Location fixture — not research",
    films: [
      {
        id: "f",
        title: "Synthetic film location",
        latitude: 35,
        longitude: 12,
        notes: "Demonstration coordinate only.",
        sources: ["Synthetic test source"],
      },
    ],
  },
  create_money_flow: {
    title: "Support fixture — not research",
    entities: [
      { id: "s", label: "Studio fixture" },
      { id: "d", label: "Agency fixture" },
      { id: "f", label: "Film fixture" },
    ],
    links: [
      {
        from: "d",
        to: "f",
        label: "Equipment",
        weight: 5,
        units: "illustrative support units",
        sources: ["Synthetic source"],
      },
      {
        from: "s",
        to: "f",
        label: "Script changes",
        weight: 2,
        units: "illustrative changes",
        sources: ["Synthetic source"],
      },
    ],
  },
  create_propaganda_radar: {
    title: "Demo score comparison",
    films: [
      {
        title: "Film A fixture",
        scores: { enemy: 3, music: 4, military: 5, framing: 2, message: 3 },
        evidence: "Synthetic values only.",
      },
      {
        title: "Film B fixture",
        scores: { enemy: 1, music: 3, military: 2, framing: 4, message: 2 },
        evidence: "Synthetic values only.",
      },
    ],
  },
  create_argument_tower: {
    title: "Demo argument",
    claims: [
      {
        id: "c1",
        claim: "Framing directs attention",
        evidence: [{ source: "Synthetic source", text: "Example only." }],
      },
      { id: "c2", claim: "Attention shapes a reading", evidence: [] },
    ],
  },
  create_quote_orbits: {
    title: "Demo quote evidence",
    claim: "Framing directs attention",
    quotes: [
      {
        id: "q1",
        text: "A synthetic quotation for demonstration.",
        source: "Synthetic source",
      },
      {
        id: "q2",
        text: "An alternative view deserves attention.",
        source: "Synthetic source B",
      },
    ],
  },
  create_source_constellation: {
    title: "Demo citations",
    sources: [
      { id: "a", title: "Source fixture A", citations: 10, cites: ["b"] },
      { id: "b", title: "Source fixture B", citations: 2, cites: [] },
    ],
  },
  create_counter_duel: {
    title: "Demo rebuttal",
    claim: "A framing choice can guide interpretation.",
    objection: "Viewers can resist that interpretation.",
    response: "Consider audience variation and competing readings.",
  },
  create_strength_glow: {
    title: "Demo evidence completeness",
    claims: [
      { id: "weak", claim: "Claim needing evidence", evidence: [] },
      {
        id: "strong",
        claim: "Claim with checked evidence",
        evidence: [
          { source: "Fixture A", verified: true },
          { source: "Fixture B", verified: true },
          { source: "Fixture C", verified: true },
        ],
      },
    ],
  },
  create_belief_web: {
    title: "Demo dependencies",
    beliefs: [
      { id: "a", claim: "Premise A", depends_on: [] },
      { id: "b", claim: "Claim B", depends_on: ["a"] },
      { id: "c", claim: "Conclusion C", depends_on: ["b"] },
    ],
  },
  create_steelman_statue: {
    title: "Demo steelman",
    view: "A viewpoint to examine",
    strongest_case:
      "The fairest version considers costs, benefits and a serious objection.",
  },
  create_idea_forge: {
    title: "Demo idea forge",
    a: "A locked room",
    b: "A public argument",
  },
  create_assumption_xray: {
    title: "Demo assumptions",
    argument: "Everyone watches this film, so its message must work.",
    premises: [
      {
        text: "Watching entails accepting.",
        basis: "Proposed assumption, not a fact.",
      },
      {
        text: "Popularity measures persuasion.",
        basis: "Proposed assumption.",
      },
    ],
  },
  create_echo_bubble: {
    title: "Demo source diversity",
    sources: [
      {
        id: "a",
        title: "Inside fixture",
        group: "A",
        inside: true,
        agrees: true,
      },
      {
        id: "b",
        title: "Outside fixture",
        group: "B",
        inside: false,
        agrees: false,
      },
    ],
  },
  create_influence_map: {
    title: "Demo influences",
    person: "Student",
    influences: [
      { id: "a", name: "Mentor", channel: "Conversation", weight: 6 },
      { id: "b", name: "Film", channel: "Cinema", weight: 3 },
    ],
  },
  create_lineage_tree: {
    title: "Demo idea lineage",
    nodes: [
      { id: "a", idea: "Earlier formulation", sources: ["Synthetic source"] },
      {
        id: "b",
        idea: "Later interpretation",
        parent: "a",
        sources: ["Synthetic link source"],
      },
    ],
  },
  create_bias_lens: {
    title: "Demo framing lens",
    text: "Obviously everyone knows the traitor always lies. This is a synthetic example.",
    analysis: "These terms may load the description; context still matters.",
  },
};
