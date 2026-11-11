// Settings guide: the Support tab.
(() => {
  const {C, num, on, round, mm, svg, text, rect, line, warn} = G;
  const S = window.SETTINGS;
  const lh = ctx => num(ctx.values.layer_height) || 0.2;

  // A part with an overhang, held up by grid or tree supports, with the gap at the top.
  function supports(ctx, o = {}) {
    const style = o.style || 'grid', base = 240, topY = 110;
    let body = text(20, 24, o.title || 'A part with an overhang seen from the side, and the support under it');
    body += rect(40, base, 680, 10, C.bed);
    // The part: an upright with a shelf sticking out.
    body += `<polygon points="120,${base} 220,${base} 220,${topY} 560,${topY} 560,${topY - 40} 120,${topY - 40}" fill="${C.plastic}"/>`;
    const gap = Math.min(30, (o.gap ?? num(ctx.values.support_top_z_distance) ?? 0.2) * 60);
    const x1 = 240 + (o.xy ?? 0.35) * 30, x2 = 560;
    if (o.angleOnly) {
      body += `<path d="M220,${topY} L${220 + (base - topY) * Math.tan((90 - o.angle) * Math.PI / 180)},${base}" stroke="${C.warm}" stroke-dasharray="6 4" stroke-width="2"/>`;
    } else if (style.startsWith('tree') || style === 'organic') {
      const trunk = 420;
      body += `<path d="M${trunk},${base} C${trunk},${base - 60} ${trunk},${base - 70} ${trunk},${topY + gap + 40}" stroke="${C.warm}" stroke-width="${style === 'tree_strong' ? 20 : 12}" fill="none" opacity="0.85"/>`;
      for (const x of [x1 + 20, 340, 480, x2 - 20]) body += `<path d="M${trunk},${topY + gap + 45} Q${(trunk + x) / 2},${topY + gap + 30} ${x},${topY + gap}" stroke="${C.warm}" stroke-width="5" fill="none" opacity="0.85"/>`;
    } else {
      const spacing = (num(ctx.values.support_base_pattern_spacing) || 2.5) * 10;
      body += rect(x1, topY + gap, x2 - x1, base - topY - gap, 'none', {stroke: C.warm});
      for (let x = x1; x <= x2; x += spacing) body += line(x, topY + gap + 8, x, base, C.warm, {sw: 2});
      const n = o.interface ?? num(ctx.values.support_interface_top_layers) ?? 2;
      for (let i = 0; i < n; ++i) body += rect(x1, topY + gap + i * 5, x2 - x1, 4, C.warm);
    }
    if (gap > 0 && !o.angleOnly) body += text(570, topY + gap / 2 + 5, `${round(gap / 60, 2)} mm gap`, {size: 12, fill: C.text});
    body += text(380, base + 30, o.label || '', {anchor: 'middle', size: 12});
    return svg(760, 285, body, o.caption);
  }

  const filamentChoices = (ctx, zero) => {
    const count = Array.isArray(ctx.filaments) ? ctx.filaments.length : num(ctx.filaments) || 0;
    const list = [{value: '0', label: 'Default', note: zero}];
    for (let i = 1; i <= count; ++i) {
      const f = Array.isArray(ctx.filaments) ? ctx.filaments[i - 1] : null;
      list.push({value: String(i), label: `Filament ${i}`, note: (f && (f.name || f.type)) || ''});
    }
    return list;
  };

  window.SECTIONS['Support/Support'] = {
    intro: () => `<p>Plastic can't be printed on thin air. Where a part leans out more than about 45°, or has a ceiling or a shelf, it needs <b>supports</b>: temporary scaffolding printed underneath, which you break off afterwards.</p>
      <p>Supports cost time and plastic and leave marks where they touch, so the aim is just enough support in just the right places. Rotating a part to need fewer supports often beats any setting.</p>`,
  };
  S.enable_support = {
    title: 'Enable support',
    explain: ctx => `<p>Turns automatic supports on for overhangs. Without supports, steep overhangs and ceilings droop or fail; some prints will need them, others don't.</p>`,
    picture: (ctx, v) => on(v) ? supports(ctx, {style: ctx.values.support_type && ctx.values.support_type.startsWith('tree') ? 'tree' : 'grid'}) : supports(ctx, {angleOnly: true, angle: 45, title: 'Without supports, the shelf is printed over air', label: 'it will droop or fail'}),
    effects: (ctx, v) => on(v) ? [['Overhangs', 'Held up while they print.'], ['Time and plastic', 'More of both.'], ['Looks', 'Small marks where supports touch.']] : [['Overhangs', 'Only gentle overhangs and short bridges will print well.']],
    notes: {'1': 'Add supports.', '0': 'No supports.'},
  };
  S.support_type = {
    title: 'Type',
    explain: () => `<p><b>Normal</b> supports are blocks of straight walls under the overhang: sturdy, simple, good for big flat overhangs. <b>Tree</b> supports grow branches from a trunk to just the spots that need them: less plastic, fewer marks, easier to remove, good for figures and organic shapes.</p>
      <p><b>Auto</b> finds overhangs itself. <b>Manual</b> only supports where you've painted support enforcers.</p>`,
    picture: (ctx, v) => supports(ctx, {style: v.startsWith('tree') ? 'organic' : 'grid'}),
    effects: (ctx, v) => v.startsWith('tree') ? [['Removal', 'Easy; few contact points.'], ['Plastic', 'Less.'], ['Best for', 'Figures and curved shapes.']] : [['Removal', 'Larger contact areas, more work.'], ['Holding', 'Very stable under flat overhangs.'], ['Best for', 'Mechanical parts.']],
    notes: {'normal(auto)': 'Blocks, found automatically.', 'tree(auto)': 'Branches, found automatically.', 'normal(manual)': 'Blocks where you paint.', 'tree(manual)': 'Branches where you paint.'},
  };
  S.support_style = {
    title: 'Style',
    explain: () => `<p>The shape of the support. For normal supports, <b>Grid</b> is stable and <b>Snug</b> hugs the part closely, saving plastic. For tree supports, <b>Organic</b> merges branches smoothly (the default), <b>Slim</b> uses fewer, thinner branches, <b>Strong</b> uses thicker ones, and <b>Hybrid</b> adds normal support under large flat overhangs.</p>`,
    picture: (ctx, v) => supports(ctx, {style: v === 'default' ? (String(ctx.values.support_type).startsWith('tree') ? 'organic' : 'grid') : v}),
    notes: {default: 'Grid or organic, by type.', grid: 'Stable blocks.', snug: 'Close-fitting blocks.', organic: 'Smooth branches.', tree_slim: 'Few thin branches.', tree_strong: 'Thick branches.', tree_hybrid: 'Branches plus blocks.'},
  };
  S.support_threshold_angle = {
    title: 'Threshold angle',
    explain: () => `<p>How steep an overhang can be before it gets support, measured from flat: a surface leaning at less than this angle above horizontal is supported. 30° supports only fairly flat overhangs; 50° supports more. Most printers handle up to about 45° from vertical without help.</p>`,
    picture: (ctx, v) => supports(ctx, {angleOnly: true, angle: num(v), title: `Overhangs flatter than ${num(v)}° from horizontal get support (dashed line)`}),
    effects: (ctx, v) => { const a = num(v); return [['Support', a === 0 ? 'Uses the threshold overlap below instead.' : a < 25 ? 'Only very flat overhangs: less support, some may droop.' : a <= 40 ? 'A good balance.' : 'More support, more marks to clean.']]; },
    choices: () => [{value: '30', label: '30°', note: 'Default.'}, {value: '40', label: '40°', note: 'More support.'}, {value: '20', label: '20°', note: 'Less support.'}],
  };
  S.support_threshold_overlap = {
    title: 'Threshold overlap',
    explain: () => `<p>Used when the angle above is 0: supports an overhanging line when less than this share of it rests on the layer below.</p>`,
    choices: () => [{value: '50%', label: '50%', note: 'Default.'}],
    exact: () => ({min: 0, max: 100, unit: 'mm or %'}),
  };
  S.raft_first_layer_density = {
    title: 'First layer density',
    explain: () => `<p>How dense the first layer of the raft or support is, where it touches the bed. Denser grips better.</p>`,
    choices: () => [{value: '90%', label: '90%', note: 'Default.'}, {value: '100%', label: '100%', note: 'Best grip.'}],
  };
  S.raft_first_layer_expansion = {
    title: 'First layer expansion',
    explain: () => `<p>Widens the first layer of the raft or support so it grips the bed better and doesn't fall over.</p>`,
    choices: () => [{value: '2', label: '2 mm', note: 'Default.'}, {value: '4', label: '4 mm', note: 'Tall supports.'}],
  };
  S.support_on_build_plate_only = {
    title: 'On build plate only',
    explain: () => `<p>Only builds supports that start from the bed, never from the part itself. Supports standing on the part leave marks on its surface and are hard to remove; this prevents that, but some overhangs above the part go unsupported.</p>`,
    effects: (ctx, v) => on(v) ? [['Looks', 'No support marks on the part\'s upper surfaces.'], ['Risk', 'Overhangs above other parts of the model are left unsupported.']] : [['Support', 'Wherever needed, including on the part.']],
    notes: {'1': 'Only from the bed.', '0': 'Anywhere.'},
  };
  S.support_critical_regions_only = {
    title: 'Support critical regions only',
    explain: () => `<p>Supports only the spots that would certainly fail: sharp tips pointing down and overhangs sticking straight out. Gentle overhangs are left to print on their own.</p>`,
    notes: {'1': 'Only critical spots.', '0': 'All overhangs past the threshold.'},
  };
  S.support_remove_small_overhang = {
    title: 'Ignore small overhangs',
    explain: () => `<p>Skips support for tiny overhangs that will print fine on their own, saving supports you'd only have to pick off.</p>`,
    notes: {'1': 'Skip tiny overhangs.', '0': 'Support everything.'},
  };
  S.enforce_support_layers = {
    title: 'Enforce support for the first',
    explain: () => `<p>Forces support under every overhang in the first this many layers, whatever the angle, to give the base of the print a stable start.</p>`,
    choices: () => [{value: '0', label: 'Off', note: ''}, {value: '5', label: '5 layers', note: ''}],
  };

  window.SECTIONS['Raft'] = {
    intro: () => `<p>A <b>raft</b> is a thick, flat platform printed first, with the part printed on top. It gives the part a large, firm base: good for warp-prone materials like ABS, tiny contact areas, or uneven beds. You peel it off afterwards, and the part's underside comes out rougher.</p>`,
  };
  S.raft_layers = {
    title: 'Raft layers',
    explain: () => `<p>How many layers the raft has. 0 means no raft. 2-3 is a light raft; more layers make it stiffer and help warp-prone prints.</p>`,
    picture: (ctx, v) => {
      let body = text(20, 24, 'A part on a raft seen from the side');
      const n = Math.round(num(v)), base = 220;
      body += rect(40, base, 680, 10, C.bed);
      for (let i = 0; i < n; ++i) body += rect(180, base - (i + 1) * 12, 400, 11, C.warm, {opacity: 0.8});
      body += rect(220, base - n * 12 - 100 - 8, 320, 100, C.plastic, {rx: 4});
      return svg(760, 250, body, n ? `${n} raft layers, then a small gap, then the part.` : 'No raft: the part sits on the bed.');
    },
    effects: (ctx, v) => num(v) === 0 ? [['Raft', 'None.']] : [['Sticking', 'Excellent, even for warp-prone materials.'], ['Looks', 'The underside is rougher.'], ['Time and plastic', 'More.']],
    choices: () => [{value: '0', label: 'None', note: ''}, {value: '3', label: '3', note: 'Light raft.'}, {value: '5', label: '5', note: 'ABS and warp-prone.'}],
  };
  S.raft_contact_distance = {
    title: 'Raft contact Z distance',
    explain: () => `<p>The gap between the raft's top and the part. A bigger gap makes the raft peel off more easily but leaves a rougher underside.</p>`,
    choices: () => [{value: '0.1', label: '0.1 mm', note: 'Default.'}, {value: '0.2', label: '0.2 mm', note: 'Easier removal.'}],
  };
  S.raft_expansion = {
    title: 'Raft expansion',
    explain: () => `<p>How far the raft reaches beyond the part's outline on every side.</p>`,
    choices: () => [{value: '1.5', label: '1.5 mm', note: 'Default.'}, {value: '3', label: '3 mm', note: 'More grip.'}],
  };

  window.SECTIONS['Filament for Supports'] = {
    intro: () => `<p>With several filaments loaded, supports can be printed in a different one. A common trick is to print just the layers touching the part (the <b>interface</b>) in a material that doesn't stick to it, such as PETG under PLA, or a soluble support filament. The support then falls away almost cleanly.</p>`,
  };
  S.support_filament = {
    title: 'Support/raft base',
    explain: () => `<p>The filament for the bulk of the support and the raft. Default uses the part's own filament.</p>`,
    choices: ctx => filamentChoices(ctx, 'The part\'s filament.'),
  };
  S.support_interface_filament = {
    title: 'Support/raft interface',
    explain: () => `<p>The filament for the layers of support that touch the part. Using a different material here makes supports come off much more cleanly. Default uses the part's filament.</p>`,
    choices: ctx => filamentChoices(ctx, 'The part\'s filament.'),
  };
  S.support_interface_not_for_body = {
    title: 'Avoid interface filament for base',
    explain: () => `<p>Keeps the special interface filament for the interface only, so you don't use up an expensive or soluble filament on the whole support.</p>`,
    notes: {'1': 'Save the interface filament.', '0': 'May use it for the base too.'},
  };

  window.SECTIONS['Support ironing'] = {
    intro: () => `<p>Irons the top of the support, the surface the part's underside is printed on. A smoother support surface gives a smoother underside on the part.</p>`,
  };
  S.support_ironing = {title: 'Ironing support interface', explain: () => `<p>Turns support ironing on. The support interface is then printed solid, and ironed.</p>`, notes: {'1': 'Smoother undersides.', '0': 'Off.'}};
  S.support_ironing_pattern = {title: 'Support ironing pattern', explain: () => `<p>The ironing path: back and forth, or rings.</p>`, notes: {rectilinear: 'Back and forth.', concentric: 'Rings.'}};
  S.support_ironing_flow = {title: 'Support ironing flow', explain: () => `<p>How much plastic is pushed out while ironing the support, as a % of a normal layer.</p>`, choices: () => [{value: '10%', label: '10%', note: 'Default.'}]};
  S.support_ironing_spacing = {title: 'Support ironing line spacing', explain: () => `<p>How close the ironing passes are. Closer is smoother but slower.</p>`, choices: () => [{value: '0.1', label: '0.1 mm', note: 'Default.'}]};

  window.SECTIONS['Support/Advanced'] = {
    intro: () => `<p>How the support is built and how it meets the part: the gaps that let it break away, the dense layers that give the part a flat surface to sit on, and the pattern inside.</p>
      <p>The key trade-off: a bigger gap means easier removal but a droopier, rougher underside; a smaller gap means a cleaner underside but supports that weld on.</p>`,
  };
  S.support_top_z_distance = {
    title: 'Top Z distance',
    explain: ctx => `<p>The gap between the top of the support and the part above it. The part is printed onto this small air gap, which is what lets the support break away. One layer (${mm(lh(ctx))}) is usual. 0 is only for soluble support, which dissolves instead.</p>`,
    picture: (ctx, v) => supports(ctx, {gap: num(v)}),
    effects: (ctx, v) => { const g = num(v); return [['Removal', g === 0 ? warn('No gap: the support welds to the part (only for soluble support).') : g < 0.15 ? 'Tight: harder to remove.' : 'Breaks away cleanly.'], ['Underside', g > 0.25 ? 'Droopy, rough underside.' : 'Good underside.']]; },
    notes: {'0': 'Soluble support only.', '0.1': 'Semi-detachable.', '0.2': 'Detachable.'},
    exact: () => ({min: 0, max: '', unit: 'mm'}),
  };
  S.support_bottom_z_distance = {
    title: 'Bottom Z distance',
    explain: () => `<p>The gap between the part and support standing on top of it (support that starts on the part instead of the bed). A gap makes it easier to remove without scarring that surface.</p>`,
    choices: () => [{value: '0.2', label: '0.2 mm', note: 'Default.'}, {value: '0.1', label: '0.1 mm', note: ''}],
  };
  S.tree_support_wall_count = {
    title: 'Support wall loops',
    explain: () => `<p>How many walls each support branch or column has (0 to 2). 0 picks automatically. More walls make tall supports sturdier but harder to remove.</p>`,
    choices: () => [{value: '0', label: 'Automatic', note: ''}, {value: '1', label: '1', note: ''}, {value: '2', label: '2', note: 'Sturdy.'}],
  };
  S.support_base_pattern = {
    title: 'Base pattern',
    explain: () => `<p>The pattern inside the support. <b>Rectilinear</b> is simple and easy to break; <b>grid</b> and <b>honeycomb</b> are stiffer; <b>lightning</b> uses very little plastic; <b>hollow</b> is just walls (the default for trees).</p>`,
    notes: {default: 'Rectilinear, or hollow for trees.', rectilinear: 'Easy to break.', 'rectilinear-grid': 'Stiffer.', honeycomb: 'Strong.', lightning: 'Least plastic.', hollow: 'Walls only.'},
  };
  S.support_base_pattern_spacing = {
    title: 'Base pattern spacing',
    explain: () => `<p>How far apart the support's inner lines are. Wider spacing uses less plastic and breaks away more easily; closer spacing holds up better.</p>`,
    picture: (ctx, v) => { const c = {...ctx, values: new Proxy(ctx.values, {get: (t, k) => k === 'support_base_pattern_spacing' ? v : t[k]})}; return supports(c, {style: 'grid'}); },
    choices: () => [{value: '2.5', label: '2.5 mm', note: 'Default.'}, {value: '1.5', label: '1.5 mm', note: 'Sturdier.'}, {value: '4', label: '4 mm', note: 'Lighter.'}],
  };
  S.support_angle = {title: 'Pattern angle', explain: () => `<p>Rotates the support's line pattern on the bed.</p>`};
  S.support_interface_top_layers = {
    title: 'Top interface layers',
    explain: () => `<p>How many dense layers top the support, directly under the part. They give the part a flat surface to be printed on; without them, the underside sags between support lines.</p>`,
    picture: (ctx, v) => supports(ctx, {interface: num(v)}),
    effects: (ctx, v) => [['Underside', num(v) === 0 ? 'Sags between support lines.' : 'Flat and smooth.'], ['Removal', num(v) > 3 ? 'A thick slab to peel off.' : 'Normal.']],
  };
  S.support_interface_bottom_layers = {
    title: 'Bottom interface layers',
    explain: () => `<p>Dense layers at the bottom of support that stands on the part, to protect that surface. -1 uses the same as the top.</p>`,
  };
  S.support_interface_pattern = {
    title: 'Interface pattern',
    explain: () => `<p>The line pattern of the dense interface layers. Rectilinear is the default for normal supports, concentric for soluble ones.</p>`,
    notes: {auto: 'Chosen for the support type.', rectilinear: 'Straight lines.', concentric: 'Rings.', spiralinset: 'A spiral.', rectilinear_interlaced: 'Crossing lines.', grid: 'A grid.'},
  };
  S.support_interface_spacing = {
    title: 'Top interface spacing',
    explain: () => `<p>The gap between lines in the top interface. 0 makes it solid: a smoother underside, but harder to remove. Wider gaps are easier to remove.</p>`,
    choices: () => [{value: '0.5', label: '0.5 mm', note: 'Default.'}, {value: '0.2', label: '0.2 mm', note: 'Smoother underside.'}, {value: '0', label: 'Solid', note: 'Soluble interface.'}],
  };
  S.support_bottom_interface_spacing = {title: 'Bottom interface spacing', explain: () => `<p>The same for the bottom interface. 0 is solid.</p>`};
  S.support_expansion = {title: 'Normal support expansion', explain: () => `<p>Grows (+) or shrinks (-) normal supports sideways. Growing them makes them more stable.</p>`};
  S.support_interface_loop_pattern = {title: 'Loop pattern interface', explain: () => `<p>Covers the top of the support with loops instead of lines.</p>`, notes: {'1': 'Loops.', '0': 'Lines.'}};
  S.support_object_xy_distance = {
    title: 'Support/object XY distance',
    explain: () => `<p>The sideways gap between supports and the part's walls. Too small and the support sticks to the walls and scars them; too big and the edge of the overhang isn't held.</p>`,
    choices: () => [{value: '0.35', label: '0.35 mm', note: 'Default.'}, {value: '0.6', label: '0.6 mm', note: 'Cleaner walls.'}],
  };
  S.support_object_first_layer_gap = {title: 'Support/object first layer gap', explain: () => `<p>The same sideways gap, on the first layer only.</p>`};
  S.bridge_no_support = {
    title: 'Don\'t support bridges',
    explain: () => `<p>A flat ceiling with walls on both sides is a bridge and usually prints fine on its own. On, those aren't supported, saving a lot of support.</p>`,
    notes: {'1': 'Let bridges print unsupported.', '0': 'Support them.'},
  };
  S.max_bridge_length = {
    title: 'Max bridge length',
    explain: () => `<p>Bridges longer than this get support anyway. 0 supports every bridge.</p>`,
    choices: () => [{value: '10', label: '10 mm', note: 'Default.'}, {value: '20', label: '20 mm', note: 'Good bridging printers.'}],
  };
  S.independent_support_layer_height = {
    title: 'Independent support layer height',
    explain: () => `<p>Lets supports use their own layer height, which saves time and allows any top gap. It's not possible with a prime tower.</p>`,
    notes: {'1': 'Own layer height.', '0': 'Same as the part.'},
  };

  window.SECTIONS['Tree supports'] = {
    intro: () => `<p>Fine-tuning for tree supports: how thick their branches are, how far they may lean, and how densely they touch the part.</p>`,
  };
  S.tree_support_tip_diameter = {title: 'Tip diameter', explain: () => `<p>How thick the branch tips are where they touch the part. Thinner leaves smaller marks; thicker holds better.</p>`, choices: () => [{value: '0.8', label: '0.8 mm', note: 'Default.'}, {value: '1.2', label: '1.2 mm', note: 'Firmer.'}]};
  const branchDistance = {title: 'Branch distance', explain: () => `<p>How far apart neighbouring branch tips are under an overhang. Closer tips hold the surface more evenly but are harder to remove.</p>`};
  S.tree_support_branch_distance = branchDistance;
  S.tree_support_branch_distance_organic = branchDistance;
  S.tree_support_top_rate = {title: 'Branch density', explain: () => `<p>How dense the tips of the branches are. Higher holds overhangs better but is harder to remove; top interface layers are usually a better choice.</p>`};
  const branchDiameter = {title: 'Branch diameter', explain: () => `<p>How thick branches start. Thicker branches are steadier for tall prints.</p>`};
  S.tree_support_branch_diameter = branchDiameter;
  S.tree_support_branch_diameter_organic = branchDiameter;
  S.tree_support_branch_diameter_angle = {title: 'Branch diameter angle', explain: () => `<p>How quickly branches thicken towards the bottom. A little angle makes them stable; 0 keeps them the same thickness.</p>`};
  const branchAngle = {title: 'Branch angle', explain: () => `<p>How far from vertical branches may lean. More lean reaches further around the part, but leaning branches are less stable.</p>`, choices: () => [{value: '40', label: '40°', note: 'Default.'}, {value: '30', label: '30°', note: 'Steadier.'}]};
  S.tree_support_branch_angle = branchAngle;
  S.tree_support_branch_angle_organic = branchAngle;
  S.tree_support_angle_slow = {title: 'Preferred branch angle', explain: () => `<p>The lean branches prefer when they don't have to dodge the part. Lower is more upright and stable; higher merges branches sooner.</p>`};
  S.tree_support_auto_brim = {title: 'Auto brim width', explain: () => `<p>Gives each tree's foot a brim of automatic size, so tall trees don't tip over.</p>`, notes: {'1': 'Automatic.', '0': 'Set it below.'}};
  S.tree_support_brim_width = {title: 'Tree support brim width', explain: () => `<p>The width of the brim around each tree's foot.</p>`};
})();
