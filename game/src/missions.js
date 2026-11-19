// The story: five dawn jobs for Delia Marsh and Silas Boggs.
// Each mission is a small state machine: a list of steps with a target point,
// a radius, a label, and what happens on arrival. The boot loop calls
// missionTick(G, mission, dt) and reads mission.hudText for the objective box.

export const MISSION_NAMES = [
  'Dawn Crate Run',
  'Gator Bait',
  'Toll Trouble',
  'Causeway Heist',
  'Pay the Debt',
];

export function missionIntro(index) {
  const lines = [
    ['Delia Marsh', 'Rook, honey, the fog is kind this morning. Take my crate across the river to the old stilt camp — and mind the gators. The airboat is yours. Bring me back $120 and we are square for the week.'],
    ['Delia Marsh', 'Three bait crates sunk in the marsh south of the landing. Wade out and haul them in. The deputies patrol the causeway, so keep your head down and your boots dry.'],
    ['Silas Boggs', 'The toll man skims my trucks, Rook. Lift the toll box off the causeway shack and bring it to my yard. Deputies will come running — make them work for it.'],
    ['Silas Boggs', 'Time to get serious. An armored truck crosses the causeway at dawn. Take it. Ram it, shoot it, steal it — I do not care how. Bring it to my yard in one piece.'],
    ['Silas Boggs', 'Last job, Rook. Drive the truck and the toll money to my yard and the debt is dead. Do this clean and the delta is yours again.'],
  ];
  return lines[index] || ['Delia Marsh', 'The fog is lifting. Go make yourself useful.'];
}

export function buildMissions(delta) {
  const river = (y) => {
    let cx = 1750 + 260 * Math.sin(y / 700) + 120 * Math.sin(y / 263 + 1.7);
    return cx;
  };
  const camp = { x: river(1500) + 260, y: 1500 };
  const marshSpots = [
    { x: 700, y: 2150 }, { x: 1050, y: 2300 }, { x: 420, y: 2050 },
  ];
  return [
    {
      name: MISSION_NAMES[0], reward: 120, started: false, done: false,
      steps: [
        { kind: 'goto', x: delta.deliaSpot.x, y: delta.deliaSpot.y, r: 90, label: 'Pick up the crate from Delia at the bait shop', say: 'Crate in hand. Now cross the river to the stilt camp, east bank.' },
        { kind: 'goto', x: camp.x, y: camp.y, r: 100, label: 'Deliver the crate to the stilt camp across the river', say: 'Delivered. Delia pays $120. The fog is still thick — good.' },
      ],
    },
    {
      name: MISSION_NAMES[1], reward: 150, started: false, done: false,
      steps: [
        { kind: 'collect', x: marshSpots[0].x, y: marshSpots[0].y, r: 70, label: 'Recover bait crate 1 of 3 in the southern marsh', say: 'One crate. Two more out there in the muck.' },
        { kind: 'collect', x: marshSpots[1].x, y: marshSpots[1].y, r: 70, label: 'Recover bait crate 2 of 3 in the southern marsh', say: 'Two crates. One more.' },
        { kind: 'collect', x: marshSpots[2].x, y: marshSpots[2].y, r: 70, label: 'Recover bait crate 3 of 3 in the southern marsh', say: 'All three. Haul them back to Delia at the bait shop.' },
        { kind: 'goto', x: delta.deliaSpot.x, y: delta.deliaSpot.y, r: 90, label: 'Return the bait crates to Delia', say: 'Delia pays $150. She says you smell like swamp and success.' },
      ],
    },
    {
      name: MISSION_NAMES[2], reward: 200, started: false, done: false,
      steps: [
        { kind: 'goto', x: delta.tollSpot.x, y: delta.tollSpot.y, r: 80, label: 'Reach the causeway toll shack', say: 'Grab the toll box — the deputies are coming. Run!' },
        { kind: 'collect', x: delta.tollSpot.x, y: delta.tollSpot.y, r: 60, label: 'Take the toll box', say: 'Toll box secured. Lose the deputies, then reach Silas yard.' },
        { kind: 'escape', x: delta.silasSpot.x, y: delta.silasSpot.y, r: 130, label: 'Lose the heat, then reach Silas Boggs yard', say: 'Silas counts the toll money and pays $200. He is smiling. Worry about that later.' },
      ],
    },
    {
      name: MISSION_NAMES[3], reward: 400, started: false, done: false,
      steps: [
        { kind: 'goto', x: delta.tollSpot.x, y: delta.tollSpot.y, r: 120, label: 'Wait on the causeway for the armored truck', say: 'There it is — the armored truck. Ram it or shoot the driver out. Steal it!' },
        { kind: 'steal', x: delta.tollSpot.x, y: delta.tollSpot.y, r: 160, label: 'Steal the armored truck (get close and press E)', say: 'Truck is yours! Three stars and every deputy in the parish is coming. Drive!' },
        { kind: 'deliver', x: delta.silasSpot.x, y: delta.silasSpot.y, r: 150, label: 'Deliver the armored truck to Silas Boggs yard', say: 'The truck is in the yard. Silas pays $400 and laughs like a gator.' },
      ],
    },
    {
      name: MISSION_NAMES[4], reward: 500, started: false, done: false,
      steps: [
        { kind: 'goto', x: delta.silasSpot.x, y: delta.silasSpot.y, r: 120, label: 'Meet Silas at his yard for the final run', say: 'Take the truck and the money to the lake dock. No mistakes, Rook.' },
        { kind: 'deliver', x: delta.lakeSpot.x, y: delta.lakeSpot.y, r: 130, label: 'Deliver the truck to the lake dock', say: 'Done. The debt is dead. The delta is yours, Rook Calloway.' },
      ],
    },
  ];
}

export function currentStep(mission) {
  if (!mission || mission.done) return null;
  return mission.steps[mission.stepIndex || 0] || null;
}

export function missionHudText(G) {
  const m = G.missions[G.missionIndex];
  if (!m) return 'All jobs done. The delta is yours — free roam, Rook.';
  if (!m.started) {
    const npc = G.missionIndex === 0 || G.missionIndex === 1 ? 'Delia Marsh' : 'Silas Boggs';
    return `<b>JOB ${G.missionIndex + 1}/5 — ${m.name}</b><br>Walk up to ${npc} and press E to start the job.`;
  }
  const step = currentStep(m);
  if (!step) return `<b>${m.name}</b><br>Job complete.`;
  return `<b>JOB ${G.missionIndex + 1}/5 — ${m.name}</b><br>${step.label}<br><span style="opacity:.8">Reward $${m.reward} &middot; press M for the job list</span>`;
}
