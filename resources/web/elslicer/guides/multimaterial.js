// Settings guide: the Multimaterial tab.
(() => {
  const {C, num, on, round, mm, svg, text, rect, line, warn} = G;
  const S = window.SETTINGS;
  const count = ctx => Array.isArray(ctx.filaments) ? ctx.filaments.length : num(ctx.filaments) || 0;
  const filamentChoices = (ctx, zero) => {
    const list = [{value: '0', label: 'Default', note: zero}];
    for (let i = 1; i <= count(ctx); ++i) {
      const f = Array.isArray(ctx.filaments) ? ctx.filaments[i - 1] : null;
      list.push({value: String(i), label: `Filament ${i}`, note: (f && (f.name || f.type)) || ''});
    }
    return list;
  };

  // The prime tower next to the part, from above.
  function tower(ctx, o = {}) {
    const width = num(o.width ?? ctx.values.prime_tower_width) || 35, s = 3;
    let body = text(20, 24, 'The bed from above: your part, and the prime tower that cleans the nozzle at each colour change');
    body += rect(40, 40, 680, 250, C.bed, {rx: 8});
    const t = G.tallest(ctx), pw = Math.min(260, (t ? t.width : 40) * s), pd = Math.min(200, (t ? t.depth : 40) * s);
    body += rect(140, 165 - pd / 2, pw, pd, C.plastic, {rx: 6}) + text(140 + pw / 2, 170, t ? t.name : 'part', {anchor: 'middle', fill: C.text});
    const tw = Math.min(200, width * s);
    const shape = o.wall || ctx.values.wipe_tower_wall_type || 'rib';
    const tx = 680 - tw, ty = 165 - tw / 2;
    if (shape === 'cone') body += `<circle cx="${tx + tw / 2}" cy="${ty + tw / 2}" r="${tw * 0.75}" fill="${C.warm}" opacity="0.2"/>`;
    body += rect(tx, ty, tw, tw, C.warm, {rx: 3, opacity: 0.85});
    if (shape === 'rib') for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) body += rect(tx + tw / 2 - 4 + dx * tw * 0.62, ty + tw / 2 - 4 + dy * tw * 0.62, 8, 8, C.warm);
    body += text(tx + tw / 2, ty + tw + 34, `prime tower ${round(width, 0)} mm`, {anchor: 'middle', size: 12});
    return svg(760, 310, body, o.caption);
  }

  window.SECTIONS['Prime tower'] = {
    intro: ctx => `<p>With several filaments, the printer switches colour by unloading one and loading the next. The nozzle is still full of the old colour, so it has to push some plastic out before printing the new one cleanly. The <b>prime tower</b> is a small block beside your part where that happens: each colour change, the nozzle prints a layer of it to flush out the old colour and get the flow steady.</p>
      <p>It also gives the printer somewhere to wipe off drips. Without a tower, the start of each new colour can be smeared or patchy.${count(ctx) > 1 ? ` You have ${count(ctx)} filaments in this project.` : ''}</p>`,
  };
  S.enable_prime_tower = {
    title: 'Enable',
    explain: () => `<p>Prints a prime tower when the print uses more than one filament.</p>`,
    picture: (ctx, v) => on(v) ? tower(ctx) : svg(760, 80, text(20, 44, 'No tower: colour changes happen straight on the part.')),
    effects: (ctx, v) => on(v) ? [['Looks', 'Clean colour changes.'], ['Time and plastic', 'The tower adds both; how much depends on the prime volume.']] : [['Looks', warn('Colours may smear into each other where they change.')]],
    notes: {'1': 'Clean colour changes.', '0': 'No tower.'},
  };
  S.prime_tower_skip_points = {title: 'Skip points', explain: () => `<p>The tower's wall skips the spots where wiping starts, so the blob left there doesn't build up on the wall.</p>`, notes: {'1': 'Cleaner tower.', '0': 'Solid wall.'}};
  S.enable_tower_interface_features = {title: 'Tower interface features', explain: () => `<p>Uses special handling on the tower where two different materials meet (for example PLA and PETG), so they bond better.</p>`, notes: {'1': 'On.', '0': 'Off.'}};
  S.enable_tower_interface_cooldown_during_tower = {title: 'Cool down during tower', explain: () => `<p>When the nozzle has been heated extra for an interface layer, lets it cool back to normal while printing the tower, instead of on the part.</p>`, notes: {'1': 'On.', '0': 'Off.'}};
  S.prime_tower_enable_framework = {title: 'Internal ribs', explain: () => `<p>Adds ribs inside the tower to make it stiffer, so tall towers don't wobble or get knocked over.</p>`, notes: {'1': 'Stiffer tower.', '0': 'Off.'}};
  S.prime_tower_width = {
    title: 'Width',
    explain: () => `<p>How wide the tower is. A wider tower is more stable and spreads each flush over more area, so it can be shorter. A narrower tower takes less room on the bed but gets tall and wobbly with a lot of flushing.</p>`,
    picture: (ctx, v) => tower(ctx, {width: v}),
    effects: (ctx, v) => [['Stability', num(v) < 25 ? 'A thin tower can wobble or be knocked over when tall.' : 'Stable.'], ['Bed space', `Takes about ${round(num(v), 0)} × ${round(num(v), 0)} mm.`]],
    choices: () => [{value: '35', label: '35 mm', note: ''}, {value: '50', label: '50 mm', note: ''}, {value: '60', label: '60 mm', note: 'Default.'}],
  };
  S.belt_purge_tower_width = {title: 'Belt purge tower width', explain: () => `<p>Belt printers only: the width of the purge block across the belt.</p>`};
  S.prime_volume = {
    title: 'Prime volume',
    explain: () => `<p>How much plastic (mm³) is pushed through on the tower at each change, on top of the flush. More gives a steadier start but a bigger tower.</p>`,
    choices: () => [{value: '45', label: '45 mm³', note: 'Default.'}, {value: '30', label: '30 mm³', note: 'Smaller tower.'}],
  };
  S.prime_tower_brim_width = {title: 'Brim width', explain: () => `<p>A brim around the tower's base so it doesn't come loose. -1 picks a width from the tower's height.</p>`, notes: {'-1': 'Automatic.'}};
  S.prime_tower_infill_gap = {title: 'Infill gap', explain: () => `<p>How far apart the tower's inner lines are on layers with little flushing. Wider saves plastic.</p>`};
  S.wipe_tower_rotation_angle = {title: 'Rotation angle', explain: () => `<p>Turns the tower on the bed.</p>`};
  S.wipe_tower_bridging = {title: 'Maximal bridging distance', explain: () => `<p>The longest stretch the tower's sparse layers may bridge across.</p>`};
  S.wipe_tower_extra_spacing = {title: 'Purge lines spacing', explain: () => `<p>Spreads the tower's flushing lines further apart. Combined with extra flow it makes a sturdier tower.</p>`};
  S.wipe_tower_extra_flow = {title: 'Extra flow for purging', explain: () => `<p>Makes flushing lines thicker, so the same flush fits in less tower.</p>`};
  S.wipe_tower_max_purge_speed = {
    title: 'Maximum tower print speed',
    explain: () => `<p>The fastest the tower is printed. Faster saves time but the nozzle hits any blobs harder and the tower may wobble.</p>`,
    choices: () => [{value: '90', label: '90 mm/s', note: 'Default.'}, {value: '60', label: '60 mm/s', note: 'Safer.'}],
  };
  S.wipe_tower_wall_type = {
    title: 'Wall type',
    explain: () => `<p>The outer shape of the tower. <b>Rectangle</b> is a plain block. <b>Cone</b> widens at the base so tall towers stand firmly. <b>Rib</b> adds four fins for stiffness (the default).</p>`,
    picture: (ctx, v) => tower(ctx, {wall: v}),
    notes: {rectangle: 'A plain block.', cone: 'Wide base.', rib: 'Four stiffening fins.'},
  };
  S.wipe_tower_cone_angle = {title: 'Stabilization cone angle', explain: () => `<p>How wide the cone base is: larger angles give a wider, steadier base.</p>`};
  S.wipe_tower_extra_rib_length = {title: 'Extra rib length', explain: () => `<p>Makes the ribs longer (+) or shorter (-).</p>`};
  S.wipe_tower_rib_width = {title: 'Rib width', explain: () => `<p>How thick the ribs are.</p>`};
  S.wipe_tower_fillet_wall = {title: 'Fillet wall', explain: () => `<p>Rounds the tower's corners.</p>`, notes: {'1': 'Rounded.', '0': 'Square.'}};
  S.wipe_tower_no_sparse_layers = {
    title: 'No sparse layers',
    explain: () => `<p>Skips the tower on layers without a colour change. Saves plastic and time, but the nozzle must drop down onto a lower tower, which can collide with the part on some layouts. Beta.</p>`,
    notes: {'1': 'Skip empty tower layers.', '0': 'Tower on every layer.'},
  };
  S.wipe_tower_sparse_layers_combination = {
    title: 'Combine sparse layers',
    explain: () => `<p>Prints several tower layers without colour changes as one thicker layer, to save time. Only works when layers are thin enough to combine.</p>`,
    notes: {'1': 'Combine.', '0': 'Every layer.'},
  };
  S.single_extruder_multi_material_priming = {title: 'Prime all printing extruders', explain: () => `<p>Primes every filament with a line at the front of the bed at the start.</p>`, notes: {'1': 'Prime all.', '0': 'Only the first.'}};

  window.SECTIONS['Filament for Features'] = {
    intro: () => `<p>Prints different parts of each object in different filaments, regardless of the object's own colour. For example, a cheap or strong filament for the hidden infill and a nice one for the outside, or a different colour on the top face.</p>`,
  };
  const feature = (key, what) => S[key] = {
    title: what[0].toUpperCase() + what.slice(1),
    explain: () => `<p>The filament for ${what}. Default uses the object's own filament.</p>`,
    effects: (ctx, v) => [['Note', num(v) === 0 ? 'The object\'s own filament.' : 'Each layer needs extra colour changes for this, which adds time and flush.']],
    choices: ctx => filamentChoices(ctx, 'The object\'s filament.'),
  };
  feature('outer_wall_filament_id', 'outer walls');
  feature('inner_wall_filament_id', 'inner walls');
  feature('sparse_infill_filament_id', 'infill');
  feature('internal_solid_filament_id', 'internal solid infill');
  feature('top_surface_filament_id', 'top surface');
  feature('bottom_surface_filament_id', 'bottom surface');
  S.wipe_tower_filament = {
    title: 'Wipe tower',
    explain: () => `<p>The filament for the tower's outer wall. Default picks any available (non-soluble preferred).</p>`,
    choices: ctx => filamentChoices(ctx, 'Any available.'),
  };

  window.SECTIONS['Ooze prevention'] = {
    intro: () => `<p>For printers with several nozzles: a nozzle that is waiting, still hot, slowly drips. These settings cool the waiting nozzles a little and reheat them just in time.</p>`,
  };
  S.ooze_prevention = {title: 'Enable', explain: () => `<p>Lowers the temperature of nozzles that aren't printing, so they drip less.</p>`, notes: {'1': 'Cool waiting nozzles.', '0': 'Off.'}};
  S.standby_temperature_delta = {title: 'Temperature variation', explain: () => `<p>How much cooler a waiting nozzle is kept (a negative number). Ignored when the filament sets an idle temperature.</p>`, choices: () => [{value: '-5', label: '-5 °C', note: 'Default.'}, {value: '-20', label: '-20 °C', note: 'Less drip.'}]};
  S.preheat_time = {title: 'Preheat time', explain: () => `<p>How many seconds before a nozzle is needed it starts heating back up, so you don't wait at each change.</p>`};
  S.preheat_steps = {title: 'Preheat steps', explain: () => `<p>Only for the Prusa XL; leave at 1.</p>`};

  window.SECTIONS['Flush options'] = {
    intro: () => `<p>Instead of flushing the old colour into the prime tower, some of it can go into places nobody sees: the infill, the support, or a spare object. Less waste and a smaller tower. These only work with the prime tower on.</p>`,
  };
  S.flush_into_infill = {title: 'Flush into objects\' infill', explain: () => `<p>Flushes inside the infill. The infill gets mixed colours, which shows only through translucent walls.</p>`, notes: {'1': 'Less waste.', '0': 'Tower only.'}};
  S.flush_into_objects = {title: 'Flush into this object', explain: () => `<p>Uses this whole object as a flush target. Its colours will be mixed: good for a throwaway or hidden part.</p>`, notes: {'1': 'Mix colours into this object.', '0': 'Off.'}};
  S.flush_into_support = {title: 'Flush into objects\' support', explain: () => `<p>Flushes into supports, which are thrown away anyway.</p>`, notes: {'1': 'Recommended.', '0': 'Tower only.'}};

  window.SECTIONS['Multimaterial/Advanced'] = {
    intro: () => `<p>How different filaments join inside a part, and the order of colour changes on each layer. Two different materials, like PLA and TPU, barely stick to each other; interlocking makes them grip mechanically.</p>`,
  };
  S.interlocking_beam = {
    title: 'Use beam interlocking',
    explain: () => `<p>Where two filaments meet, builds small interlocking beams that reach into each other, like fingers, so the materials hold together mechanically. Essential when combining materials that don't stick, like PLA and TPU.</p>`,
    effects: (ctx, v) => on(v) ? [['Strength', 'Different materials hold together firmly.']] : [['Strength', 'The materials only touch; different ones may come apart.']],
    notes: {'1': 'Interlock filaments.', '0': 'Plain contact.'},
  };
  S.toolchange_ordering = {
    title: 'Toolchange ordering',
    explain: () => `<p>The order of colours on each layer. <b>Default</b> starts with the last colour used, saving one change per layer. <b>Cyclic</b> always uses the same order, which gives each colour more time to cool.</p>`,
    notes: {default: 'Fewest changes.', cyclic: 'Same order every layer.'},
  };
  S.toolchange_cyclic_order = {title: 'Cyclic order', explain: () => `<p>The fixed order for cyclic changes, like "3,2,1,4". Empty uses 1, 2, 3…</p>`};
  S.toolchange_cyclic_first_layer = {title: 'Apply cyclic order to first layer', explain: () => `<p>Also uses the cyclic order on the first layer. Normally the first layer is ordered so small, fragile pieces print last and aren't knocked loose.</p>`, notes: {'1': 'Same order on layer 1.', '0': 'Layer 1 ordered for grip.'}};
  S.interface_shells = {title: 'Interface shells', explain: () => `<p>Builds solid walls where two materials or volumes meet. Useful with translucent filaments or soluble support.</p>`, notes: {'1': 'Solid boundaries.', '0': 'Off.'}};
  S.mmu_segmented_region_max_width = {title: 'Maximum width of a segmented region', explain: () => `<p>Limits how deep painted colours go into the part. 0 lets them go all the way through.</p>`};
  S.mmu_segmented_region_interlocking_depth = {title: 'Interlocking depth of a segmented region', explain: () => `<p>On every other layer, limits painted regions to this depth, so neighbouring colours interlock. Ignored with beam interlocking. 0 is off.</p>`};
  S.interlocking_beam_width = {title: 'Interlocking beam width', explain: () => `<p>How wide the interlocking beams are.</p>`};
  S.interlocking_orientation = {title: 'Interlocking direction', explain: () => `<p>The angle of the beams.</p>`};
  S.interlocking_beam_layer_count = {title: 'Interlocking beam layers', explain: () => `<p>How many layers tall each beam is. Fewer is stronger but more prone to defects.</p>`};
  S.interlocking_depth = {title: 'Interlocking depth', explain: () => `<p>How far from the boundary the beams reach, in cells. Too few gives a weak grip.</p>`};
  S.interlocking_boundary_avoidance = {title: 'Interlocking boundary avoidance', explain: () => `<p>Keeps beams this many cells away from the outside, so they don't show.</p>`};
})();
