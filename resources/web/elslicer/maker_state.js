// Last state, Undo and Defaults for a maker page. Load it after the page's own script.
//
// The page keeps its settings in a global `p` and redraws with a global `update()`, like every Elslicer maker.
// A page with settings elsewhere too declares `MAKER_STATE_EXTRA = {get: () => value, set: value => {...}}`.
// What is kept: p, the extra, and the values of the page's inputs (text, checkboxes, choices, sliders), so the
// controls show what was restored. Pictures are not kept: they are too big for a maker's saved values.
//
// The state is saved with the maker's own values (store_set "last") a moment after each change, and given back
// when the maker opens (the "store" message), so it opens as it was left. Undo steps back through the last ten
// changes and Redo forward again; Defaults puts back what the page starts with, and can itself be undone. The
// buttons sit in the page's top right corner; Cmd or Ctrl+Z undoes, Shift+Cmd+Z, Cmd+Y or Ctrl+Y redoes.
(() => {
  const STEPS = 10, QUIET = 500, send = m => { if (window.wx && window.wx.postMessage) window.wx.postMessage(JSON.stringify(m)); };
  const clone = v => JSON.parse(JSON.stringify(v));
  const extra = () => (typeof MAKER_STATE_EXTRA !== 'undefined' ? MAKER_STATE_EXTRA : null);

  // Each input by its id, or by where it is: the nearest section with an id, its row's label, and its place in the row.
  function key(el) {
    if (el.id) return '#' + el.id;
    const row = el.closest('.slider, .row, label, div') || el.parentNode, section = el.closest('[id]');
    const label = row.querySelector('label') ? row.querySelector('label').textContent.trim() : '';
    const same = [...row.querySelectorAll(el.tagName)].indexOf(el);
    return `${section ? section.id : ''}/${label}/${el.type || el.tagName}/${same}`;
  }
  const inputs = () => [...document.querySelectorAll('input, select, textarea')].filter(el => el.type !== 'file' && el.type !== 'button');
  function snapshot() {
    const dom = {};
    for (const el of inputs()) dom[key(el)] = el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value;
    const x = extra();
    return clone({p, dom, extra: x ? x.get() : null});
  }
  function restore(s) {
    if (!s || !s.p) return;
    for (const k of Object.keys(s.p)) if (k in p) p[k] = s.p[k];
    for (const el of inputs()) {
      const v = s.dom ? s.dom[key(el)] : undefined;
      if (v === undefined) continue;
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!v; else el.value = v;
    }
    const x = extra();
    if (x && s.extra != null) x.set(clone(s.extra));
  }

  let steps = [], undone = [], restoring = false, timer = 0, ready = false;
  const defaults = snapshot(), same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function record() {
    if (restoring || !ready) return;
    const now = snapshot();
    if (steps.length && same(steps[steps.length - 1], now)) return;
    steps.push(now);
    undone = [];
    if (steps.length > STEPS + 1) steps.shift();
    const text = JSON.stringify(now);
    if (text.length < 400000) send({cmd: 'store_set', key: 'last', value: now});
    draw();
  }
  function go(s) {
    restoring = true;
    try { restore(s); update(); } finally { restoring = false; }
    draw();
    clearTimeout(timer);
    // The page redraws a moment later; record then, so what the restore changed is part of this step.
    timer = setTimeout(() => { const now = snapshot(); steps[steps.length - 1] = now; send({cmd: 'store_set', key: 'last', value: now}); draw(); }, QUIET);
  }
  function undo() {
    if (steps.length < 2) return;
    undone.push(steps.pop());
    go(steps[steps.length - 1]);
  }
  function redo() {
    if (!undone.length) return;
    steps.push(undone.pop());
    go(steps[steps.length - 1]);
  }
  function reset() {
    undone = [];
    steps.push(clone(defaults));
    if (steps.length > STEPS + 1) steps.shift();
    go(defaults);
  }

  // Every change goes through update(); a step is recorded once the changes stop for a moment.
  const pageUpdate = window.update;
  window.update = function (...args) {
    const out = pageUpdate.apply(this, args);
    if (!restoring) { clearTimeout(timer); timer = setTimeout(record, QUIET); }
    return out;
  };

  // The saved state arrives with the maker's other values when it opens.
  const pageFromApp = window.fromApp;
  window.fromApp = message => {
    if (message && message.type === 'store') {
      const last = message.data && message.data.last;
      if (last && !ready) { restoring = true; try { restore(last); update(); } finally { restoring = false; } }
      ready = true;
      steps = [snapshot()];
      draw();
    }
    if (pageFromApp) pageFromApp(message);
  };
  // Outside Elslicer (a browser) there is no store: start recording straight away.
  if (!(window.wx && window.wx.postMessage)) setTimeout(() => { if (!ready) { ready = true; steps = [snapshot()]; draw(); } }, 0);

  // The buttons, in the page's top right corner, where they are always in view.
  const style = document.createElement('style');
  style.textContent = `.maker-state { position: fixed; top: 10px; right: 14px; z-index: 50; display: flex; gap: 4px; padding: 4px;
      background: rgba(24, 25, 28, .88); border: 1px solid var(--line, #33353a); border-radius: 8px; }
    .maker-state button { padding: 4px 10px; font-size: 12px; }
    .maker-state button:disabled { opacity: .4; }
    .footer.maker-footer { position: fixed; left: 14px; bottom: 12px; z-index: 50; margin: 0; padding: 6px; gap: 8px;
      background: rgba(24, 25, 28, .92); border: 1px solid var(--line, #33353a); border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, .4); }`;
  document.head.appendChild(style);
  // Cancel and Add to plate float in the bottom left corner, always in view; whatever scrolls behind them gets room
  // at its end so its last controls can still be scrolled clear of them.
  const footer = document.querySelector('.footer');
  if (footer) {
    footer.classList.add('maker-footer');
    let scroller = footer.parentElement;
    while (scroller && scroller !== document.body && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    (scroller || document.body).style.paddingBottom = (footer.offsetHeight + 24) + 'px';
  }
  const box = document.createElement('div');
  box.className = 'maker-state';
  box.innerHTML = '<button type="button" title="Back one change (⌘Z or Ctrl+Z), up to ten">↶ Undo</button>' +
    '<button type="button" title="Forward again (⇧⌘Z, ⌘Y or Ctrl+Y)">↷ Redo</button>' +
    '<button type="button" title="Back to how this maker starts; Undo brings your design back">Defaults</button>';
  const [undoButton, redoButton, resetButton] = box.querySelectorAll('button');
  undoButton.onclick = undo;
  redoButton.onclick = redo;
  resetButton.onclick = reset;
  document.body.appendChild(box);
  function draw() {
    undoButton.disabled = steps.length < 2;
    redoButton.disabled = !undone.length;
    resetButton.disabled = !steps.length || same(steps[steps.length - 1], defaults);
  }
  draw();
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !/^(range|checkbox|radio|button)$/.test(e.target.type);
    if (!(e.metaKey || e.ctrlKey) || e.altKey || typing) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
  });
})();
