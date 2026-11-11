// Settings guide: the Others tab.
(() => {
  const {C, num, on, round, mm, svg, text, rect, line, warn} = G;
  const S = window.SETTINGS;

  // The part from above with a skirt or a brim around it.
  function around(ctx, o = {}) {
    const cx = 380, cy = 160, r = 70;
    let body = text(20, 24, o.title || 'The part from above on the first layer');
    body += rect(40, 40, 680, 245, C.bed, {rx: 8});
    if (o.brim > 0) for (let i = 0; i < Math.min(14, Math.round(o.brim / 0.45)); ++i) body += `<rect x="${cx - r - (o.gap || 0) * 8 - i * 5}" y="${cy - r - (o.gap || 0) * 8 - i * 5}" width="${2 * r + 2 * (o.gap || 0) * 8 + i * 10}" height="${2 * r + 2 * (o.gap || 0) * 8 + i * 10}" fill="none" stroke="${C.accent2}" stroke-width="3" rx="10"/>`;
    if (o.ears) for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) body += `<circle cx="${cx + dx * r}" cy="${cy + dy * r}" r="26" fill="none" stroke="${C.accent2}" stroke-width="10" stroke-dasharray="3 2"/>`;
    body += rect(cx - r, cy - r, 2 * r, 2 * r, C.plastic, {rx: 8});
    for (let i = 0; i < (o.skirt || 0); ++i) { const d = r + 16 + (o.distance || 2) * 6 + i * 5 + (o.brim || 0) * 5; body += `<rect x="${cx - d}" y="${cy - d}" width="${2 * d}" height="${2 * d}" fill="none" stroke="${C.warm}" stroke-width="3" rx="16"/>`; }
    return svg(760, 300, body, o.caption);
  }

  window.SECTIONS['Skirt'] = {
    intro: () => `<p>A <b>skirt</b> is a loop or two printed around the part, a few millimetres away, at the very start. It doesn't touch the part. It gets the plastic flowing before the real print begins, and lets you check at a glance that the first layer is sticking and even.</p>`,
  };
  S.skirt_loops = {
    title: 'Skirt loops',
    explain: () => `<p>How many loops the skirt has. 0 turns it off. One or two are plenty to prime the nozzle.</p>`,
    picture: (ctx, v) => around(ctx, {skirt: num(v), distance: num(ctx.values.skirt_distance)}),
    effects: (ctx, v) => [['Start', num(v) === 0 ? 'No priming: the first lines of the part may come out thin.' : 'The nozzle is primed before the part starts.']],
    choices: () => [{value: '0', label: 'None', note: ''}, {value: '1', label: '1', note: 'Default.'}, {value: '2', label: '2', note: ''}],
  };
  S.skirt_type = {title: 'Skirt type', explain: () => `<p>One skirt around all parts together, or one around each part.</p>`, notes: {combined: 'One around everything.', perobject: 'One per part.'}};
  S.min_skirt_length = {title: 'Skirt minimum extrusion length', explain: () => `<p>Adds skirt loops until at least this much filament (mm) is pushed through. Useful on printers without a prime line. 0 is off.</p>`};
  S.skirt_distance = {
    title: 'Skirt distance',
    explain: () => `<p>How far the skirt is from the part (or its brim). Close enough to check the first layer, far enough not to stick to it.</p>`,
    picture: (ctx, v) => around(ctx, {skirt: num(ctx.values.skirt_loops) || 1, distance: num(v)}),
    choices: () => [{value: '2', label: '2 mm', note: 'Default.'}, {value: '5', label: '5 mm', note: ''}],
  };
  S.skirt_start_angle = {title: 'Skirt start point', explain: () => `<p>Where around the part the skirt starts, as an angle. 0 is the right side.</p>`};
  S.skirt_speed = {title: 'Skirt speed', explain: () => `<p>How fast the skirt is printed. 0 uses the first layer speed.</p>`};
  S.skirt_height = {title: 'Skirt height', explain: () => `<p>How many layers tall the skirt is. Usually 1.</p>`};
  S.draft_shield = {
    title: 'Draft shield',
    explain: () => `<p>Turns the skirt into a wall as tall as the part. It shields the part from drafts, which helps ABS and ASA not warp on printers without an enclosure.</p>`,
    notes: {disabled: 'A normal skirt.', enabled: 'A full-height wall.'},
  };
  S.single_loop_draft_shield = {title: 'Single loop after first layer', explain: () => `<p>Keeps the skirt or draft shield to one loop above the first layer, saving plastic; a single-loop shield can crack.</p>`, notes: {'1': 'One loop.', '0': 'All loops.'}};

  window.SECTIONS['Brim'] = {
    intro: () => `<p>A <b>brim</b> is a wide flat ring printed on the first layer, attached to the part's bottom edge. It works like the brim of a hat: more area gripping the bed, so corners don't lift and tall thin parts don't fall over. You trim it off afterwards.</p>`,
  };
  S.brim_type = {
    title: 'Brim type',
    explain: () => `<p><b>Auto</b> decides where a brim is needed. <b>Mouse ears</b> adds small discs only at sharp corners, where lifting starts, which are easier to remove. <b>Outer</b>, <b>inner</b> or both add the brim around the outside, inside holes, or both. <b>Painted</b> only where you paint it.</p>`,
    picture: (ctx, v) => around(ctx, {brim: v === 'no_brim' ? 0 : v === 'brim_ears' ? 0 : num(ctx.values.brim_width) || 5, ears: v === 'brim_ears'}),
    notes: {auto_brim: 'Where needed.', brim_ears: 'Discs at sharp corners.', painted: 'Where you paint.', outer_only: 'Around the outside.', inner_only: 'Inside holes.', outer_and_inner: 'Both.', no_brim: 'None.', leading_edge_only: 'Belt printers.'},
  };
  S.brim_width = {
    title: 'Brim width',
    explain: () => `<p>How far the brim reaches out from the part. Wider grips more but takes longer to trim.</p>`,
    picture: (ctx, v) => around(ctx, {brim: num(v), gap: num(ctx.values.brim_object_gap)}),
    effects: (ctx, v) => [['Grip', num(v) === 0 ? 'Automatic.' : num(v) < 4 ? 'A little extra grip.' : 'Strong grip for warp-prone or tall parts.'], ['Cleanup', num(v) > 8 ? 'More to trim.' : 'Easy to trim.']],
    choices: () => [{value: '0', label: 'Automatic', note: ''}, {value: '3', label: '3 mm', note: ''}, {value: '5', label: '5 mm', note: 'Common.'}, {value: '8', label: '8 mm', note: 'Warp-prone.'}],
  };
  S.leading_brim_length = {title: 'Leading brim length', explain: () => `<p>Belt printers only: extends the brim ahead of the part along the belt.</p>`};
  S.extra_brim_width = {title: 'Extra brim width', explain: () => `<p>Belt printers only: widens the brim sideways across the belt.</p>`};
  S.brim_object_gap = {
    title: 'Brim-object gap',
    explain: () => `<p>A small gap between the brim and the part. It makes the brim snap off cleanly without leaving a ridge on the part, but too big a gap and the brim stops holding.</p>`,
    choices: () => [{value: '0', label: '0', note: 'Strongest hold.'}, {value: '0.1', label: '0.1 mm', note: 'Clean removal.'}],
  };
  S.brim_flow_ratio = {title: 'Brim flow ratio', explain: () => `<p>More or less plastic in the brim, as a multiplier.</p>`};
  S.brim_use_efc_outline = {title: 'Brim follows compensated outline', explain: () => `<p>Attaches the brim to the first layer after elephant foot compensation has pulled it in. Only needed when that compensation is large.</p>`, notes: {'1': 'Follow the compensated edge.', '0': 'Follow the model.'}};
  S.combine_brims = {title: 'Combine brims', explain: () => `<p>Merges brims of nearby parts into one, which sticks better.</p>`, notes: {'1': 'Merge.', '0': 'Separate.'}};
  S.brim_ears_max_angle = {title: 'Brim ear max angle', explain: () => `<p>Corners sharper than this get a mouse ear. Higher values add ears to more corners.</p>`};
  S.brim_ears_detection_length = {title: 'Brim ear detection radius', explain: () => `<p>Ignores tiny wiggles in the outline when looking for corners.</p>`};
  S.brim_ears_outer_only = {title: 'Brim ears outer only', explain: () => `<p>Only adds ears on the outside, not inside holes.</p>`, notes: {'1': 'Outside only.', '0': 'Everywhere.'}};

  window.SECTIONS['Special mode'] = {
    intro: () => `<p>Settings that change how the whole print is done: one object at a time instead of all together, single-wall vase printing, and timelapse.</p>`,
  };
  S.slicing_mode = {title: 'Slicing mode', explain: () => `<p>How the model's shape is read. Regular suits nearly everything. Even-odd is for some airplane models; Close holes closes every hole.</p>`, notes: {regular: 'Normal.', even_odd: 'For 3DLabPrint models.', close_holes: 'Close all holes.'}};
  S.print_sequence = {
    title: 'Print sequence',
    explain: () => `<p><b>By layer</b> prints one layer of every object, then the next layer of every object. <b>By object</b> prints one whole object, then the next. By object means a failed print only ruins one part and leaves fewer strings between parts, but the print head must clear the finished parts, which limits how tall and close they can be.</p>`,
    notes: {'by layer': 'All objects together.', 'by object': 'One after another.'},
  };
  S.print_order = {title: 'Intra-layer order', explain: () => `<p>The order the nozzle visits objects within a layer. Default finds a short path. "As object list" follows your list.</p>`, notes: {default: 'Short path.', as_obj_list: 'Your list order.', best_of: 'Shortest of all.', snake: 'Back and forth.'}};
  S.spiral_mode = {
    title: 'Spiral vase',
    explain: () => `<p>Prints the part as a single wall that climbs in one continuous spiral, with a solid bottom and no top. There is no seam at all, and it is very fast. Perfect for vases, lampshades and cups; but the part is hollow and only one wall thick.</p>`,
    effects: (ctx, v) => on(v) ? [['Looks', 'No seam, a smooth continuous surface.'], ['Strength', warn('One wall, hollow, no top: fragile.')], ['Time', 'Very fast.']] : [['Mode', 'Normal printing.']],
    notes: {'1': 'Single-wall spiral.', '0': 'Normal.'},
  };
  S.spiral_mode_smooth = {title: 'Smooth spiral', explain: () => `<p>Also smooths the sideways movement of the spiral, so even leaning walls show no seam.</p>`, notes: {'1': 'On.', '0': 'Off.'}};
  S.spiral_mode_max_xy_smoothing = {title: 'Max XY smoothing', explain: () => `<p>How far points may move sideways to smooth the spiral.</p>`};
  S.spiral_starting_flow_ratio = {title: 'Spiral starting flow ratio', explain: () => `<p>Where the spiral starts, its flow ramps up from this value. Raise it if the start of the spiral comes out thin.</p>`};
  S.spiral_finishing_flow_ratio = {title: 'Spiral finishing flow ratio', explain: () => `<p>Where the spiral ends, its flow ramps down to this value. Raise it if the end comes out thin.</p>`};
  S.timelapse_type = {title: 'Timelapse', explain: () => `<p>For printers with a camera: takes a photo each layer for a timelapse video. Smooth mode moves the head aside for each photo, which needs a prime tower.</p>`, notes: {'0': 'Traditional.', '1': 'Smooth.'}};
  S.enable_wrapping_detection = {title: 'Enable clumping detection', explain: () => `<p>On supported printers, watches for plastic wrapping around the nozzle.</p>`, notes: {'1': 'On.', '0': 'Off.'}};

  // A wall seen from the side with the fuzzy texture.
  function fuzzy(ctx, thickness, distance, type, caption) {
    const x0 = 60, W = 640, y = 120, amp = Math.max(0, num(thickness) || 0) * 60, step = Math.max(4, (num(distance) || 0.3) * 30);
    let seed = 3;
    const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280 - 0.5;
    let d = `M${x0},${y}`;
    for (let x = 0; x <= W; x += step) d += ` L${x0 + x},${y + (type === 'ripple' ? Math.sin(x / step) * amp / 2 : rand() * amp)}`;
    let body = text(20, 24, 'The outer wall from above, enlarged: the nozzle wobbles in and out to make a texture');
    body += `<path d="${d} L${x0 + W},${y + 60} L${x0},${y + 60} Z" fill="${C.plastic}"/>`;
    body += line(x0, y, x0 + W, y, C.muted, {dash: '5 4'});
    return svg(760, 210, body, caption);
  }
  window.SECTIONS['Fuzzy skin'] = {
    intro: () => `<p><b>Fuzzy skin</b> makes the nozzle wobble in and out randomly while printing the walls, giving a rough, matte texture like felt or stone. It hides layer lines and fingerprints and gives a good grip; it is decorative and slows the walls down.</p>`,
  };
  S.fuzzy_skin = {
    title: 'Fuzzy skin',
    explain: () => `<p>Where the texture goes: only where you paint it, on the outside, inside holes, both, or on every wall.</p>`,
    picture: (ctx, v) => fuzzy(ctx, v === 'disabled_fuzzy' ? 0 : ctx.values.fuzzy_skin_thickness || 0.2, ctx.values.fuzzy_skin_point_distance, ctx.values.fuzzy_skin_noise_type),
    notes: {none: 'Painted areas only.', external: 'Outside walls.', hole: 'Inside holes.', all: 'Outside and holes.', allwalls: 'Every wall.', disabled_fuzzy: 'Off.'},
  };
  S.fuzzy_skin_mode = {title: 'Generator mode', explain: () => `<p>How the texture is made: by moving the nozzle sideways (Displacement), by varying the plastic (Extrusion), or both (Combined). Needs the Arachne wall generator.</p>`, notes: {displacement: 'Move sideways.', extrusion: 'Vary the plastic.', combined: 'Both.'}};
  S.fuzzy_skin_noise_type = {
    title: 'Noise type',
    explain: () => `<p>The character of the texture. <b>Classic</b> is random grain. <b>Perlin</b> and <b>Billow</b> are smoother and more natural. <b>Ridged</b> looks like marble, <b>Voronoi</b> like patchwork, and <b>Ripple</b> like a woven pattern.</p>`,
    picture: (ctx, v) => fuzzy(ctx, ctx.values.fuzzy_skin_thickness || 0.2, ctx.values.fuzzy_skin_point_distance, v),
    notes: {classic: 'Random grain.', perlin: 'Natural.', billow: 'Clumpy.', ridgedmulti: 'Marble.', voronoi: 'Patchwork.', ripple: 'Woven.'},
  };
  S.fuzzy_skin_point_distance = {
    title: 'Point distance',
    explain: () => `<p>How often the nozzle changes direction. Shorter gives a finer grain; longer gives bigger bumps.</p>`,
    picture: (ctx, v) => fuzzy(ctx, ctx.values.fuzzy_skin_thickness || 0.2, v, ctx.values.fuzzy_skin_noise_type),
    choices: () => [{value: '0.3', label: '0.3 mm', note: 'Default.'}, {value: '0.6', label: '0.6 mm', note: 'Coarser.'}],
  };
  S.fuzzy_skin_thickness = {
    title: 'Thickness',
    explain: ctx => `<p>How far the nozzle wobbles. Keep it below the outer wall's width, or holes can appear in the wall.</p>`,
    picture: (ctx, v) => fuzzy(ctx, v, ctx.values.fuzzy_skin_point_distance, ctx.values.fuzzy_skin_noise_type),
    effects: (ctx, v) => [['Looks', num(v) < 0.15 ? 'A subtle matte texture.' : num(v) <= 0.3 ? 'A clear rough texture.' : 'A heavy texture.'], ['Risk', num(v) > ctx.nozzle ? warn('Thicker than a wall line: holes are likely.') : 'None.']],
    choices: () => [{value: '0.1', label: '0.1 mm', note: 'Subtle.'}, {value: '0.2', label: '0.2 mm', note: 'Default.'}, {value: '0.3', label: '0.3 mm', note: 'Strong.'}],
  };
  S.fuzzy_skin_scale = {title: 'Feature size', explain: () => `<p>For the smooth noise types: how big each bump is.</p>`};
  S.fuzzy_skin_octaves = {title: 'Noise octaves', explain: () => `<p>How much fine detail is layered on the bumps.</p>`};
  S.fuzzy_skin_persistence = {title: 'Noise persistence', explain: () => `<p>How strong the fine detail is; lower is smoother.</p>`};
  S.fuzzy_skin_ripples_per_layer = {title: 'Ripples per layer', explain: () => `<p>For Ripple: how many waves go around each layer.</p>`};
  S.fuzzy_skin_ripple_offset = {title: 'Ripple offset', explain: () => `<p>For Ripple: shifts the waves each layer group. 50% alternates them, giving a woven look.</p>`};
  S.fuzzy_skin_layers_between_ripple_offset = {title: 'Layers between ripple offset', explain: () => `<p>How many layers share the same ripple before it shifts.</p>`};
  S.fuzzy_skin_first_layer = {title: 'Apply to first layer', explain: () => `<p>Also textures the first layer. Off keeps the bottom edge clean and helps the first layer stick.</p>`, notes: {'1': 'Texture layer 1.', '0': 'Clean first layer.'}};

  window.SECTIONS['G-code output'] = {
    intro: () => `<p>Options for the file sent to the printer: what goes into it and how it's named. They don't change how the print looks.</p>`,
  };
  S.reduce_infill_retraction = {title: 'Reduce infill retraction', explain: () => `<p>Skips retracting the filament when moving within the infill, where any ooze can't be seen. Saves time on complex parts.</p>`, notes: {'1': 'Fewer retractions.', '0': 'Retract always.'}};
  S.gcode_add_line_number = {title: 'Add line number', explain: () => `<p>Numbers each line of the file. Only some printers need it.</p>`, notes: {'1': 'Numbered.', '0': 'Off.'}};
  S.gcode_comments = {title: 'Verbose G-code', explain: () => `<p>Adds a comment explaining each line. Useful for checking the file; makes it bigger.</p>`, notes: {'1': 'Commented.', '0': 'Compact.'}};
  S.high_precision_gcode = {title: 'High precision G-code', explain: () => `<p>Writes positions with one more decimal place to reduce rounding. The file grows about 10%.</p>`, notes: {'1': 'More decimals.', '0': 'Normal.'}};
  S.gcode_label_objects = {title: 'Label objects', explain: () => `<p>Marks which moves belong to which object, so you can cancel one object mid-print on printers or software that support it.</p>`, notes: {'1': 'Labelled.', '0': 'Off.'}};
  S.exclude_object = {title: 'Exclude objects', explain: () => `<p>Adds Klipper's EXCLUDE_OBJECT commands, so you can skip a failed object during the print.</p>`, notes: {'1': 'On.', '0': 'Off.'}};
  S.exclude_object_tolerance = {title: 'Outline tolerance', explain: () => `<p>How simplified each object's outline is in those commands. Larger values help printers that stall reading many objects.</p>`};
  S.filename_format = {title: 'Filename format', explain: () => `<p>How exported files are named. Words in {braces} are filled in, like {input_filename_base} for the model name and {print_time} for the time.</p>`};
})();
