// Elai's written answers: common problems and tasks, with the words people use for them.
//
// Each topic:
//   id, title
//   words  - "word:weight" or "phrase:weight"; a phrase counts when all its words are in the question
//   needs  - the topic only counts if one of these is in the question
//   mode   - 'off' or 'on' when the topic is about removing or adding something (fits "remove ...", "add ...")
//   answer - (h) => HTML. h.at(key) names a setting with where it is and its value now; h.value(key) is its value.
//   actions - (h) => buttons: {label, set: {key: value, ...}} changes settings, {label, show: key} opens one,
//             {label, run: name} opens a tool. Buttons for settings this app doesn't have are left out.
window.ELAI_KNOWLEDGE = [
  {
    id: 'brim_off', title: 'Removing the brim', mode: 'off',
    words: ['brim:3', 'remove:1', 'off:1', 'rid:1', 'trim:1', 'peel:1', 'edge:0.5', 'first layer:0.5', 'flat:0.5'],
    needs: ['brim'],
    answer: h => `<p>The flat ring printed around the bottom of the part is the <b>brim</b>. It holds corners down so they don't lift.</p>
      <p><b>To stop printing it:</b> set ${h.at('brim_type')} to <b>No brim</b>.</p>
      <p><b>If it's already printed:</b> bend it away from the part and snap it off, then clean the edge with a craft knife or deburring tool.</p>
      <p><b>To keep it but make it easier to remove:</b> leave a small gap between brim and part with ${h.at('brim_object_gap')} (0.1 to 0.2 mm), or use <b>Mouse ears</b>, small discs only at the corners.</p>`,
    actions: () => [{label: 'Turn the brim off', set: {brim_type: 'no_brim'}}, {label: 'Use mouse ears instead', set: {brim_type: 'brim_ears'}},
      {label: 'Gap of 0.15 mm', set: {brim_object_gap: '0.15'}}, {label: 'Show me the setting', show: 'brim_type'}],
  },
  {
    id: 'brim_on', title: 'Adding a brim', mode: 'on',
    words: ['brim:3', 'add:1', 'warping:1', 'corners:1', 'fall:1', 'tall:0.5', 'thin:0.5'],
    needs: ['brim'],
    answer: h => `<p>A <b>brim</b> is a flat ring around the bottom of the part that gives it more grip on the bed. Use it for parts with sharp corners that lift, or tall thin parts that could topple.</p>
      <p>Set ${h.at('brim_type')} to <b>Outer brim only</b> (or <b>Auto</b> to let the app decide), and its width with ${h.at('brim_width')}. 5 mm is usual.</p>`,
    actions: () => [{label: 'Outer brim, 5 mm', set: {brim_type: 'outer_only', brim_width: '5'}}, {label: 'Auto brim', set: {brim_type: 'auto_brim'}},
      {label: 'Show me the setting', show: 'brim_type'}],
  },
  {
    id: 'skirt', title: 'The skirt (loop around the part)',
    words: ['skirt:3', 'loop:1', 'outline:1', 'around:0.5', 'remove:0.5', 'line around:1', 'line around:4', 'loop around:4', 'outline:3', 'around it:3', 'with a gap:3', 'away from:2'],
    needs: ['skirt', 'outline', 'line around', 'loop around', 'around it', 'with a gap', 'away from'],
    answer: h => `<p>The <b>skirt</b> is a loop drawn a few millimetres away from the part at the very start. It doesn't touch the part; it gets the plastic flowing and shows whether the first layer is sticking.</p>
      <p>The number of loops is ${h.at('skirt_loops')}. Set it to <b>0</b> to turn it off.</p>`,
    actions: () => [{label: 'Turn the skirt off', set: {skirt_loops: '0'}}, {label: 'One loop', set: {skirt_loops: '1'}}, {label: 'Show me the setting', show: 'skirt_loops'}],
  },
  {
    id: 'raft', title: 'Rafts',
    words: ['raft:3', 'remove:0.5', 'under:0.5', 'base:0.5'],
    needs: ['raft'],
    answer: h => `<p>A <b>raft</b> is a thick grid printed under the whole part, which the part then sits on. It helps on warped or hard-to-stick beds but costs plastic and leaves a rough bottom.</p>
      <p>The number of raft layers is ${h.at('raft_layers')}. <b>0</b> means no raft.</p>`,
    actions: h => [{label: 'No raft', set: {raft_layers: '0'}}, {label: 'Show me the setting', show: 'raft_layers'}],
  },
  {
    id: 'supports_off', title: 'Turning supports off', mode: 'off',
    words: ['support:3', 'remove:1', 'off:1', 'turn off:1', 'without:1', 'no:0.5', 'hard:-3', 'stuck:-3', 'difficult:-3', 'fused:-3', 'welded:-3'],
    needs: ['support'],
    answer: h => `<p>Supports are on or off with ${h.at('enable_support')}.</p>
      <p>Without them, anything that hangs out further than about 45° from upright, or a flat roof over a gap, droops or fails. Check the preview after slicing: overhangs show in a different colour.</p>
      <p>If you only want supports to stand on the bed and never on the part itself, turn on ${h.at('support_on_build_plate_only')}.</p>`,
    actions: () => [{label: 'Turn supports off', set: {enable_support: '0'}}, {label: 'Only from the bed', set: {enable_support: '1', support_on_build_plate_only: '1'}},
      {label: 'Show me the setting', show: 'enable_support'}],
  },
  {
    id: 'supports_on', title: 'Adding supports', mode: 'on',
    words: ['support:3', 'add:1', 'overhang:1', 'droop:1', 'need:0.5', 'mid air:1', 'hanging:1', 'chin:1', 'arms:0.5', 'tree:2'],
    needs: ['support', 'overhang', 'hanging', 'mid air', 'tree'],
    answer: h => `<p>Turn on ${h.at('enable_support')}. The type is ${h.at('support_type')}: <b>Tree</b> supports grow like branches, use less plastic and come off cleaner on figures and organic shapes. <b>Normal</b> supports are a grid, better under large flat overhangs.</p>
      <p>To add supports only where you choose, paint them on with the <b>Support painting</b> tool (select the part, press <b>L</b>), and set the type to a <b>manual</b> one.</p>`,
    actions: () => [{label: 'Tree supports on', set: {enable_support: '1', support_type: 'tree(auto)'}}, {label: 'Normal supports on', set: {enable_support: '1', support_type: 'normal(auto)'}},
      {label: 'Show me the setting', show: 'enable_support'}],
  },
  {
    id: 'supports_hard', title: 'Supports are hard to remove',
    words: ['support:2', 'hard:1.5', 'stuck:1.5', 'remove:1', 'difficult:1', 'fused:1.5', 'welded:1.5', 'scar:1', 'ugly:0.5', 'off:0.5', 'support marks:3', 'scars:2', 'support stuck:4', 'fused:3', 'interface:2'],
    needs: ['support', 'support marks', 'scars', 'support stuck', 'fused', 'interface'],
    patterns: [/support[^.?!]*\b(can'?t|cannot|won'?t|wont|doesn'?t|hard|difficult|impossible|unable|without breaking|stuck|fused)|\b(can'?t|cannot|won'?t|wont|doesn'?t|hard|difficult|impossible|unable|without breaking|stuck|fused)\b[^.?!]*support/i],
    answer: h => `<p>Supports weld to the part when they sit too close. Two settings help most:</p>
      <ul><li>${h.at('support_top_z_distance')}: the gap between the support's top and the part. One layer height (0.2 mm) is usual; raise it a little if they still weld.</li>
      <li>${h.at('support_type')}: <b>Tree</b> supports touch the part at fewer points and peel off cleaner.</li></ul>
      <p>For figures, a different filament for the support interface (a support material) separates best, if you have one loaded.</p>`,
    actions: () => [{label: 'Gap of 0.25 mm', set: {support_top_z_distance: '0.25'}}, {label: 'Use tree supports', set: {support_type: 'tree(auto)'}},
      {label: 'Show me the setting', show: 'support_top_z_distance'}],
  },
  {
    id: 'stringing', title: 'Stringing (thin hairs between parts)',
    words: ['stringing:3', 'ooze:2', 'web:1', 'hair:1', 'thread:0.5', 'wisp:1', 'travel:0.5'],
    needs: ['stringing', 'ooze', 'hair', 'web', 'wisp'],
    answer: h => `<p>Strings come from plastic oozing out while the nozzle moves between places. In order of what usually fixes it:</p>
      <ol><li><b>Dry the filament.</b> Damp filament strings badly whatever the settings, PETG and TPU most of all.</li>
      <li><b>Lower the nozzle temperature</b> by 5 to 10 °C in the filament settings: ${h.at('nozzle_temperature')}.</li>
      <li><b>Retract more</b> in the printer settings: ${h.at('retraction_length')}. Go up in 0.2 mm steps; direct-drive printers rarely need more than 1.5 mm.</li></ol>
      <p>A few wisps come off with a quick pass of a heat gun or lighter.</p>`,
    actions: () => [{label: 'Show the temperature', show: 'nozzle_temperature'}, {label: 'Show retraction', show: 'retraction_length'}],
  },
  {
    id: 'warping', title: 'Corners lifting or the print coming loose',
    words: ['warping:3', 'adhesion:2.5', 'bed:1', 'corners:1', 'loose:1', 'came off:1.5', 'first layer:1', 'peel:1', 'detach:1.5', 'knocked:1', 'detach:4', 'detaches:4', 'pops off:4', 'came off:4', 'comes off:4', 'loose:2'],
    needs: ['warping', 'adhesion', 'came off', 'detach', 'knocked', 'loose', 'detach', 'detaches', 'pops off', 'came off', 'comes off', 'loose'],
    answer: h => `<p>When corners lift or the part comes loose, it is almost always the first layer:</p>
      <ol><li><b>Clean the bed</b> with dish soap and water, or isopropyl alcohol. Finger grease is the usual cause.</li>
      <li><b>Check the bed type</b> matches the plate you have on, so the bed temperature is right: ${h.at('curr_bed_type')}.</li>
      <li><b>Add a brim</b> for sharp corners: ${h.at('brim_type')}.</li>
      <li><b>Print the first layer slower</b>: ${h.at('initial_layer_speed')}.</li></ol>
      <p>ABS and ASA also need a draught-free, enclosed printer.</p>`,
    actions: () => [{label: 'Add a 5 mm brim', set: {brim_type: 'outer_only', brim_width: '5'}}, {label: 'Show the first layer speed', show: 'initial_layer_speed'}],
  },
  {
    id: 'elephant', title: 'Elephant foot (bottom layers bulge out)',
    words: ['elephant:3', 'bottom:1', 'wider:1', 'flare:1', 'first layer:1', 'squished:1', 'lip:1', 'bottom wider:5', 'wider bottom:5', 'wider:2'],
    needs: ['elephant', 'flare', 'lip', 'squished', 'bottom wider', 'wider bottom'],
    answer: h => `<p>The first layers spread wider than the rest because they're pressed onto a hot bed. Shrink them a little with ${h.at('elefant_foot_compensation')}: 0.1 to 0.2 mm is typical.</p>`,
    actions: () => [{label: 'Set it to 0.15 mm', set: {elefant_foot_compensation: '0.15'}}, {label: 'Show me the setting', show: 'elefant_foot_compensation'}],
  },
  {
    id: 'seam', title: 'The seam (a line or bumps up the side)',
    words: ['seam:3', 'line side:2.5', 'zit:1', 'bump:1', 'blobs:1', 'visible:1', 'vertical line:2', 'scar:1'],
    needs: ['seam', 'zit', 'bump', 'blobs', 'scar', 'line side', 'vertical line'],
    answer: h => `<p>Each layer has to start and end somewhere, and that spot leaves a mark: the <b>seam</b>. Where it goes is ${h.at('seam_position')}:</p>
      <ul><li><b>Aligned</b> or <b>Back</b>: one neat line, out of sight at the back.</li>
      <li><b>Nearest</b>: hidden in corners where it can.</li>
      <li><b>Random</b>: no line, but small bumps all over.</li></ul>
      <p>On figures you can also paint where the seam goes: select the part and press <b>P</b>. ${h.at('seam_slope_type')} blends the start and end into each other and makes it much fainter.</p>`,
    actions: () => [{label: 'Put it at the back', set: {seam_position: 'back'}}, {label: 'Hide it in corners', set: {seam_position: 'nearest'}},
      {label: 'Show me the setting', show: 'seam_position'}],
  },
  {
    id: 'faster', title: 'Printing faster',
    words: ['speed:3', 'long:1', 'takes:0.5', 'reduce time:1.5', 'hurry:1'],
    needs: ['speed', 'long', 'hurry'],
    answer: h => `<p>The biggest time savings, in order:</p>
      <ol><li><b>Thicker layers.</b> 0.28 mm instead of 0.2 mm takes about 30% off. ${h.at('layer_height')}</li>
      <li><b>Less infill.</b> 10 to 15% is enough for most display parts. ${h.at('sparse_infill_density')}</li>
      <li><b>Fewer walls</b> if the part isn't load-bearing. ${h.at('wall_loops')}</li>
      <li><b>Lighter supports</b>, or none if the part doesn't need them.</li></ol>
      <p>Raising speeds helps less than you'd think: the filament's ${h.at('filament_max_volumetric_speed')} caps how fast plastic can melt.</p>`,
    actions: () => [{label: '0.28 mm layers', set: {layer_height: '0.28'}}, {label: '10% infill', set: {sparse_infill_density: '10%'}},
      {label: 'Show the layer height', show: 'layer_height'}],
  },
  {
    id: 'stronger', title: 'Making the part stronger',
    words: ['strength:3', 'break:1.5', 'snap:1', 'crack:1', 'durable:1', 'load:1', 'functional:1', 'solid:0.5', 'brittle:1.5'],
    needs: ['strength', 'break', 'snap', 'crack', 'durable', 'load', 'brittle'],
    answer: h => `<p>Walls matter more than infill. In order:</p>
      <ol><li><b>More walls:</b> 4 to 6. ${h.at('wall_loops')}</li>
      <li><b>More top and bottom layers:</b> ${h.at('top_shell_layers')}, ${h.at('bottom_shell_layers')}</li>
      <li><b>More infill</b>, 25 to 40%, with a strong pattern such as Gyroid or Cubic: ${h.at('sparse_infill_density')}</li></ol>
      <p>Parts are weakest between layers, so turn the part so the load runs along the layers, not across them.</p>`,
    actions: () => [{label: '4 walls, 30% infill', set: {wall_loops: '4', sparse_infill_density: '30%'}}, {label: 'Show walls', show: 'wall_loops'}],
  },
  {
    id: 'smoother', title: 'Smoother surfaces and finer detail',
    words: ['finish:4', 'surface finish:5', 'smooth:3', 'detail:2.5', 'layer:1', 'quality:2', 'stair:1', 'steps:1', 'visible:0.5', 'finish:1', 'visible layer:4', 'quality:4', 'better looking:3'],
    needs: ['finish', 'smooth', 'detail', 'quality', 'stair', 'finish', 'visible layer', 'quality', 'better looking'],
    answer: h => `<p>Visible layer lines and stair steps on curves shrink with thinner layers: 0.12 mm instead of 0.2 mm, at the cost of time. ${h.at('layer_height')}</p>
      <p>For flat tops, ${h.at('ironing_type')} runs the hot nozzle over the top surface a second time to smooth it.</p>
      <p>Slower outer walls also help: ${h.at('outer_wall_speed')}</p>`,
    actions: () => [{label: '0.12 mm layers', set: {layer_height: '0.12'}}, {label: 'Iron the top surfaces', set: {ironing_type: 'top'}}, {label: 'Show the layer height', show: 'layer_height'}],
  },
  {
    id: 'droop', title: 'Overhangs and bridges droop',
    words: ['droop:3', 'overhang:2', 'bridge:2', 'curl:1', 'underside:1', 'spaghetti:1', 'messy:0.5'],
    needs: ['droop', 'overhang', 'bridge', 'underside'],
    answer: h => `<p>Plastic hanging in air droops if it isn't cooled fast or held up.</p>
      <ul><li>Up to about 45° from upright prints fine; beyond that, add supports (${h.at('enable_support')}).</li>
      <li>Make sure the part cooling fan runs fully on overhangs, in the filament's cooling settings.</li>
      <li>${h.at('enable_overhang_speed')} slows down on overhangs automatically.</li>
      <li>Bridges: ${h.at('thick_bridges')} prints them thicker and stronger.</li></ul>`,
    actions: () => [{label: 'Slow down on overhangs', set: {enable_overhang_speed: '1'}}, {label: 'Show supports', show: 'enable_support'}],
  },
  {
    id: 'fit', title: 'Holes too small or parts that don\'t fit',
    words: ['fit:3', 'hole:2', 'small:1', 'tight:1', 'loose:1', 'tolerance:2', 'press:0.5', 'screw:0.5', 'dimension:1.5', 'accurate:1', 'size:0.5'],
    needs: ['fit', 'hole', 'tolerance', 'dimension', 'accurate'],
    answer: h => `<p>Printed holes come out a little small and outsides a little big, because the plastic spreads.</p>
      <ul><li>${h.at('xy_hole_compensation')} grows holes: 0.1 to 0.15 mm is typical.</li>
      <li>${h.at('xy_contour_compensation')} shrinks the outside: use a small negative value.</li></ul>
      <p>For parts that slot together, design 0.2 to 0.3 mm of gap. Print a small test first.</p>`,
    actions: () => [{label: 'Holes +0.1 mm', set: {xy_hole_compensation: '0.1'}}, {label: 'Show me the setting', show: 'xy_hole_compensation'}],
  },
  {
    id: 'purge', title: 'Too much purge waste in colour prints',
    words: ['purge:3', 'tower:2', 'waste:1.5', 'prime:1.5', 'colour change:1', 'poop:1.5', 'flush:1'],
    needs: ['purge', 'tower', 'prime', 'poop'],
    answer: h => `<p>Each colour change pushes old colour out until the new one runs clean. To waste less:</p>
      <ul><li>Flush into the inside of the part instead of the tower: ${h.at('flush_into_infill')}, and into supports.</li>
      <li>Lower the flush amounts with the <b>Flushing volumes</b> button next to the filament list: dark-to-light changes need the most.</li>
      <li>Paint fewer colour changes per layer, and use fewer colours in the same layers.</li></ul>
      <p>The prime tower is ${h.at('enable_prime_tower')}. Turning it off saves time but colours can bleed into each other.</p>`,
    actions: () => [{label: 'Flush into infill', set: {flush_into_infill: '1'}}, {label: 'Show the prime tower', show: 'enable_prime_tower'}],
  },
  {
    id: 'infill', title: 'Infill',
    words: ['infill:3', 'pattern:1.5', 'density:1.5', 'percent:1', 'honeycomb:1', 'gyroid:1', 'hollow:1'],
    needs: ['infill', 'hollow', 'gyroid', 'honeycomb'],
    answer: h => `<p>Infill is the inside of the part. ${h.at('sparse_infill_density')} sets how full: 10 to 15% for display, 25 to 40% for strength. 0% makes it hollow.</p>
      <p>${h.at('sparse_infill_pattern')}: <b>Gyroid</b> is strong in every direction, <b>Grid</b> and <b>Rectilinear</b> are quick, <b>Lightning</b> only holds up the top and is the fastest.</p>`,
    actions: () => [{label: '15% infill', set: {sparse_infill_density: '15%'}}, {label: 'Gyroid pattern', set: {sparse_infill_pattern: 'gyroid'}}, {label: 'Show infill', show: 'sparse_infill_density'}],
  },
  {
    id: 'walls', title: 'Walls',
    words: ['wall:3', 'thick:1', 'thin:1', 'shell:1', 'thickness:1', 'wall count:5', 'wall loops:5'],
    needs: ['wall', 'shell', 'wall count', 'wall loops'],
    answer: h => `<p>${h.at('wall_loops')} sets how many lines thick the outside is. 2 is fine for display, 3 is a good default, 4 to 6 for strong parts. Each wall is about one nozzle wide.</p>
      <p>Top and bottom thickness are ${h.at('top_shell_layers')} and ${h.at('bottom_shell_layers')}.</p>`,
    actions: () => [{label: '3 walls', set: {wall_loops: '3'}}, {label: 'Show walls', show: 'wall_loops'}],
  },
  {
    id: 'layer_height', title: 'Layer height',
    words: ['layer:2.5', 'height:2', 'thickness:1', 'thinner:1', 'thicker:1'],
    needs: ['layer'],
    answer: h => `<p>${h.at('layer_height')} is the main trade between looks and time. With a 0.4 mm nozzle: 0.12 mm for fine detail, 0.2 mm standard, 0.28 mm for speed. It must stay below about 75% of the nozzle size.</p>`,
    actions: () => [{label: '0.12 mm', set: {layer_height: '0.12'}}, {label: '0.2 mm', set: {layer_height: '0.2'}}, {label: '0.28 mm', set: {layer_height: '0.28'}}],
  },
  {
    id: 'ironing', title: 'Ironing the top surface',
    words: ['ironing:3', 'top:1', 'flat:1', 'glossy:1', 'shiny:1', 'smooth top:6', 'top smooth:6', 'flat top:3'],
    needs: ['ironing', 'glossy', 'shiny', 'smooth top', 'top smooth', 'flat top'],
    answer: h => `<p>Ironing runs the hot nozzle back over the top surface with very little plastic, melting it smooth. It adds time and only helps flat tops. ${h.at('ironing_type')}</p>`,
    actions: () => [{label: 'Iron top surfaces', set: {ironing_type: 'top'}}, {label: 'No ironing', set: {ironing_type: 'no ironing'}}, {label: 'Show me the setting', show: 'ironing_type'}],
  },
  {
    id: 'fuzzy', title: 'Fuzzy skin (rough texture)',
    words: ['fuzzy:3', 'rough:1', 'grip:1', 'hide layer:1'],
    needs: ['fuzzy'],
    answer: h => `<p>${h.at('fuzzy_skin')} shakes the nozzle slightly on the outer walls, giving a rough, matte texture that hides layer lines and gives grip. It doesn't touch the top surfaces.</p>`,
    actions: () => [{label: 'On the outside', set: {fuzzy_skin: 'external'}}, {label: 'Off', set: {fuzzy_skin: 'none'}}, {label: 'Show me the setting', show: 'fuzzy_skin'}],
  },
  {
    id: 'paint_colour', title: 'Painting colours onto a model',
    words: ['paint:3', 'colour:3', 'multi:1', 'filament:1', 'region:0.5', 'brush:1'],
    needs: ['paint', 'colour'],
    answer: () => `<p>Select the part and press <b>N</b> (or the brush in the toolbar) for colour painting.</p>
      <ul><li>Pick a filament at the top, then paint with the brush or a sphere.</li>
      <li><b>Fill</b> with <b>Find whole parts</b> paints a whole part in one click: a rope, a crown, a face. Ctrl and the scroll wheel make the found part bigger or smaller.</li>
      <li><b>Paint from image</b> lays a photo over the model and paints each part the nearest loaded filament.</li></ul>`,
  },
  {
    id: 'paint_image', title: 'Painting from a photo',
    words: ['image:3', 'paint:1.5', 'colour:1', 'match:1', 'reference:1'],
    needs: ['image'],
    answer: () => `<p>In colour painting (select the part, press <b>N</b>), click <b>Paint from image...</b> and pick a photo.</p>
      <ol><li>Turn the model to the same angle as the photo, by dragging outside it.</li>
      <li>Line the photo up with <b>Photo size</b>, <b>Left / right</b> and <b>Up / down</b>; <b>See-through</b> fades it.</li>
      <li>Untick filaments the photo mustn't use, raise <b>Brightness</b> if skin comes out dark, then <b>Apply</b>. Undo takes it back.</li></ol>
      <p>Only the side facing you is painted. Load filaments close to the photo's colours first; the list marks poor matches.</p>`,
  },
  {
    id: 'cut', title: 'Cutting a model and joining the pieces',
    words: ['cut:3', 'slice two:4', 'two:1', 'pieces:2', 'chop:3', 'divide:3', 'section:1', 'connectors:2', 'screw:2', 'plug:1', 'dowel:1', 'snap:1', 'join:1.5', 'glue:1', 'pieces:1'],
    needs: ['cut', 'slice two', 'pieces', 'chop', 'divide', 'section', 'connectors', 'screw', 'dowel', 'join'],
    patterns: [/\b(model|part|object|it|print|this)('s| is| are)? (too (big|large|tall|long|wide)|bigger than) (for|to fit)\b/i],
    answer: () => `<p>Select the part and press <b>C</b> for the cut tool. Move the plane, then <b>Add connectors</b> and click on the cut face to place them:</p>
      <ul><li><b>Plug</b>: a peg on one piece, a hole in the other, glued.</li>
      <li><b>Dowel</b>: holes in both, with a separate pin printed.</li>
      <li><b>Snap</b>: a peg that clicks in.</li>
      <li><b>Screw</b>: a threaded peg and a threaded hole, so the pieces screw together and line up as before. The hole ends in a point, so it prints without support.</li></ul>
      <p>Then <b>Perform cut</b>. A size tolerance of 0.2 to 0.4 mm gives the right play for most printers.</p>`,
  },
  {
    id: 'resume', title: 'Carrying on a failed print',
    words: ['continue:3', 'fail:2.5', 'layer:1', 'from layer:2', 'power cut:2', 'jam:1.5', 'clog:1.5', 'stopped:1', 'halfway:1.5', 'finish:0.5', 'power went out:6', 'power cut:6', 'power outage:6', 'outage:5', 'blackout:5'],
    needs: ['continue', 'fail', 'power cut', 'jam', 'clog', 'halfway', 'power went out', 'power cut', 'power outage', 'outage', 'blackout'],
    answer: () => `<p><b>Continue from layer</b> makes a file that carries on a failed print from a chosen layer, if the part is still stuck to the bed and nothing has moved.</p>
      <ol><li>Measure the printed part's height with calipers, or find the last good layer in the preview.</li>
      <li>Open <b>Continue from layer</b> and give the layer or the height.</li>
      <li>Keep the bed warm, and don't move the part.</li></ol>`,
    actions: () => [{label: 'Open Continue from layer', run: 'resume'}],
  },
  {
    id: 'ai_setup', title: 'AI Setup and Elai',
    words: ['ai:3', 'setup:1.5', 'tokens:1.5', 'cost:1', 'key:1', 'claude:1'],
    needs: ['ai', 'tokens', 'claude'],
    patterns: [/\bwho are you\b/i, /\bwhat (can|do) you do\b/i, /\bwhat are you\b/i],
    answer: () => `<p><b>Elai</b> (this window) answers from what's built into the app. It works offline, costs nothing and sends nothing anywhere.</p>
      <p><b>AI Setup</b> asks a few questions about your model and uses Claude to pick settings for it. It needs your own Anthropic API key, and each setup costs a few cents, shown before you send.</p>`,
    actions: () => [{label: 'Open AI Setup', run: 'ai_setup'}],
  },
  {
    id: 'gradient', title: 'Colour gradients',
    words: ['gradient:3', 'colour:1', 'fade:2', 'blend:1.5', 'ombre:2', 'transition:1', 'fade:4', 'blend:3', 'transition:3', 'ombre:4', 'rainbow:4'],
    needs: ['gradient', 'fade', 'ombre', 'blend', 'fade', 'blend', 'transition', 'ombre', 'rainbow'],
    answer: () => `<p><b>Gradient</b> paints the selected object in bands that run from one filament to another, in a direction you aim. <b>Palette</b> adds the in-between mixes of two filaments of the same material, so the bands look smooth.</p>`,
    actions: () => [{label: 'Open Gradient', run: 'gradient'}, {label: 'Open Palette', run: 'palette'}],
  },
  {
    id: 'temperature', title: 'Temperatures',
    words: ['temperature:3', 'nozzle:1', 'bed:1', 'degrees:1'],
    needs: ['temperature', 'degrees'],
    answer: h => `<p>Temperatures belong to the filament. The nozzle is ${h.at('nozzle_temperature')}; the bed temperature depends on the plate type, ${h.at('curr_bed_type')}, and is set per plate in the filament settings.</p>
      <p>Too hot: stringing and droopy overhangs. Too cold: weak layers that split, and a clicking extruder.</p>`,
    actions: () => [{label: 'Show the nozzle temperature', show: 'nozzle_temperature'}],
  },
  {
    id: 'export', title: 'Sending the print or saving G-code',
    words: ['export:3', 'printer:1', 'wifi:1', 'usb:1', 'sd:1', 'save:1', 'file:0.5'],
    needs: ['export', 'wifi', 'usb', 'sd'],
    answer: () => `<p>Click <b>Slice plate</b> at the top right. When it finishes, the <b>Print</b> button sends the job to a connected printer; its arrow switches to <b>Export G-code file</b> to save it for a USB stick or SD card.</p>`,
  },
  {
    id: 'orient', title: 'Turning the part to print better',
    words: ['orient:3', 'rotate:3', 'flat:1', 'lay:1', 'face down:1.5', 'upside down:1.5', 'angle:1', 'face:3', 'lay flat:4', 'place on face:5'],
    needs: ['orient', 'rotate', 'flat', 'lay', 'face down', 'upside down', 'face', 'lay flat', 'place on face'],
    answer: () => `<p>Select the part and press <b>F</b>, then click a face to lay it flat on the bed, or <b>R</b> to rotate by hand. The toolbar's <b>Auto orient</b> picks the angle that needs the least support.</p>
      <p>Parts are weakest between layers, and overhangs need support, so the best angle is a balance: big flat faces down, few overhangs, loads along the layers.</p>`,
  },
];
