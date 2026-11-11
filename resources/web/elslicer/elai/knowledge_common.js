// Elai's written answers, part two: the questions people ask most about slicing and printing, gathered from
// troubleshooting guides and slicer forums. Same format as knowledge.js.
window.ELAI_KNOWLEDGE.push(
  // ---------------------------------------------------------------- getting started
  {
    id: 'start', title: 'Printing something, start to finish',
    words: ['start:3', 'begin:3', 'beginner:4', 'new:2', 'first time:4', 'slice:2.5', 'use app:3', 'workflow:3', 'steps:2', 'basics:3', 'getting started:4', 'tutorial:3'],
    needs: ['start', 'begin', 'beginner', 'new', 'first time', 'slice', 'use app', 'workflow', 'steps', 'basics', 'getting started', 'tutorial'],
    patterns: [/\b(my )?first (print|model|time)\b|\bhow (do|can) i (start|print)( something| anything| a model| my model)?\s*\??\s*$/i],
    answer: () => `<ol><li><b>Choose your printer, filament and plate</b> at the top of the left panel (first time: <b>Add/Remove printers</b>).</li>
      <li><b>Add the model:</b> drag an STL, 3MF or STEP file onto the plate, or use <b>File › Import</b>.</li>
      <li><b>Place it:</b> press <b>F</b> to lay a flat face down, <b>A</b> to arrange. <b>AI Setup</b> can pick settings for you.</li>
      <li><b>Slice:</b> click <b>Slice plate</b>, then check the preview for red overhangs or missing parts.</li>
      <li><b>Print:</b> <b>Print plate</b> sends it to a connected printer, or <b>Export G-code</b> saves a file for a USB stick or SD card.</li></ol>`,
    actions: () => [{label: 'Open AI Setup', run: 'ai_setup'}],
  },
  // ---------------------------------------------------------------- print problems
  {
    id: 'under_extrusion', title: 'Under-extrusion (gaps, thin or missing lines)',
    words: ['under extrusion:4', 'underextrusion:4', 'underextruded:4', 'under-extruded:4', 'gaps:2', 'thin lines:2', 'missing lines:2', 'weak lines:1', 'not enough plastic:3', 'holes walls:1', 'spongy:1.5', 'sparse:0.5', 'gaps walls:4', 'walls gaps:4', 'inconsistent:3', 'tiny holes:3', 'holes:1'],
    needs: ['under extrusion', 'underextrusion', 'underextruded', 'under-extruded', 'gaps', 'thin lines', 'missing lines', 'not enough plastic', 'spongy', 'gaps walls', 'walls gaps', 'inconsistent', 'tiny holes', 'holes'],
    patterns: [/\bunder[- ]?extru/i],
    answer: h => `<p>Too little plastic is coming out. Check, in order:</p>
      <ol><li><b>A part-blocked nozzle.</b> Heat it and push filament through by hand; do a cold pull if it's slow.</li>
      <li><b>Printing faster than the hot end melts.</b> Lower ${h.at('filament_max_volumetric_speed')} or the speeds.</li>
      <li><b>Too cold:</b> raise ${h.at('nozzle_temperature')} by 5 to 10 °C.</li>
      <li><b>Flow:</b> run the flow ratio calibration (Calibration menu) and set ${h.at('filament_flow_ratio')}.</li>
      <li><b>Mechanics:</b> a tangled spool, a worn extruder gear or a slipping tension arm.</li></ol>`,
    actions: () => [{label: 'Show flow ratio', show: 'filament_flow_ratio'}, {label: 'Show max flow', show: 'filament_max_volumetric_speed'}],
  },
  {
    id: 'over_extrusion', title: 'Over-extrusion (blobby, rough, too much plastic)',
    words: ['over-extrusion:4', 'overextrusion:4', 'overextruded:4', 'over-extruded:4', 'too much plastic:3', 'blobby:2', 'lumpy:2', 'rough top:1.5', 'ridges:1', 'dimensions too big:1.5', 'too thick:3', 'thick lines:4'],
    needs: ['over-extrusion', 'overextrusion', 'overextruded', 'over-extruded', 'too much plastic', 'blobby', 'lumpy', 'too thick', 'thick lines'],
    patterns: [/\bover[- ]?extru/i, /\btoo much (plastic|material|filament)\b/i],
    answer: h => `<p>Too much plastic: lumpy tops, rough walls, parts a bit too big. Run the <b>flow ratio calibration</b> in the Calibration menu and set ${h.at('filament_flow_ratio')} to the result; 0.95 to 0.98 is common for PLA. Also check the filament diameter in the filament settings is 1.75 mm.</p>`,
    actions: () => [{label: 'Flow ratio 0.95', set: {filament_flow_ratio: '0.95'}}, {label: 'Show flow ratio', show: 'filament_flow_ratio'}],
  },
  {
    id: 'layer_shift', title: 'Layer shift (layers slid sideways)',
    words: ['layer shift:4', 'shifted:3', 'shift:2', 'offset layers:2', 'staircase:1.5', 'slid:1.5', 'skipped steps:2', 'misaligned:1.5', 'offset:3'],
    needs: ['shift', 'shifted', 'slid', 'skipped steps', 'misaligned', 'staircase', 'offset'],
    answer: h => `<p>The print head lost its place, usually because it hit something or a belt slipped. Check the belts are tight and the pulleys' grub screws are firm, then look for curled-up edges the nozzle could catch. In the slicer, ${h.at('z_hop')} lifts the nozzle on travel moves, and lower accelerations (${h.at('default_acceleration')}) are gentler on the motors.</p>`,
    actions: () => [{label: 'Show Z hop', show: 'z_hop'}, {label: 'Show acceleration', show: 'default_acceleration'}],
  },
  {
    id: 'z_banding', title: 'Z banding (regular horizontal lines)',
    words: ['banding:4', 'ribbing:3', 'horizontal lines:3', 'bands:3', 'stripes:2', 'regular lines:2', 'wobble:1.5', 'repeating:3', 'repeat:3'],
    needs: ['banding', 'ribbing', 'horizontal lines', 'bands', 'stripes', 'wobble', 'repeating', 'repeat'],
    answer: h => `<p>Evenly spaced bands up the sides are mostly mechanical: a bent or dry Z lead screw, a loose coupler, or a bed that wobbles. Clean and lightly grease the lead screw. In the slicer, use a layer height that's a whole number of motor steps (0.08, 0.12, 0.16, 0.2, 0.24, 0.28 mm on most printers): ${h.at('layer_height')}. Uneven bands that come and go are more often temperature or filament diameter.</p>`,
    actions: () => [{label: 'Show layer height', show: 'layer_height'}],
  },
  {
    id: 'first_layer', title: 'A bad first layer (gaps, ridges or too squashed)',
    words: ['first layer:4', 'z offset:6', 'squished:1.5', 'squashed:2', 'ridges:1', 'gaps first:2', 'see through first:2', 'scraping bed:1.5', 'nozzle close:2', 'nozzle far:2', 'level:1.5', 'leveling:2', 'too close:4', 'too far:3', 'bed:1'],
    needs: ['first layer', 'z offset', 'leveling', 'level', 'squashed', 'nozzle close', 'nozzle far', 'too close', 'too far'],
    answer: h => `<p>The first layer decides the print. Look at it closely:</p>
      <ul><li><b>Round lines with gaps between them:</b> the nozzle is too high. Lower the Z offset on the printer.</li>
      <li><b>See-through, rough or ridged:</b> too low; raise the Z offset.</li>
      <li><b>Good:</b> flat lines that just touch each other.</li></ul>
      <p>Re-level the bed after moving the printer. In the slicer, a slower ${h.at('initial_layer_speed')} and a slightly thicker ${h.at('initial_layer_print_height')} (0.25 mm) forgive small errors.</p>`,
    actions: () => [{label: 'Show first layer speed', show: 'initial_layer_speed'}, {label: 'First layer 0.25 mm', set: {initial_layer_print_height: '0.25'}}],
  },
  {
    id: 'clog', title: 'Clogged nozzle or nothing comes out',
    words: ['clog:4', 'clogged:4', 'blocked:3', 'nothing comes out:4', 'not extruding:4', 'no plastic:3', 'clicking:2.5', 'grinding:2.5', 'jam:2', 'jamming:4', 'jammed:4', 'jams:4', 'stripped:4', 'stripping:4'],
    needs: ['clog', 'clogged', 'blocked', 'nothing comes out', 'not extruding', 'no plastic', 'clicking', 'grinding', 'jam', 'jamming', 'jammed', 'jams', 'stripped', 'stripping'],
    answer: h => `<p>Heat the nozzle to printing temperature and try to push filament through by hand.</p>
      <ul><li><b>A clicking or grinding extruder</b> means it can't push: the nozzle is blocked, too cold, or the speed is beyond what it can melt (${h.at('filament_max_volumetric_speed')}).</li>
      <li><b>Clear a blockage</b> with a cold pull: push filament in hot, cool to about 90 °C for PLA, then pull it out sharply. Repeat until clean, or change the nozzle.</li>
      <li><b>Heat creep</b> (jams after a long time, mostly PLA in a warm enclosure): open the door or lid.</li></ul>`,
  },
  {
    id: 'layer_split', title: 'Layers splitting apart (weak layer bonding)',
    words: ['delamination:4', 'splitting:3', 'separate layers:3', 'layer separation:4', 'cracks:2', 'crack:2', 'layers come apart:3', 'weak layers:3', 'stick together:4', 'layer bonding:4', 'apart:3', 'peel apart:4'],
    needs: ['delamination', 'splitting', 'separate layers', 'layer separation', 'cracks', 'crack', 'weak layers', 'layers come apart', 'stick together', 'layer bonding', 'apart', 'peel apart'],
    answer: h => `<p>Layers don't fuse when the plastic is too cool by the time the next layer lands.</p>
      <ul><li>Raise ${h.at('nozzle_temperature')} by 5 to 10 °C.</li>
      <li>Less fan for ABS, ASA and PETG: ${h.at('fan_max_speed')}.</li>
      <li>ABS and ASA need an enclosure and no draughts.</li>
      <li>Thinner layers bond better than thick ones.</li></ul>`,
    actions: () => [{label: 'Show the temperature', show: 'nozzle_temperature'}, {label: 'Show fan speed', show: 'fan_max_speed'}],
  },
  {
    id: 'pillowing', title: 'Holes or bumps in the top surface (pillowing)',
    words: ['pillowing:4', 'top surface holes:3', 'holes top:3', 'gaps top:3', 'top not closed:3', 'bumpy top:2', 'see infill top:3', 'top surface:1.5'],
    needs: ['pillowing', 'holes top', 'gaps top', 'top not closed', 'bumpy top', 'see infill top', 'top surface holes'],
    answer: h => `<p>The top skin is too thin to bridge the infill below it. Add top layers: ${h.at('top_shell_layers')} (5 or more for 0.2 mm layers), or set ${h.at('top_shell_thickness')} to about 1 mm. More infill and more cooling on the top layers also help.</p>`,
    actions: () => [{label: '5 top layers', set: {top_shell_layers: '5'}}, {label: 'Show top layers', show: 'top_shell_layers'}],
  },
  {
    id: 'infill_showing', title: 'Infill showing through the walls',
    words: ['infill showing:4', 'infill through:4', 'infill wall:2', 'pattern through:3', 'infill visible:3', 'shadow:1.5', 'wall infill gap:3', 'gap between wall:3', 'shadows:3', 'shadow:3'],
    needs: ['infill showing', 'infill through', 'pattern through', 'infill visible', 'wall infill gap', 'gap between wall', 'shadows', 'shadow'],
    answer: h => `<p>When infill shows through the sides, the walls are too thin or don't join the infill. Add a wall with ${h.at('wall_loops')}, and check ${h.at('infill_wall_overlap')} (15 to 25%). Printing the outer wall first (${h.at('wall_sequence')}) also hides it, at some cost on overhangs.</p>`,
    actions: () => [{label: '3 walls', set: {wall_loops: '3'}}, {label: 'Show infill/wall overlap', show: 'infill_wall_overlap'}],
  },
  {
    id: 'ringing', title: 'Ringing or ghosting (echoes after corners)',
    words: ['ringing:4', 'ghosting:4', 'echo:3', 'ripples:3', 'vibration:2.5', 'waves corners:2.5', 'shadows corners:2'],
    needs: ['ringing', 'ghosting', 'echo', 'ripples', 'vibration'],
    answer: h => `<p>Faint repeats of edges and letters after corners are the printer vibrating. Lower ${h.at('outer_wall_acceleration')} and the outer wall speed (${h.at('outer_wall_speed')}), tighten belts, and put the printer on a solid surface. Printers with input shaping can be tuned with <b>Calibration › Input Shaping</b>.</p>`,
    actions: () => [{label: 'Show outer wall acceleration', show: 'outer_wall_acceleration'}],
  },
  {
    id: 'blobs_zits', title: 'Blobs and zits on the surface',
    words: ['zits:3', 'zits surface:4', 'blobs:3', 'pimples:3', 'bumps surface:2.5', 'dots:1.5', 'specks:1.5', 'bumps:3'],
    needs: ['zits', 'blobs', 'pimples', 'bumps surface', 'dots', 'specks', 'bumps'],
    answer: h => `<p>Small blobs scattered over the walls come from the nozzle stopping and starting.</p>
      <ul><li>Tune <b>pressure advance</b> (Calibration menu) and set ${h.at('pressure_advance')}.</li>
      <li>Fewer retractions inside the part: ${h.at('reduce_infill_retraction')}.</li>
      <li>Wet filament pops and blobs: dry it.</li></ul>
      <p>A single line of blobs is the seam; ask about the seam for that.</p>`,
    actions: () => [{label: 'Show pressure advance', show: 'pressure_advance'}],
  },
  {
    id: 'rounded_corners', title: 'Bulging or rounded corners',
    words: ['corners bulge:4', 'bulging corners:4', 'rounded corners:4', 'corner bulge:4', 'corners blobby:3', 'sharp corners:2'],
    needs: ['corners bulge', 'bulging corners', 'rounded corners', 'corner bulge', 'corners blobby', 'sharp corners'],
    answer: h => `<p>Corners bulge when pressure builds up in the nozzle as it slows down. That's what <b>pressure advance</b> corrects: run its calibration (Calibration menu) and set ${h.at('pressure_advance')} with ${h.at('enable_pressure_advance')} on.</p>`,
    actions: () => [{label: 'Show pressure advance', show: 'pressure_advance'}],
  },
  {
    id: 'small_details', title: 'Small details or thin parts not printing',
    words: ['small details:4', 'tiny details:4', 'thin parts:3', 'missing details:3', 'not printing small:3', 'fine features:3', 'thin wall:3', 'disappear:2', 'missing preview:2', 'too thin:3', 'detail lost:5', 'lost:1'],
    needs: ['small details', 'tiny details', 'thin parts', 'missing details', 'fine features', 'thin wall', 'too thin', 'disappear', 'not printing small', 'detail lost'],
    answer: h => `<p>A nozzle can't print anything thinner than about its own width. Check the preview first: if it's missing there, the slicer dropped it.</p>
      <ul><li>${h.at('wall_generator')} set to <b>Arachne</b> varies line width to fit thin parts.</li>
      <li>${h.at('detect_thin_wall')} prints single lines in very thin walls.</li>
      <li>For real fine detail, a 0.2 or 0.25 mm nozzle and thin layers.</li></ul>`,
    actions: () => [{label: 'Use Arachne walls', set: {wall_generator: 'arachne'}}, {label: 'Show wall generator', show: 'wall_generator'}],
  },
  {
    id: 'text_small', title: 'Small text doesn\'t print well',
    words: ['text:3', 'letters:3', 'lettering:3', 'words:1.5', 'engraved:2', 'embossed text:2', 'small text:4'],
    needs: ['text', 'letters', 'lettering', 'engraved', 'small text'],
    answer: h => `<p>Raised text needs strokes at least as wide as two lines (about 0.8 mm with a 0.4 mm nozzle). Print text facing up, use thinner layers, ${h.at('wall_generator')} set to <b>Arachne</b>, and iron the top if it's flat. To add text to a model, right-click it and choose <b>Add part › Text</b>.</p>`,
    actions: () => [{label: 'Use Arachne walls', set: {wall_generator: 'arachne'}}],
  },
  {
    id: 'circles', title: 'Circles and curves look faceted',
    words: ['faceted:4', 'polygons:3', 'flat spots:3', 'not round:3', 'circles:2.5', 'curves:2', 'low poly:3', 'jagged:2', 'curves smooth:5', 'curves not smooth:5'],
    needs: ['faceted', 'polygons', 'flat spots', 'not round', 'low poly', 'jagged', 'curves smooth'],
    answer: h => `<p>Usually the model itself: an STL exported with too few triangles. Re-export it from your CAD program at a finer resolution. In the slicer, ${h.at('resolution')} simplifies outlines; keep it small (0.01 mm). ${h.at('enable_arc_fitting')} turns curves into arcs on printers that support it.</p>`,
    actions: () => [{label: 'Show resolution', show: 'resolution'}],
  },
  {
    id: 'nozzle_hits', title: 'The nozzle hits or scrapes the print',
    words: ['nozzle hits:4', 'scrape:3', 'scraping:3', 'knocks over:3', 'collides:3', 'collision:3', 'nozzle drag:3', 'catches:2', 'crash:4', 'crashes:4', 'crashing:4'],
    needs: ['nozzle hits', 'scrape', 'scraping', 'knocks over', 'collides', 'collision', 'nozzle drag', 'catches', 'crash', 'crashes', 'crashing'],
    answer: h => `<p>The nozzle catching curled edges or tall thin parts is fixed with <b>Z hop</b>: ${h.at('z_hop')} lifts it on each travel move (0.2 to 0.4 mm). ${h.at('reduce_crossing_wall')} keeps travel moves inside the part instead of crossing its walls. Fix warping too: curled edges are what it hits.</p>`,
    actions: () => [{label: 'Z hop 0.4 mm', set: {z_hop: '0.4'}}, {label: 'Avoid crossing walls', set: {reduce_crossing_wall: '1'}}],
  },
  {
    id: 'small_melted', title: 'Small parts or tips melt and lose shape',
    words: ['melted:3', 'melting:3', 'droopy tip:3', 'soft:1.5', 'deformed top:3', 'small layers:2', 'cooling time:3', 'too hot small:3', 'tip:4'],
    needs: ['melted', 'melting', 'droopy tip', 'deformed top', 'cooling time', 'too hot small', 'tip'],
    answer: h => `<p>Small layers come round again before the last one has cooled. ${h.at('slow_down_layer_time')} makes each layer take at least that long (8 to 15 s for PLA). Print two copies side by side so each gets time to cool, and keep the fan at full: ${h.at('fan_max_speed')}.</p>`,
    actions: () => [{label: 'Show minimum layer time', show: 'slow_down_layer_time'}],
  },
  {
    id: 'bottom_rough', title: 'Rough underside above supports',
    words: ['underside rough:4', 'bottom rough:3', 'rough underside:4', 'support marks:3', 'support side ugly:3', 'surface above support:3', 'underside:3', 'under supports:3'],
    needs: ['underside rough', 'bottom rough', 'rough underside', 'support marks', 'support side ugly', 'surface above support', 'underside', 'under supports'],
    answer: h => `<p>The surface printed on top of supports is rough because it sits on lines, not a flat bed. More support interface layers give it a smoother base: ${h.at('support_interface_top_layers')} (2 to 3). Make sure the gap ${h.at('support_top_z_distance')} isn't larger than needed. A support material on its own filament gives the cleanest result.</p>`,
    actions: () => [{label: '3 interface layers', set: {support_interface_top_layers: '3'}}],
  },
  {
    id: 'wavy_walls', title: 'Wavy walls or a wobbly surface',
    words: ['wavy:4', 'wobbly:3', 'uneven walls:3', 'salmon skin:4', 'rough walls:2', 'moire:3', 'not straight:4', 'crooked:4', 'bent:2'],
    needs: ['wavy', 'wobbly', 'uneven walls', 'salmon skin', 'moire', 'not straight', 'crooked', 'bent'],
    answer: h => `<p>A fine regular pattern on walls (salmon skin) comes from the stepper motors and is worst at low outer wall speeds; try a faster ${h.at('outer_wall_speed')}. Irregular waves are usually loose belts, a loose hot end or a wobbling bed.</p>`,
    actions: () => [{label: 'Show outer wall speed', show: 'outer_wall_speed'}],
  },
  {
    id: 'spaghetti', title: 'The print turned into spaghetti',
    words: ['spaghetti:4', 'mess:2', 'bird nest:4', 'printing in air:3', 'detached middle:3', 'tangled:4', 'tangle:4', 'nest:3'],
    needs: ['spaghetti', 'bird nest', 'printing in air', 'detached middle', 'tangled', 'tangle', 'nest'],
    answer: () => `<p>A tangle of loose strands means the part came loose or a section had nothing under it. Find the layer where it started in the preview:</p>
      <ul><li>At the bottom: bed adhesion; ask about corners lifting.</li>
      <li>Over an overhang or island: it needed supports.</li>
      <li>Mid-print on a tall part: it got knocked over; add a brim or Z hop.</li></ul>
      <p>If the part is still stuck, <b>Continue from layer</b> can pick up where it went wrong.</p>`,
    actions: () => [{label: 'Open Continue from layer', run: 'resume'}],
  },
  // ---------------------------------------------------------------- filaments
  {
    id: 'wet_filament', title: 'Drying damp filament',
    words: ['wet:4', 'damp:4', 'moisture:4', 'dry:3', 'drying:3', 'dryer:3', 'popping:3', 'crackling:3', 'steam:2'],
    needs: ['wet', 'damp', 'moisture', 'dry', 'drying', 'dryer', 'popping', 'crackling', 'steam'],
    answer: () => `<p>Filament takes in water from the air. Damp filament pops and hisses at the nozzle, strings badly, comes out rough and weak, and snaps easily.</p>
      <p>Dry it in a filament dryer or a low oven: PLA at 45 to 50 °C, PETG 60 to 65 °C, ABS and ASA 70 to 80 °C, nylon and TPU 70 °C, for 4 to 8 hours. Store spools sealed with desiccant.</p>`,
  },
  {
    id: 'brittle_filament', title: 'Filament snaps on the spool',
    words: ['snaps:3', 'brittle filament:4', 'filament breaks:4', 'filament snapping:4', 'breaking filament:4', 'brittle:4'],
    needs: ['brittle filament', 'filament breaks', 'filament snapping', 'breaking filament', 'snaps', 'brittle'],
    answer: () => `<p>Old or damp PLA becomes brittle and snaps where it's bent, often inside the feed tube. Drying it helps a little; storing spools sealed helps most. Make sure the filament path has no sharp bends.</p>`,
  },
  {
    id: 'petg', title: 'Printing PETG',
    words: ['petg:5', 'pet-g:5'],
    needs: ['petg', 'pet-g'],
    answer: h => `<p>PETG is tougher than PLA and handles heat better, but strings more and sticks very hard to smooth PEI. Typical: nozzle 230 to 250 °C, bed 70 to 80 °C, fan 30 to 50%, slower than PLA.</p>
      <p>On a smooth PEI sheet use glue stick or a textured plate as a release layer, or it can tear the sheet. Dry it if it strings. The nozzle temperature is ${h.at('nozzle_temperature')}.</p>`,
  },
  {
    id: 'abs_asa', title: 'Printing ABS or ASA',
    words: ['abs:4', 'asa:4', 'enclosure:2', 'fumes:2'],
    needs: ['abs', 'asa', 'enclosure'],
    answer: () => `<p>ABS and ASA handle heat and sun far better than PLA but shrink as they cool, so large parts warp and split without an <b>enclosure</b> keeping the air warm. Typical: nozzle 240 to 260 °C, bed 90 to 110 °C, fan low or off, a brim on big parts, no draughts. They give off fumes: ventilate the room or filter the enclosure.</p>`,
  },
  {
    id: 'tpu', title: 'Printing flexible TPU',
    words: ['tpu:4', 'flexible:4', 'rubber:3', 'flex:3', 'soft filament:3'],
    needs: ['tpu', 'flexible', 'rubber', 'flex', 'soft filament'],
    answer: h => `<p>TPU is soft and buckles if pushed fast. Print slowly (about 20 to 30 mm/s, or a low ${h.at('filament_max_volumetric_speed')} of 3 to 5 mm³/s), with little or no retraction, at 220 to 240 °C. A direct-drive extruder helps a lot; through a long Bowden tube it's hard. Dry it first.</p>`,
    actions: () => [{label: 'Max flow 4 mm³/s', set: {filament_max_volumetric_speed: '4'}}],
  },
  {
    id: 'abrasive', title: 'Carbon fibre, glow-in-the-dark and other abrasive filaments',
    words: ['carbon fiber:4', 'carbon fibre:4', 'cf:3', 'glow:3', 'abrasive:4', 'hardened:3', 'wood:2', 'metal fill:3', 'glass fibre:3'],
    needs: ['carbon fiber', 'carbon fibre', 'cf', 'glow', 'abrasive', 'hardened', 'wood', 'metal fill', 'glass fibre'],
    answer: () => `<p>Filled filaments (carbon or glass fibre, glow-in-the-dark, metal) wear out a brass nozzle within a few hundred grams. Use a <b>hardened steel</b> nozzle and tell the printer settings you have one. A 0.6 mm nozzle clogs less with wood and fibre fills.</p>`,
  },
  {
    id: 'silk', title: 'Silk and matte PLA',
    words: ['silk:4', 'shiny pla:3', 'matte:3', 'satin:3'],
    needs: ['silk', 'matte', 'satin', 'shiny pla'],
    answer: h => `<p>Silk PLA looks best printed a little hotter and slower, and is weaker between layers than plain PLA, so it isn't for strong parts. Matte PLA hides layer lines well. Both print with standard PLA settings plus about 5 °C: ${h.at('nozzle_temperature')}.</p>`,
  },
  {
    id: 'add_filament', title: 'Adding a filament or making a custom filament profile',
    words: ['add filament:4', 'new filament:4', 'custom filament:4', 'filament profile:4', 'import filament:4', 'brand:2', 'spool:1'],
    needs: ['add filament', 'new filament', 'custom filament', 'filament profile', 'import filament', 'brand'],
    answer: () => `<p>Click the pencil or <b>+</b> next to the filament list in the sidebar to pick from the built-in brands. For your own: choose the closest generic profile, change its temperatures and flow in the filament settings, then <b>save</b> it under a new name with the save icon at the top of the settings. To bring in a profile file, use <b>File › Import › Import Configs</b>.</p>`,
  },
  {
    id: 'cost', title: 'How much filament and money a print takes',
    words: ['cost:4', 'price:3', 'filament usage:4', 'usage:2', 'grams:3', 'weight:2.5', 'meters:2', 'used:1'],
    needs: ['cost', 'price', 'filament usage', 'usage', 'grams', 'weight', 'meters'],
    patterns: [/\bhow much (filament|plastic|material)\b/i],
    answer: h => `<p>After slicing, the preview's summary lists the filament used in metres and grams for each filament, and the cost. For the cost to be right, set the spool price in ${h.at('filament_cost')} and the density in ${h.at('filament_density')} in the filament settings.</p>`,
    actions: () => [{label: 'Show filament cost', show: 'filament_cost'}],
  },
  // ---------------------------------------------------------------- calibration
  {
    id: 'calibrate', title: 'Calibrating a printer or filament',
    words: ['calibrate:5', 'calibration:4', 'tune:2', 'tuning:2', 'test print:2.5', 'dial in:3', 'temperature tower:5', 'temp tower:5'],
    needs: ['calibrate', 'calibration', 'tune', 'tuning', 'dial in', 'test print', 'temperature tower', 'temp tower'],
    answer: () => `<p>The <b>Calibration</b> menu prints test pieces and works out the settings. For a new filament, this order works best:</p>
      <ol><li><b>Temperature</b>: a tower at different temperatures; pick the best-looking band.</li>
      <li><b>Max flowrate</b>: how fast it can melt.</li>
      <li><b>Pressure advance</b>: sharp corners, no blobs.</li>
      <li><b>Flow rate</b>: just enough plastic.</li>
      <li><b>Retraction</b>: least stringing.</li></ol>
      <p>Each one says which setting to put the result in.</p>`,
  },
  {
    id: 'flow_ratio', title: 'Flow ratio (extrusion multiplier)',
    words: ['flow ratio:4', 'extrusion multiplier:4', 'flow:2', 'e-steps:3', 'esteps:3', 'calibrate flow:6', 'flow calibration:6'],
    needs: ['flow ratio', 'flow rate', 'extrusion multiplier', 'flow', 'e-steps', 'esteps', 'calibrate flow', 'flow calibration'],
    answer: h => `<p>${h.at('filament_flow_ratio')} scales how much plastic is pushed. Too high: lumpy tops and oversize parts. Too low: gaps. Use <b>Calibration › Flow rate</b>: it prints squares at different flows; pick the smoothest top and enter the number it gives. Different brands of the same plastic often differ by 5%.</p>`,
    actions: () => [{label: 'Show flow ratio', show: 'filament_flow_ratio'}],
  },
  {
    id: 'pressure_advance', title: 'Pressure advance',
    words: ['pressure advance:4', 'linear advance:4', 'k factor:3', 'pa:2'],
    needs: ['pressure advance', 'linear advance', 'k factor'],
    patterns: [/\bk[- ]?(value|factor)\b/i],
    answer: h => `<p>Plastic in the nozzle behaves like a spring: it lags when speeding up and keeps coming out when slowing down, giving thin starts and bulging corners. Pressure advance pushes ahead to cancel it. Run <b>Calibration › Pressure advance</b> and enter the result in ${h.at('pressure_advance')}, with ${h.at('enable_pressure_advance')} on. Typical values: 0.02 to 0.06 direct drive, 0.3 to 0.8 Bowden.</p>`,
    actions: () => [{label: 'Show pressure advance', show: 'pressure_advance'}],
  },
  {
    id: 'max_flow', title: 'Max volumetric speed (how fast plastic melts)',
    words: ['volumetric:4', 'max flow:4', 'flowrate:3', 'mm3:3', 'hot end limit:3', 'melt fast:3', 'flow rate:4', 'max flow rate:5'],
    needs: ['volumetric', 'max flow', 'flowrate', 'mm3', 'hot end limit', 'melt fast', 'flow rate', 'max flow rate'],
    answer: h => `<p>${h.at('filament_max_volumetric_speed')} is how many cubic millimetres of plastic per second the hot end can melt. The slicer slows down any move that would need more, so it's the real speed limit. Typical: 12 to 15 mm³/s for PLA on a standard hot end, 20 to 30 on high-flow ones. <b>Calibration › Max flowrate</b> measures yours.</p>`,
    actions: () => [{label: 'Show max flow', show: 'filament_max_volumetric_speed'}],
  },
  {
    id: 'retraction', title: 'Retraction',
    words: ['retraction:4', 'retract:4', 'pull back:3'],
    needs: ['retraction', 'retract', 'pull back'],
    answer: h => `<p>Retraction pulls the filament back before a travel move so the nozzle doesn't ooze. ${h.at('retraction_length')} and ${h.at('retraction_speed')} are in the printer settings. Direct drive: 0.4 to 1.5 mm. Bowden: 3 to 6 mm. Too much can jam the hot end. <b>Calibration › Retraction</b> prints a test tower.</p>`,
    actions: () => [{label: 'Show retraction length', show: 'retraction_length'}],
  },
  {
    id: 'tolerance_test', title: 'Testing how parts fit (tolerance)',
    words: ['tolerance test:5', 'tolerance:3', 'clearance:3', 'press fit:3', 'snug:2', 'print in place:2', 'hinge:2'],
    needs: ['tolerance test', 'tolerance', 'clearance', 'press fit', 'print in place', 'hinge'],
    answer: h => `<p>How much gap moving or slotting parts need depends on the printer: usually 0.15 to 0.3 mm per side. Print a small tolerance test before a big project. For print-in-place hinges, 0.3 to 0.4 mm. ${h.at('xy_hole_compensation')} and ${h.at('xy_contour_compensation')} adjust holes and outsides for the whole print.</p>`,
  },
  {
    id: 'shrinkage', title: 'Parts come out the wrong size',
    words: ['wrong size:4', 'too small:3', 'too big:2', 'shrink:3', 'shrinkage:4', 'dimensions:3', 'measure smaller:3', 'scale wrong:3'],
    needs: ['wrong size', 'shrink', 'shrinkage', 'dimensions', 'measure smaller', 'scale wrong'],
    patterns: [/\b\d+(\.\d+)?\s*% (too )?(small|smaller|big|bigger|large|off|undersized|oversized)\b/i],
    answer: h => `<p>If everything is off by the same percentage, it's shrinkage: set ${h.at('filament_shrink')} in the filament settings (about 99.5% for ABS). If only holes and outsides are off by a fixed amount, use ${h.at('xy_hole_compensation')} and ${h.at('xy_contour_compensation')}. If a model is 25 times too small or big, it was made in inches: scale it by 2540% or 3.937%.</p>`,
    actions: () => [{label: 'Show shrinkage', show: 'filament_shrink'}],
  },
  // ---------------------------------------------------------------- using the slicer
  {
    id: 'add_printer', title: 'Adding or changing the printer',
    words: ['add printer:4', 'new printer:4', 'printer profile:4', 'printer not listed:4', 'change printer:3', 'select printer:3'],
    needs: ['add printer', 'new printer', 'printer profile', 'printer not listed', 'change printer', 'select printer'],
    answer: () => `<p>Click the printer name at the top of the sidebar, then <b>Add/Remove printers</b> to choose from the built-in makers and models, with the right nozzle. If yours isn't listed, pick the closest model and change the bed size and start G-code in the printer settings, then save it under a new name.</p>`,
  },
  {
    id: 'save_preset', title: 'Saving settings as a preset',
    words: ['save settings:4', 'save preset:4', 'preset:3', 'profile:2', 'settings lost:3', 'unsaved:2', 'process profile:4', 'save profile:5', 'profile:1.5'],
    needs: ['save settings', 'save preset', 'preset', 'settings lost', 'unsaved', 'process profile', 'save profile', 'profile'],
    answer: () => `<p>Changed settings are shown in orange with an undo arrow until you save. Click the save icon next to the preset name, give it a name, and it appears in the list from then on. The settings also travel inside a saved project (.3mf), so opening the project brings them back.</p>`,
  },
  {
    id: 'reset_settings', title: 'Undoing a setting change or going back to defaults',
    words: ['reset:4', 'default:3', 'defaults:3', 'undo setting:3', 'revert:4', 'orange:2', 'original settings:3', 'undo:3'],
    needs: ['reset', 'default', 'defaults', 'revert', 'undo setting', 'original settings', 'undo'],
    answer: () => `<p>Each changed setting has an arrow icon beside it: click it to go back to the saved value. The arrow at the top of a settings page reverts the whole page. To start again from the maker's settings, pick the system preset (the one without your name) in the preset list.</p>`,
  },
  {
    id: 'per_object', title: 'Different settings for one object',
    words: ['per-object:4', 'different settings:6', 'separate settings:4', 'own settings:3', 'individual:2'],
    needs: ['per-object', 'different settings', 'separate settings', 'own settings', 'individual'],
    patterns: [/\b(only|just) (for |on )?(this|one|that|a single|the) (object|part|model)\b|\b(for|on) (one|this|a single) (object|model) only\b|\bone object\b/i],
    answer: () => `<p>In the object list, select the object and switch the settings panel from <b>Global</b> to <b>Objects</b> at the top of the Process section, or right-click the object and choose <b>Add settings</b>. Settings changed there apply to that object only; the rest of the plate keeps the global ones.</p>`,
  },
  {
    id: 'modifier', title: 'Changing settings in one area of a part (modifiers)',
    words: ['modifier:4', 'region:2', 'more infill here:4', 'height range:4', 'only the top:3', 'only the bottom:3'],
    needs: ['modifier', 'region', 'height range', 'more infill here', 'only the top', 'only the bottom'],
    patterns: [/\b(in|for|on) (one |a |this |some |that |the )?(part|area|section|region|spot|zone) of\b/i],
    answer: () => `<p>Right-click the object and choose <b>Add modifier</b> and a shape (box, cylinder...). Place and size it where you want different settings, then give it its own settings in the object list, for example more infill or more walls inside it. For a band of height, right-click and choose <b>Height range modifier</b>.</p>`,
  },
  {
    id: 'variable_layers', title: 'Variable layer height',
    words: ['variable layer:5', 'variable:2', 'adaptive layer:4', 'layer height curve:3', 'smooth curves:2', 'thinner where:3', 'adaptive:6'],
    needs: ['variable layer', 'adaptive layer', 'layer height curve', 'thinner where', 'adaptive'],
    answer: () => `<p>Select the object and click <b>Variable layer height</b> in the toolbar. <b>Adaptive</b> uses thin layers on curved and sloping areas and thick ones on straight sides, saving time where detail doesn't show. You can also paint thinner or thicker layers along the height by hand.</p>`,
  },
  {
    id: 'arrange', title: 'Arranging parts and using several plates',
    words: ['arrange:4', 'plates:3', 'plate:2', 'fit more:3', 'multiple objects:3', 'pack:3', 'spread out:3', 'overlap:2'],
    needs: ['arrange', 'plates', 'plate', 'fit more', 'multiple objects', 'pack', 'spread out', 'overlap'],
    answer: () => `<p>Press <b>A</b> or click <b>Arrange</b> in the toolbar to pack everything on the plate. If it doesn't fit, add a plate with the <b>+</b> plate button and arrange again; each plate slices and prints separately. Right-click an object to move it to another plate.</p>`,
  },
  {
    id: 'copies', title: 'Printing several copies',
    words: ['copies:4', 'copy:3', 'duplicate:4', 'multiple copies:4', 'instances:4', 'clone:3'],
    needs: ['copies', 'copy', 'duplicate', 'multiple copies', 'instances', 'clone'],
    answer: () => `<p>Select the object and press <b>+</b> to add a copy (<b>-</b> removes one), or right-click and choose <b>Clone</b> to set a number. Copies share settings and painting. Press <b>A</b> to arrange them.</p>`,
  },
  {
    id: 'scale', title: 'Scaling a model',
    words: ['scale:4', 'resize:4', 'bigger:1.5', 'smaller:1.5', 'size:2', 'percent:1.5', 'inches:3'],
    needs: ['scale', 'resize', 'bigger', 'smaller', 'inches'],
    patterns: [/\b(model|print|part|object|it|this)( is|'s)? (way )?too (small|tiny|big|large)\b/i, /\bmake (it|this|the model|the part|the object) (bigger|smaller|larger)\b/i],
    answer: () => `<p>Select the object and press <b>S</b>, or type sizes or a percentage in the object manipulation panel. Keep the lock on to scale evenly. A model that comes in tiny was likely made in inches: the app offers to convert it when loading, or scale by 2540%.</p>`,
  },
  {
    id: 'mirror', title: 'Mirroring a model',
    words: ['mirror:4', 'flip:3', 'left right:2', 'reverse:2', 'opposite side:3'],
    needs: ['mirror', 'flip', 'opposite side'],
    answer: () => `<p>Right-click the object and choose <b>Mirror</b>, then the axis. Handy for making the left and right versions of a part.</p>`,
  },
  {
    id: 'split', title: 'Splitting a model into objects or parts',
    // "split" reads as "cut" (see SAME), so this answer keys on bodies and assembling instead.
    words: ['bodies:4', 'separate bodies:4', 'several bodies:4', 'assemble:4', 'assembly:3', 'merge:3', 'join objects:3', 'to objects:2', 'separate objects:3'],
    needs: ['bodies', 'assemble', 'assembly', 'merge', 'join objects', 'separate objects'],
    answer: () => `<p>A file with several separate bodies can be split: right-click and choose <b>Split › To objects</b> (each moves and prints on its own) or <b>To parts</b> (they stay together but can have their own filament and settings). Select several objects and right-click <b>Assemble</b> to join them back into one.</p>`,
  },
  {
    id: 'vase', title: 'Vase mode (spiral, one wall)',
    words: ['vase:4', 'spiral:4', 'spiralize:4', 'single wall:3', 'hollow:2', 'cup:3', 'lamp shade:3'],
    needs: ['vase', 'spiral', 'cup', 'lamp shade', 'spiralize', 'single wall'],
    answer: h => `<p>${h.at('spiral_mode')} prints the outside as one continuous spiral with a solid bottom and no top, infill or seam. It's fast and good for vases, lamp shades and cups. The model must be a single solid shape, and the result is only one line thick, so use a wider line or a bigger nozzle for strength.</p>`,
    actions: () => [{label: 'Turn vase mode on', set: {spiral_mode: '1'}}, {label: 'Show the setting', show: 'spiral_mode'}],
  },
  {
    id: 'sequential', title: 'Printing objects one at a time',
    words: ['sequential:4', 'sequentially:4', 'separately:3', 'finish each:3', 'print sequence:4'],
    needs: ['sequential', 'sequentially', 'separately', 'finish each', 'print sequence'],
    patterns: [/\bone (at a time|by one|after (the )?other)\b/i],
    answer: h => `<p>Set ${h.at('print_sequence')} to <b>By object</b> to finish each object before starting the next. A failure then only ruins one, and there's less stringing between them. Objects must be far enough apart and lower than the print head's clearance, or the head hits them; the app warns if they're too close.</p>`,
    actions: () => [{label: 'Print by object', set: {print_sequence: 'by object'}}],
  },
  {
    id: 'pause', title: 'Pausing or changing colour at a layer',
    words: ['pause:4', 'colour change layer:4', 'change filament layer:4', 'insert:2', 'magnet:3', 'nut:2', 'embed:3', 'm600:4', 'mid:2', 'midway:2', 'change filament:3', 'swap filament:3', 'colour height:5'],
    needs: ['pause', 'colour change layer', 'change filament layer', 'magnet', 'embed', 'm600', 'nut', 'mid', 'midway', 'change filament', 'swap filament', 'colour height'],
    answer: () => `<p>Slice, then in the preview drag the layer slider to the layer you want. Click the <b>+</b> on the slider and choose <b>Add pause</b> (to drop in a magnet or nut) or <b>Change filament</b> (for a new colour from that layer up). The printer stops there and waits for you.</p>`,
  },
  {
    id: 'text_emboss', title: 'Adding text or a logo to a model',
    words: ['add text:4', 'emboss:4', 'engrave:4', 'logo:3', 'name on:1.5', 'svg:3', 'label:2', 'write text:5', 'write:2'],
    needs: ['add text', 'emboss', 'engrave', 'logo', 'name on', 'svg', 'write text', 'write'],
    answer: () => `<p>Right-click the object and choose <b>Add part › Text</b> to raise text, or <b>Add negative part › Text</b> to cut it in. Click on the surface to place it; it bends to follow curves. For a logo, use <b>SVG</b> in the same menu. Each can have its own filament for colour.</p>`,
  },
  {
    id: 'measure', title: 'Measuring a model',
    words: ['measure:4', 'distance:3', 'dimension:2', 'ruler:3', 'how big:1'],
    needs: ['measure', 'distance', 'ruler', 'how big'],
    patterns: [/\bhow (big|large|tall|wide|long) is\b/i],
    answer: () => `<p>Select the object and press <b>U</b> for the measure tool: click two points, edges or faces to get the distance or angle between them. The object's overall size is in the box at the bottom right of the 3D view.</p>`,
  },
  {
    id: 'repair', title: 'Repairing a broken model',
    words: ['repair:4', 'fix model:1', 'errors:1.5', 'non manifold:4', 'broken model:2', 'holes in mesh:4', 'warning triangle:3', 'mesh:2'],
    needs: ['repair', 'fix model', 'errors', 'non manifold', 'broken model', 'holes in mesh', 'warning triangle', 'mesh'],
    answer: () => `<p>A warning icon beside an object in the list means its mesh has holes or flipped faces. Right-click it and choose <b>Fix model</b>. If parts still slice wrongly, open the model in a mesh editor (Blender, Meshmixer) or re-export it from where it was made.</p>`,
  },
  {
    id: 'import', title: 'Which files can be opened',
    words: ['file type:4', 'step:3', 'stp:3', 'obj:3', 'stl:3', '3mf:3', 'import:3', 'open file:3', 'format:3'],
    needs: ['file type', 'step', 'stp', 'obj', 'stl', '3mf', 'import', 'open file', 'format'],
    answer: () => `<p>Drag a file onto the plate or use <b>File › Import</b>. STL and OBJ are meshes. <b>3MF</b> keeps colours, settings and several plates, so save projects as 3MF. <b>STEP</b> from CAD programs is turned into a mesh on import, which gives the smoothest curves.</p>`,
  },
  {
    id: 'preview', title: 'Reading the preview after slicing',
    words: ['preview:4', 'line type:3', 'colours preview:2', 'legend:3', 'layer slider:3', 'check print:1'],
    needs: ['preview', 'line type', 'legend', 'layer slider'],
    patterns: [/\b(see|view|check|look at|go through) (each|every|all the|the) layers?\b/i],
    answer: () => `<p>After <b>Slice plate</b>, the preview shows every line the printer will lay. Drag the slider on the right to go through layers, and the one at the bottom to play a layer move by move. The menu at the top left colours lines by type, speed, flow or fan; the legend lists time and filament for each.</p>
      <p>Look for red overhangs, missing thin parts and floating islands before printing.</p>`,
  },
  {
    id: 'print_time', title: 'Print time estimate is wrong',
    words: ['time estimate:4', 'estimate wrong:4', 'takes longer:3', 'time wrong:4', 'eta:3'],
    needs: ['time estimate', 'estimate wrong', 'takes longer', 'time wrong', 'eta'],
    patterns: [/\bhow long (will|does|would|is)\b/i],
    answer: h => `<p>The estimate uses the machine limits in the printer settings (maximum speeds and accelerations). If they're higher than what the printer really does, prints take longer than shown. Set them to match the printer's firmware. The time is listed in the preview after slicing.</p>`,
  },
  {
    id: 'slice_errors', title: 'Errors when slicing',
    words: ['slice error:4', 'error:3', 'cannot slice:4', 'outside plate:5', 'outside:1', 'empty layer:4', 'floating:3', 'warning:2', 'slicing failed:4'],
    needs: ['slice error', 'error', 'cannot slice', 'empty layer', 'floating', 'slicing failed', 'outside plate'],
    answer: () => `<p>Read the message at the bottom of the 3D view; most mean one of these:</p>
      <ul><li><b>Outside the printable area:</b> move or scale the object, or a prime tower or brim pushes past the edge.</li>
      <li><b>Empty layers / floating:</b> part of the model starts in mid-air; add supports or lay it flat.</li>
      <li><b>Mesh errors:</b> right-click the object, <b>Fix model</b>.</li>
      <li><b>Collision</b> when printing by object: move objects apart.</li></ul>`,
  },
  {
    id: 'prime_tower_outside', title: 'Prime tower outside the printable area',
    words: ['prime tower outside:4', 'tower outside:4', 'wipe tower position:3', 'move tower:4', 'tower partially:4', 'outside:4', 'purge tower outside:6'],
    needs: ['prime tower outside', 'tower outside', 'move tower', 'tower partially', 'wipe tower position', 'purge tower outside'],
    answer: h => `<p>Drag the tower on the plate to a free spot, or set ${h.at('wipe_tower_x')} so it sits inside the bed. A smaller ${h.at('prime_tower_width')} helps on small beds.</p>`,
    actions: () => [{label: 'Show tower position', show: 'wipe_tower_x'}],
  },
  {
    id: 'support_paint', title: 'Supports only where you want them',
    words: ['support paint:4', 'paint support:4', 'support blocker:4', 'support enforcer:4', 'block support:4', 'no support here:4'],
    needs: ['support paint', 'paint support', 'support blocker', 'support enforcer', 'block support', 'no support here'],
    answer: h => `<p>Select the object and press <b>L</b> for support painting. Paint in green to add support, red to block it. With ${h.at('support_type')} set to a <b>manual</b> type, supports go only where painted; with an auto type, the painting adds to or removes from what the app picks. You can also right-click and add a <b>Support blocker</b> or <b>enforcer</b> shape.</p>`,
    actions: () => [{label: 'Tree, painted only', set: {enable_support: '1', support_type: 'tree(manual)'}}],
  },
  {
    id: 'bridges', title: 'Bridges (flat spans over gaps)',
    words: ['bridge:4', 'span:3', 'flat roof:3', 'ceiling:3'],
    needs: ['bridge', 'span', 'flat roof', 'ceiling'],
    answer: h => `<p>A bridge is plastic stretched across a gap between two supports. Short ones (up to 20 to 40 mm) print without support if cooled well. Settings: ${h.at('bridge_speed')} (slower is not always better; 25 to 50 mm/s), ${h.at('bridge_flow')} (a bit under 1 makes them tauter) and ${h.at('thick_bridges')}. Full fan helps most.</p>`,
    actions: () => [{label: 'Show bridge flow', show: 'bridge_flow'}],
  },
  {
    id: 'top_pattern', title: 'Top surface pattern',
    words: ['top surface pattern:4', 'top pattern:4', 'monotonic:4', 'concentric top:3', 'top looks:2'],
    needs: ['top surface pattern', 'top pattern', 'monotonic', 'concentric top'],
    answer: h => `<p>${h.at('top_surface_pattern')} sets how the visible top is filled. <b>Monotonic</b> lays every line the same way, giving an even sheen. <b>Concentric</b> follows the outline (nice on round tops), and <b>Hilbert curve</b> or <b>Archimedean chords</b> are decorative. The bottom has its own: ${h.at('bottom_surface_pattern')}.</p>`,
    actions: () => [{label: 'Monotonic', set: {top_surface_pattern: 'monotonic'}}],
  },
  {
    id: 'wall_order', title: 'Which wall prints first',
    words: ['wall order:4', 'outer first:4', 'inner first:4', 'wall sequence:4', 'inner outer:3', 'wall first:4', 'prints first:3'],
    needs: ['wall order', 'outer first', 'inner first', 'wall sequence', 'inner outer', 'wall first', 'prints first'],
    answer: h => `<p>${h.at('wall_sequence')}: <b>inner then outer</b> (the default) supports the outer wall from inside, best for overhangs. <b>Outer then inner</b> gives more accurate outsides and hides infill, but overhangs suffer. <b>Inner-outer-inner</b> is a middle way.</p>`,
  },
  {
    id: 'cooling', title: 'Part cooling fan',
    words: ['fan:4', 'cooling:4', 'cool:2', 'fan speed:4', 'airflow:3'],
    needs: ['fan', 'cooling', 'cool', 'fan speed', 'airflow'],
    answer: h => `<p>Fan settings are in the filament settings. PLA wants full fan after the first layers (${h.at('fan_max_speed')}); PETG about 30 to 50%; ABS and ASA little or none. ${h.at('close_fan_the_first_x_layers')} keeps it off for the first layers for better bed grip. Overhangs and bridges get ${h.at('overhang_fan_speed')}.</p>`,
    actions: () => [{label: 'Show fan speed', show: 'fan_max_speed'}],
  },
  {
    id: 'travel', title: 'Travel moves and stringing across the part',
    words: ['travel:4', 'crossing walls:4', 'combing:4', 'avoid walls:3', 'moves:2'],
    needs: ['travel', 'crossing walls', 'combing', 'avoid walls'],
    answer: h => `<p>${h.at('reduce_crossing_wall')} routes travel moves inside the part so any ooze stays hidden. ${h.at('z_hop')} lifts the nozzle over the print, and ${h.at('travel_speed')} sets how fast it moves; faster travel means less time to ooze.</p>`,
    actions: () => [{label: 'Avoid crossing walls', set: {reduce_crossing_wall: '1'}}],
  },
  {
    id: 'timelapse', title: 'Timelapse videos',
    words: ['timelapse:4', 'time lapse:4', 'video:3', 'camera:2'],
    needs: ['timelapse', 'time lapse', 'video'],
    answer: h => `<p>${h.at('timelapse_type')} set to <b>Smooth</b> parks the head out of the way for a photo each layer, giving a steady video (it needs a prime tower, and adds time). <b>Traditional</b> takes the photo wherever the head is.</p>`,
  },
  {
    id: 'bed_type', title: 'Bed plate type and bed temperature',
    words: ['bed type:4', 'plate type:4', 'pei:3', 'smooth plate:3', 'glass:3', 'bed temperature:4', 'bed temp:4', 'plate temperature:5', 'plate temp:5'],
    needs: ['bed type', 'plate type', 'pei', 'smooth plate', 'glass', 'bed temperature', 'bed temp', 'plate temperature', 'plate temp'],
    answer: h => `<p>Choose the plate you have on with the plate type at the top of the plate settings. The bed temperature comes from the filament for that plate type: ${h.at('hot_plate_temp')}, ${h.at('textured_plate_temp')}, ${h.at('cool_plate_temp')}. Textured PEI releases parts easily once cool; smooth PEI gives a glossy bottom.</p>`,
  },
  {
    id: 'shortcuts', title: 'Keyboard shortcuts',
    words: ['shortcut:4', 'shortcuts:4', 'hotkey:4', 'keyboard:3', 'keys:2'],
    needs: ['shortcut', 'shortcuts', 'hotkey', 'keyboard'],
    answer: () => `<p>The most used: <b>A</b> arrange, <b>R</b> rotate, <b>S</b> scale, <b>M</b> move, <b>F</b> lay on face, <b>C</b> cut, <b>L</b> support painting, <b>P</b> seam painting, <b>N</b> colour painting, <b>U</b> measure, <b>+</b>/<b>-</b> copies, <b>Delete</b> remove, <b>0</b> to <b>6</b> camera views. <b>?</b> or Help › Keyboard Shortcuts lists them all.</p>`,
  },
  {
    id: 'connect_printer', title: 'Connecting to the printer',
    words: ['connect printer:4', 'connection:3', 'network:3', 'ip address:4', 'not connecting:4', 'printer offline:4', 'device:2', 'lan:3', 'wifi:4', 'wi-fi:4', 'wireless:4'],
    needs: ['connect printer', 'connection', 'network', 'ip address', 'not connecting', 'printer offline', 'lan', 'wifi', 'wi-fi', 'wireless'],
    answer: () => `<p>Open the <b>Device</b> tab, or the connection icon next to the printer name, and enter the printer's IP address (shown on its screen under network settings). The computer and printer must be on the same network. If sending fails, check the printer's LAN mode is on and nothing (VPN, firewall) blocks it.</p>`,
  },
  {
    id: 'support_less', title: 'Using less support material',
    words: ['less support:4', 'too much support:4', 'support waste:4', 'reduce support:4', 'support everywhere:3', 'less filament:3', 'use less:3', 'save filament:3'],
    needs: ['less support', 'too much support', 'support waste', 'reduce support', 'support everywhere', 'less filament', 'use less', 'save filament'],
    answer: h => `<p>Turn the part so fewer surfaces hang over (press <b>F</b> and try faces), use <b>Tree</b> supports (${h.at('support_type')}), and raise ${h.at('support_threshold_angle')} so only steeper overhangs get support (30 to 45°). Supports only from the bed: ${h.at('support_on_build_plate_only')}.</p>`,
    actions: () => [{label: 'Tree supports', set: {support_type: 'tree(auto)'}}, {label: 'Show the angle', show: 'support_threshold_angle'}],
  },
  {
    id: 'multi_assign', title: 'Choosing which filament prints which part',
    words: ['assign filament:4', 'second colour:3', 'different colour:3', 'extruder:1', 'different filament:5', 'filament each:4'],
    needs: ['assign filament', 'second colour', 'different colour', 'extruder', 'different filament', 'filament each'],
    patterns: [/\bwhich (extruder|filament|nozzle|colou?r) (prints|for|does|is used)\b/i],
    answer: () => `<p>In the object list, click the filament number beside an object or part and choose another. A whole object takes one filament; for areas within it, paint with <b>N</b>. Split a model into parts first (right-click, <b>Split › To parts</b>) to give each piece its own filament.</p>`,
  },
  {
    id: 'speed_settings', title: 'Speed settings and why the printer is slower than set',
    words: ['speed setting:4', 'slower than set:4', 'not reaching speed:4', 'wall speed:3', 'infill speed:3', 'acceleration:3'],
    needs: ['speed setting', 'slower than set', 'not reaching speed', 'wall speed', 'infill speed', 'acceleration'],
    answer: h => `<p>Each kind of line has its own speed: ${h.at('outer_wall_speed')}, ${h.at('inner_wall_speed')}, ${h.at('sparse_infill_speed')}. The printer often won't reach them because the filament's ${h.at('filament_max_volumetric_speed')} caps the flow, small layers slow down to cool (${h.at('slow_down_layer_time')}), and short moves never get up to speed with the set ${h.at('default_acceleration')}.</p>`,
  },
  {
    id: 'staggered', title: 'Staggered seams and brick layers',
    words: ['staggered:4', 'brick layer:4', 'brick:3', 'interlock:3'],
    needs: ['staggered', 'brick layer', 'brick', 'interlock'],
    answer: h => `<p>${h.at('staggered_inner_seams')} moves the start of inner walls around so their seams don't line up, making walls a little stronger. True "brick layers" (alternate walls offset by half a layer) aren't in this version.</p>`,
  },
  {
    id: 'gap_fill', title: 'Gap fill (thin lines filling small spaces)',
    words: ['gap fill:4', 'gapfill:4', 'small gaps:3', 'zig zag:3', 'squiggles:3'],
    needs: ['gap fill', 'gapfill', 'small gaps', 'zig zag', 'squiggles'],
    answer: h => `<p>Gap fill prints thin zig-zag lines in spaces too small for a full wall. If it looks messy or slow, raise ${h.at('filter_out_gap_fill')} to skip tiny ones, or switch ${h.at('wall_generator')} to <b>Arachne</b>, which varies wall width instead and needs much less gap fill.</p>`,
    actions: () => [{label: 'Use Arachne walls', set: {wall_generator: 'arachne'}}],
  },
);
