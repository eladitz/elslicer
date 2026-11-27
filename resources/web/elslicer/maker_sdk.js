// Elslicer maker SDK, API 1. Paste or include this in a maker page; it is the whole contract with the app.
//
// A maker is a web page that designs a model from a few choices and adds it to the plate. Elslicer opens it in a
// window and the two talk through small JSON messages. Units are millimetres; z is up and the bed is z = 0.
//
//   Elslicer.onPrinter(p => ...)    p = {bed: [w, d], height, layer, api, maker: {id, version}}, sent once at start
//   Elslicer.pickImage()            -> Promise<{name, data}> or rejects; data is a data: URL (JPEG, at most 2000 px)
//   Elslicer.add(objects)           objects = [{name, parts: [{name, extruder?, sheets}]}]; closes the window
//   Elslicer.close()
//   Elslicer.store.get(key)         this maker's own saved values (JSON), kept between sessions in Elslicer
//   Elslicer.store.set(key, value)  value null forgets it; at most 1 MB in all
//   Elslicer.ai({system, prompt, schema, name?, description?, max_tokens?})
//                                   -> Promise<{answer, provider}>; needs "ai" in maker.json permissions. Asks the
//                                   AI service the user chose in AI Setup (billed by that service) and returns an
//                                   answer matching the JSON schema. The user confirms the first use.
//   Elslicer.sheet(nu, nv, wrap, (i, j, front) => [x, y, z])
//                                   a closed solid from a grid of front and back points; where front and back meet
//                                   the solid has no thickness and is left out. wrap joins the last column to the first.
//
// Outside Elslicer (a plain browser) the calls do nothing and onPrinter gets a 256 x 256 x 256 printer, so a page
// can be built and tried in any browser.
const Elslicer = (() => {
  const inApp = !!(window.wx && window.wx.postMessage);
  const post = message => { if (inApp) window.wx.postMessage(JSON.stringify(message)); };
  let printerFn = null, printer = null, store = {}, imageWait = null, next = 0;
  const aiWait = new Map(), handlers = [];

  const previous = window.fromApp;
  window.fromApp = message => {
    if (message.type === 'printer') { printer = message; if (printerFn) printerFn(printer); }
    else if (message.type === 'store') store = message.data || {};
    else if (message.type === 'image' && imageWait) {
      const w = imageWait; imageWait = null;
      message.error ? w.reject(new Error(message.error)) : message.data ? w.resolve({name: message.name, data: message.data}) : w.reject(new Error('cancelled'));
    } else if (message.type === 'ai' && aiWait.has(message.id)) {
      const w = aiWait.get(message.id); aiWait.delete(message.id);
      message.error ? w.reject(new Error(message.error)) : w.resolve({answer: message.answer, provider: message.provider});
    }
    for (const h of handlers) h(message);
    if (previous) previous(message);
  };

  function base64(floats) {
    const bytes = new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength);
    let text = '';
    for (let k = 0; k < bytes.length; k += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
    return btoa(text);
  }

  function sheet(nu, nv, wrap, at) {
    const pos = new Float32Array(2 * nu * nv * 3);
    for (let side = 0; side < 2; ++side)
      for (let j = 0; j < nv; ++j)
        for (let i = 0; i < nu; ++i) pos.set(at(i, j, side === 0), 3 * (side * nu * nv + j * nu + i));
    return {nu, nv, wrap, pos};
  }

  const api = {
    api: 1,
    inApp,
    onPrinter(fn) { printerFn = fn; if (printer) fn(printer); else if (!inApp) fn(printer = {bed: [256, 256], height: 256, layer: 0.2, api: 1, maker: {}}); },
    onMessage(fn) { handlers.push(fn); },
    pickImage() { return new Promise((resolve, reject) => { imageWait = {resolve, reject}; post({cmd: 'pick_image'}); }); },
    add(objects) {
      post({cmd: 'add', objects: objects.map(o => ({name: o.name, parts: o.parts.filter(p => p.sheets.length).map(p => ({
        name: p.name, ...(p.extruder ? {extruder: p.extruder} : {}),
        sheets: p.sheets.map(s => ({nu: s.nu, nv: s.nv, wrap: !!s.wrap, pos: base64(s.pos instanceof Float32Array ? s.pos : new Float32Array(s.pos))}))}))}))});
    },
    close() { post({cmd: 'close'}); },
    store: {
      get: key => store[key],
      set(key, value) { if (value === null || value === undefined) delete store[key]; else store[key] = value; post({cmd: 'store_set', key, value: value ?? null}); },
    },
    ai({system = '', prompt, schema, name = 'answer', description = 'The answer.', max_tokens = 2000}) {
      if (!inApp) return Promise.reject(new Error('Only inside Elslicer'));
      const id = 'sdk' + ++next;
      return new Promise((resolve, reject) => { aiWait.set(id, {resolve, reject}); post({cmd: 'ai', id, system, prompt, schema, name, description, max_tokens}); });
    },
    sheet,
  };
  if (inApp) setTimeout(() => post({cmd: 'ready'}), 0);
  return api;
})();
