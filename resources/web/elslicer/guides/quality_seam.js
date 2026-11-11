// Settings guide: the Seam section of the Quality tab.
(() => {
  const {C, num, length, on, round, mm, svg, text, rect, line, warn} = G;
  const S = window.SETTINGS;

  // A cylinder seen from the side with where each layer's loop starts and ends.
  function seamSide(position, caption) {
    let body = text(20, 24, 'A round part seen from the front: each dot is where one layer\'s outer loop starts and ends');
    const x0 = 230, w = 300, top = 50, rows = 14, rh = 12;
    body += rect(x0, top, w, rows * rh, C.plastic2, {rx: 6});
    for (let r = 0; r < rows; ++r) body += line(x0, top + r * rh, x0 + w, top + r * rh, C.plastic, {sw: 1});
    let seed = 7;
    const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let r = 0; r < rows; ++r) {
      let x = null;
      if (position === 'aligned' || position === 'aligned_back') x = x0 + w * 0.62;
      else if (position === 'back') x = null; // hidden behind
      else if (position === 'nearest') x = x0 + w * (0.55 + 0.12 * Math.sin(r * 1.3));
      else if (position === 'random') x = x0 + w * (0.06 + 0.88 * rand());
      if (x != null) body += `<circle cx="${x}" cy="${top + r * rh + rh / 2}" r="3.5" fill="${C.warm}"/>`;
    }
    if (position === 'back') body += text(x0 + w / 2, top + rows * rh + 24, 'All seams are at the back, out of sight from here', {anchor: 'middle'});
    if (position === 'aligned' || position === 'aligned_back') body += text(x0 + w / 2, top + rows * rh + 24, 'One straight seam line', {anchor: 'middle'});
    if (position === 'random') body += text(x0 + w / 2, top + rows * rh + 24, 'No line, but tiny marks all over', {anchor: 'middle'});
    if (position === 'nearest') body += text(x0 + w / 2, top + rows * rh + 24, 'Seams wander near wherever the nozzle arrives', {anchor: 'middle'});
    return svg(760, 250, body, caption);
  }

  // One loop seen from above, ending a little before its start.
  function loopTop(gapMm, nozzle, o = {}) {
    const cx = 380, cy = 135, r = 85, gap = Math.min(0.9, gapMm / (2 * Math.PI * 10)) * 2 * Math.PI;
    const a0 = -Math.PI / 2, a1 = a0 + 2 * Math.PI - Math.max(gap, 0.0001);
    const p = a => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [sx, sy] = p(a0), [ex, ey] = p(a1);
    let body = text(20, 24, o.title || 'One outer loop from above, on a 20 mm round part (gap drawn to scale)');
    body += `<path d="M${sx},${sy} A${r},${r} 0 1 1 ${ex},${ey}" fill="none" stroke="${C.accent}" stroke-width="10" stroke-linecap="round"/>`;
    if (o.wipe) body += `<path d="M${ex},${ey} Q${cx - 25},${cy - r + 30} ${cx - 40},${cy - r + 45}" fill="none" stroke="${C.warm}" stroke-width="3" stroke-dasharray="6 4"/>`;
    body += `<circle cx="${sx}" cy="${sy}" r="5" fill="${C.good}"/>` + text(sx + 10, sy - 10, 'start', {fill: C.good});
    body += text(ex - 10, ey - 14, 'end', {anchor: 'end', fill: C.warm});
    if (o.wipe) body += text(cx - 46, cy - r + 64, 'wipe inwards', {fill: C.warm, anchor: 'end'});
    return svg(760, 260, body, o.caption);
  }

  // A scarf joint from the side: the loop's start ramps up, its end ramps down over it.
  function scarf(lengthMm, startPct, steps, o = {}) {
    const x0 = 60, W = 640, y = 170, h = 70, L = Math.min(W * 0.8, Math.max(0, lengthMm) / 40 * W);
    const sh = h * Math.min(1, startPct);
    let body = text(20, 24, o.title || 'The seam cut open and seen from the side, enlarged in height');
    body += rect(x0, y, W, 24, C.plastic2) + text(x0 + W + 6, y + 16, 'layer below', {size: 12});
    if (L <= 0) {
      body += rect(x0, y - h, W, h, C.accent);
      body += line(x0 + W / 2, y - h, x0 + W / 2, y, C.warm, {sw: 3});
      body += text(x0 + W / 2, y - h - 12, 'a plain butt joint: start and end meet edge to edge', {anchor: 'middle', fill: C.warm});
    } else {
      const s = x0 + 60, n = Math.max(1, steps);
      let pts = `${x0},${y} ${x0},${y - h} ${s},${y - h}`;
      // The end of the loop ramps down from full height.
      body += `<polygon points="${x0},${y} ${x0},${y - h} ${s},${y - h} ${s + L},${y - sh} ${s + L},${y}" fill="${C.accent}" opacity="0.55"/>`;
      // The start ramps up in steps.
      let path = `M${s},${y} `;
      for (let i = 0; i <= n; ++i) {
        const x = s + L * i / n, hh = sh + (h - sh) * i / n;
        path += `L${x},${y - hh} ` + (i < n ? `L${s + L * (i + 1) / n},${y - hh} ` : '');
      }
      path += `L${x0 + W},${y - h} L${x0 + W},${y} Z`;
      body += `<path d="${path}" fill="${C.accent}"/>`;
      body += line(s, y + 36, s + L, y + 36, C.text) + text(s + L / 2, y + 54, `scarf ${mm(lengthMm)} long, ${n} steps`, {anchor: 'middle', fill: C.text});
      body += text(s + 4, y - h - 12, 'the loop\'s start climbs up gradually; its end slopes down over it', {fill: C.muted});
    }
    return svg(760, 250, body, o.caption);
  }

  const nozzle = ctx => ctx.nozzle;
  const ON = (note1, note0) => ({'1': note1, '0': note0});

  window.SECTIONS['Seam'] = {
    intro: ctx => `<p>Every wall is printed as closed loops, one per layer. A loop has to start and end somewhere, and where it does the nozzle leaves a small mark: a dot, a tiny bump or a little dent. Stacked layer after layer, these marks make the <b>seam</b>, the one place you can usually see on a smooth part.</p>
      <p>These settings decide where the seam goes, and how the start and end of each loop are joined so the mark is as small as possible. They change looks, not strength (except the scarf joint, which also strengthens the join).</p>`,
  };

  S.seam_position = {
    title: 'Seam position',
    explain: () => `<p>Where on each loop the printer starts and ends, and so where the seam line forms.</p>
      <p><b>Aligned</b> puts every layer's start in the same place, so the marks line up into one thin vertical line, usually hidden in a corner. <b>Back</b> puts it at the back of the part, away from you. <b>Nearest</b> starts wherever the nozzle arrives, which is quickest but scatters the seam. <b>Random</b> spreads the marks everywhere, so there is no line, but the whole surface gets a slightly rough texture.</p>`,
    picture: (ctx, v) => seamSide(v),
    effects: (ctx, v) => ({
      aligned: [['Looks', 'One neat seam line, tucked into a corner on boxy parts.'], ['Best for', 'Most parts. On round parts the line is visible but clean.'], ['Time', 'No difference.']],
      aligned_back: [['Looks', 'One neat seam line, placed towards the back where it can be.'], ['Best for', 'Round or smooth parts you will display from the front.'], ['Time', 'No difference.']],
      back: [['Looks', 'The seam goes to the back of the part, facing away from the front of the bed.'], ['Best for', 'Display pieces where only the front matters.'], ['Time', 'A little extra travel on some layers.']],
      nearest: [['Looks', 'Seams scatter wherever the nozzle arrives; sometimes they line up, sometimes not.'], ['Best for', 'Functional parts where looks don\'t matter.'], ['Time', 'The least travel: slightly faster.']],
      random: [['Looks', 'No seam line, but tiny bumps all over the surface, like a light texture.'], ['Best for', 'Round vases and organic shapes where any line would show.'], ['Strength', 'Starting in many places can leave small weak spots in thin walls.']],
    }[v] || []),
    notes: {aligned: 'One clean line, hidden in corners.', aligned_back: 'One line, kept towards the back.', back: 'Always at the back.', nearest: 'Fastest, scattered.', random: 'No line, slight texture everywhere.'},
  };

  S.staggered_inner_seams = {
    title: 'Staggered inner seams',
    explain: () => `<p>The inner walls also have seams. Normally they sit right behind the outer seam, all in one spot, which makes that spot slightly weaker and can push a bump outwards.</p>
      <p>Turned on, each inner wall's seam is moved a little further along, so they form a zigzag instead of a stack. You won't see it from outside; it spreads the weak spots out.</p>`,
    effects: (ctx, v) => on(v) ? [['Strength', 'Seams don\'t pile up in one place: slightly stronger at the seam.'], ['Looks', 'Can reduce a bulge at the seam on thin walls.']] :
      [['Strength', 'All seams in one spot: the part is a bit weaker along that line.'], ['Looks', 'Fine on most parts.']],
    notes: ON('Spreads the inner seams out.', 'Inner seams sit behind the outer one.'),
  };

  S.seam_gap = {
    title: 'Seam gap',
    explain: ctx => `<p>Each loop stops this much before it reaches its own start. The nozzle keeps oozing a little after it stops, and that ooze fills the gap; without a gap the extra plastic piles up into a bump at the seam.</p>
      <p>In mm, or as a % of the nozzle (${ctx.nozzle} mm). Too big and you get a small hole or dent instead of a bump.</p>`,
    picture: (ctx, v) => loopTop(length(v, nozzle(ctx)), nozzle(ctx), {caption: `The loop stops ${mm(length(v, nozzle(ctx)))} before its start.`}),
    effects: (ctx, v) => {
      const g = length(v, nozzle(ctx)), n = nozzle(ctx);
      return [['Looks', g <= 0.02 ? 'No gap: a small bump or blob is likely at the seam.' : g <= 0.2 * n ? 'A small gap, filled by the ooze: the seam is flat.' : g <= 0.5 * n ? 'A larger gap: good for oozy materials like PETG, but may leave a dent with PLA.' : warn('A big gap: a visible notch or hole at the seam is likely.')],
        ['Strength', g > 0.5 * n ? 'The join is slightly weaker where the gap is.' : 'No real difference.']];
    },
    choices: () => [{value: '0', label: 'None', note: 'Start and end meet.'}, {value: '10%', label: '10%', note: 'The usual choice.'},
      {value: '15%', label: '15%', note: 'For materials that ooze.'}, {value: '25%', label: '25%', note: 'For very oozy materials.'}],
    exact: () => ({min: 0, max: '', unit: 'mm or %'}),
  };

  S.seam_slope_type = {
    title: 'Scarf joint seam',
    explain: () => `<p>A different way to join the start and end of a loop. Instead of meeting edge to edge, the loop starts thin and gets thicker over a few centimetres, and when it comes back around its end gets thinner over the same stretch, sliding on top. The two halves overlap like a woodworker's scarf joint.</p>
      <p>The seam becomes nearly invisible and stronger, because there is no single spot where everything starts and stops. It works best on smooth, round walls; on sharp corners the ordinary seam already hides well.</p>`,
    picture: (ctx, v) => scarf(v === 'none' ? 0 : num(ctx.values.seam_slope_min_length) || 20, (num(ctx.values.seam_slope_start_height) || 0) / 100, num(ctx.values.seam_slope_steps) || 10),
    effects: (ctx, v) => v === 'none' ? [['Looks', 'An ordinary seam: a thin line of dots or bumps.'], ['Strength', 'Normal.']] :
      [['Looks', v === 'all' ? 'Near-invisible seams on the outside and inside of holes.' : 'Near-invisible seams on the outside; holes keep normal seams.'],
       ['Strength', 'The overlap makes the join stronger.'], ['Time', 'A little slower: the scarf is printed slowly.'],
       ['Risk', 'Needs well-tuned flow and pressure advance, or the ramp shows as a smudge. Still marked beta.']],
    notes: {none: 'An ordinary seam.', external: 'Scarf on the outside walls.', all: 'Scarf on the outside and in holes.'},
  };

  S.seam_slope_conditional = {
    title: 'Conditional scarf joint',
    explain: () => `<p>Uses the scarf joint only where it helps: on smooth, rounded loops. Loops with a sharp corner keep the ordinary seam, hidden in that corner, which already looks good and prints faster.</p>
      <p>The two thresholds that follow decide what counts as smooth.</p>`,
    effects: (ctx, v) => on(v) ? [['Looks', 'Scarf on round walls, ordinary seams tucked in corners: the best of both.'], ['Time', 'Faster than scarfing every loop.']] :
      [['Looks', 'Every loop gets a scarf, including ones with corners where it\'s not needed.'], ['Time', 'A little slower.']],
    notes: ON('Only on smooth loops.', 'On every loop.'),
  };

  S.scarf_angle_threshold = {
    title: 'Conditional angle threshold',
    explain: () => `<p>How sharp a corner must be to count as "a good place to hide an ordinary seam". The angle is measured inside the corner: 180° is a straight line, 90° is a square corner.</p>
      <p>If every corner of a loop is gentler (more open) than this angle, the loop is "smooth" and gets a scarf. Lower values call more loops smooth.</p>`,
    effects: (ctx, v) => { const a = num(v); return [['Which loops', a >= 170 ? 'Only almost perfectly round loops get a scarf.' : a >= 140 ? `Loops whose corners are all gentler than ${a}° get a scarf; squares and hexagons keep ordinary seams.` : 'Even loops with noticeable corners get a scarf.']]; },
    choices: () => [{value: '155', label: '155°', note: 'The default.'}, {value: '135', label: '135°', note: 'Octagons and softer shapes too.'}, {value: '170', label: '170°', note: 'Only truly round loops.'}],
  };

  S.scarf_overhang_threshold = {
    title: 'Conditional overhang threshold',
    explain: () => `<p>A scarf doesn't print well over thin air, because the thin start of the ramp has nothing to sit on. This skips the scarf on loops that overhang by more than this share of the outer wall's width.</p>`,
    effects: (ctx, v) => [['Which loops', num(v) <= 20 ? 'Only loops with almost no overhang get a scarf.' : num(v) <= 50 ? 'Loops with a mild overhang still get a scarf.' : 'Scarfs even on clear overhangs, where they can droop.']],
    choices: () => [{value: '40%', label: '40%', note: 'The default.'}, {value: '20%', label: '20%', note: 'Safer on overhangs.'}, {value: '60%', label: '60%', note: 'More scarfs.'}],
  };

  S.scarf_joint_speed = {
    title: 'Scarf joint speed',
    explain: () => `<p>How fast the scarf part of the loop is printed. Because the ramp changes how much plastic comes out from moment to moment, it comes out cleanest when printed slowly. As a %, it is a share of the wall's own speed; it never goes faster than the wall.</p>`,
    effects: (ctx, v) => { const pctv = G.isPercent(v), s = num(v); return [['Looks', (pctv ? s <= 60 : s <= 60) ? 'Slow and even: the cleanest scarf.' : 'Faster: the ramp can show as a smudge if pressure advance isn\'t tuned.'], ['Time', 'Only the few centimetres of scarf on each loop are affected.']]; },
    choices: () => [{value: '100%', label: 'Wall speed', note: 'The default.'}, {value: '50%', label: 'Half', note: 'Cleaner scarfs.'}, {value: '30', label: '30 mm/s', note: 'Slow and safe.'}],
    exact: () => ({min: 1, max: '', unit: 'mm/s or %'}),
  };

  S.seam_slope_start_height = {
    title: 'Scarf start height',
    explain: () => `<p>How thick the very beginning of the scarf ramp is. 0 means it starts from nothing and grows; a higher value starts the ramp partway up. As a %, it is a share of the layer height.</p>
      <p>Starting from 0 gives the smoothest join; starting higher helps when the thin tip doesn't stick or comes out patchy.</p>`,
    picture: (ctx, v) => scarf(num(ctx.values.seam_slope_min_length) || 20, (G.isPercent(v) ? num(v) / 100 : num(v) / (num(ctx.values.layer_height) || 0.2)), num(ctx.values.seam_slope_steps) || 10),
    effects: (ctx, v) => [['Looks', num(v) === 0 ? 'The smoothest ramp.' : 'A short step at the scarf\'s start, but a more reliable thin end.']],
    choices: () => [{value: '0', label: 'From nothing', note: 'Smoothest.'}, {value: '20%', label: '20%', note: 'A little start step.'}, {value: '50%', label: '50%', note: 'Half height.'}],
    exact: () => ({min: 0, max: '', unit: 'mm or %'}),
  };

  S.seam_slope_entire_loop = {
    title: 'Scarf around entire wall',
    explain: () => `<p>Makes the ramp as long as the whole loop, so the wall climbs smoothly all the way round instead of over a short stretch. There's no seam spot at all, a bit like vase mode.</p>`,
    effects: (ctx, v) => on(v) ? [['Looks', 'No seam spot anywhere on the loop.'], ['Risk', 'The whole loop is printed thin-to-thick: any flow error shows all the way round.'], ['Time', 'The whole wall is printed at scarf speed.']] :
      [['Looks', 'The scarf covers only its set length.']],
    notes: ON('The whole loop is one ramp.', 'Only a set length is ramped.'),
  };

  S.seam_slope_min_length = {
    title: 'Scarf length',
    explain: () => `<p>How long the ramp is along the wall. A longer ramp spreads the join over more of the wall, so it is gentler and harder to see; a short one is closer to a normal seam. 0 turns the scarf off.</p>`,
    picture: (ctx, v) => scarf(num(v), (num(ctx.values.seam_slope_start_height) || 0) / 100, num(ctx.values.seam_slope_steps) || 10),
    effects: (ctx, v) => { const l = num(v); return [['Looks', l === 0 ? 'Off: a normal seam.' : l < 10 ? 'A short scarf: better than a plain seam, still a little visible.' : l <= 30 ? 'A good length for most parts.' : 'Very gentle, but on small parts it may cover the whole loop.']]; },
    choices: () => [{value: '10', label: '10 mm', note: 'Short.'}, {value: '20', label: '20 mm', note: 'The default.'}, {value: '30', label: '30 mm', note: 'Gentler.'}],
  };

  S.seam_slope_steps = {
    title: 'Scarf steps',
    explain: () => `<p>The ramp is made of small flat steps. More steps make a smoother slope; fewer make a coarser staircase. The cost is a bit more G-code, not print time.</p>`,
    picture: (ctx, v) => scarf(num(ctx.values.seam_slope_min_length) || 20, (num(ctx.values.seam_slope_start_height) || 0) / 100, num(v)),
    effects: (ctx, v) => [['Looks', num(v) >= 10 ? 'A smooth ramp.' : 'Visible steps in the ramp can show as small ripples at the seam.']],
    choices: () => [{value: '5', label: '5', note: 'Coarse.'}, {value: '10', label: '10', note: 'The default.'}, {value: '20', label: '20', note: 'Smoothest.'}],
  };

  S.scarf_joint_flow_ratio = {
    title: 'Scarf joint flow ratio',
    explain: () => `<p>Extra or less plastic in the scarf, as a multiplier: 1 is normal. If the scarf comes out as a raised ridge, lower it a little; if it leaves a groove, raise it.</p>`,
    effects: (ctx, v) => { const f = num(v); return [['Looks', f > 1.05 ? 'More plastic: can leave a ridge at the scarf.' : f < 0.95 ? 'Less plastic: can leave a shallow groove.' : 'Normal.']]; },
    choices: () => [{value: '0.95', label: '0.95', note: 'If you see a ridge.'}, {value: '1', label: '1', note: 'Normal.'}, {value: '1.05', label: '1.05', note: 'If you see a groove.'}],
  };

  S.seam_slope_inner_walls = {
    title: 'Scarf joint for inner walls',
    explain: () => `<p>Uses the scarf on the hidden inner walls too. They aren't seen, but their seam can push a slight bump through to the outside on thin walls, and the scarf makes them stronger.</p>`,
    effects: (ctx, v) => on(v) ? [['Strength', 'Stronger inner seams.'], ['Time', 'A little slower.']] : [['Time', 'Inner walls print at full speed with ordinary seams.']],
    notes: ON('Inner walls get a scarf too.', 'Only the outer wall.'),
  };

  S.role_based_wipe_speed = {
    title: 'Role based wipe speed',
    explain: () => `<p>After a line ends, the nozzle can "wipe": it keeps moving a short way along the line without pushing plastic, to smear off the drip at its tip. This decides how fast it wipes.</p>
      <p>On, it wipes at the speed of the line it just printed, so a slow outer wall gets a slow, gentle wipe. Off, it always uses the Wipe speed below.</p>`,
    effects: (ctx, v) => on(v) ? [['Looks', 'Wipes match the line: gentle on the outer wall, where it matters.']] : [['Looks', 'Every wipe at one speed, which may be faster than a slow outer wall.']],
    notes: ON('Wipe at the line\'s speed.', 'Wipe at a fixed speed.'),
  };

  S.wipe_speed = {
    title: 'Wipe speed',
    explain: ctx => `<p>How fast the nozzle wipes when Role based wipe speed is off. As a %, it is a share of the travel speed${ctx.values.travel_speed ? ` (${ctx.values.travel_speed} mm/s)` : ''}.</p>
      <p>A fast wipe cleans the tip quickly; a slower wipe drags the drip more carefully but takes longer.</p>`,
    effects: (ctx, v) => [['Looks', 'Slower wipes leave fewer smudges on very visible surfaces.'], ['Time', 'Wipes are short, so this barely changes the print time.']],
    choices: () => [{value: '80%', label: '80% of travel', note: 'The default.'}, {value: '50%', label: '50%', note: 'Gentler.'}],
    exact: () => ({min: 0, max: '', unit: 'mm/s or %'}),
  };

  S.wipe_on_loops = {
    title: 'Wipe on loops',
    explain: () => `<p>When a loop finishes, the nozzle makes a small move inwards, into the part, before lifting away. Any drip is left inside instead of on the visible surface, and the seam point is pressed down.</p>`,
    picture: (ctx, v) => loopTop(length(ctx.values.seam_gap || '10%', ctx.nozzle), ctx.nozzle, {wipe: on(v), caption: on(v) ? 'The dashed line is the inward wipe: the drip goes inside.' : 'The nozzle lifts straight off at the loop\'s end.'}),
    effects: (ctx, v) => on(v) ? [['Looks', 'A cleaner, flatter seam.'], ['Time', 'A tiny move per loop.']] : [['Looks', 'The drip can leave a small blob at the seam.']],
    notes: ON('A small inward move at the seam.', 'Lift straight off.'),
  };

  S.wipe_inward = {
    title: 'Wipe inward',
    explain: () => `<p>A refinement of the wipe for the outer wall: instead of wiping back along the freshly printed outer line (and reheating it), the nozzle moves towards the inner walls that are already printed. This avoids a shiny or dented mark where the hot nozzle passed over the outside.</p>
      <p>It matters most at very fine layer heights (below 0.1 mm), where wipe marks are easiest to see.</p>`,
    effects: (ctx, v) => on(v) ? [['Looks', 'Fewer wipe marks on the outer surface.'], ['Note', 'Falls back to the normal wipe where there is no inner wall next to it.']] : [['Looks', 'The normal wipe, along the outer line.']],
    notes: ON('Wipe towards the inside.', 'Wipe along the line.'),
  };

  S.wipe_inward_distance = {
    title: 'Wipe inward distance',
    explain: () => `<p>How far inwards the inward wipe moves, in mm or as a % of the outer wall's width. 50% moves it half a line in; more than 100% does nothing extra.</p>`,
    effects: (ctx, v) => [['Looks', num(v) === 0 ? 'No offset: the same as a normal wipe.' : num(v) < 40 ? 'A small offset: the nozzle still brushes the outer line.' : 'Clear of the outer line.']],
    choices: () => [{value: '50%', label: '50%', note: 'The default.'}, {value: '100%', label: '100%', note: 'Fully clear.'}],
    exact: () => ({min: 0, max: 100, unit: 'mm or %'}),
  };

  S.wipe_before_external_loop = {
    title: 'Wipe before external loop',
    explain: () => `<p>When the outer wall is printed straight after a retraction, the first moment of pushing plastic again can leave a blob at its start. On, the printer does that first push slightly inside the part, so any blob is hidden.</p>
      <p>It helps most when walls print Outer/Inner or Inner/Outer/Inner, because then the outer loop often comes first.</p>`,
    effects: (ctx, v) => on(v) ? [['Looks', 'Cleaner starts on the outer wall.']] : [['Looks', 'A small blob is possible where the outer wall starts.']],
    notes: ON('Restart inside the part.', 'Restart on the outer wall.'),
  };
})();
