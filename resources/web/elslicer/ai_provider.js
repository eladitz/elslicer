// The panel where an assistant's AI service is chosen: the service, its API key and the model.
// The app keeps the choice (ElslicerAI.cpp); keys go to the Mac's Keychain and never come back to the page.
//
//   const panel = AIProvider.mount(element, {post, onChange});
//   in window.fromApp: if (panel.handle(message)) return;
// onChange(settings) runs whenever the app sends the settings, with settings.usable saying whether it can be used now.
(function (root) {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

  function mount(el, {post, onChange}) {
    let settings = null, models = {}, apple = null, picked = null;

    el.innerHTML = `
      <div class="field"><label>AI service</label><select data-r="provider"></select></div>
      <p class="muted" data-r="note"></p>
      <div class="field" data-r="urlRow"><label>Address</label><input data-r="url" type="text" placeholder="https://example.com/v1" autocomplete="off"></div>
      <div class="field" data-r="keyRow"><label>API key</label>
        <div class="row" style="display:flex;gap:8px;align-items:center">
          <input data-r="key" type="password" autocomplete="off" style="flex:1">
          <button data-r="forget" type="button">Remove key</button>
        </div>
      </div>
      <div class="field" data-r="modelRow"><label>Model</label>
        <div class="row" style="display:flex;gap:8px;align-items:center">
          <select data-r="modelList" style="flex:1"></select>
          <input data-r="model" type="text" list="aiModels" placeholder="Model name" autocomplete="off" style="flex:1">
          <datalist id="aiModels"></datalist>
          <button data-r="list" type="button">List models</button>
        </div>
      </div>
      <p class="note warn hidden" data-r="error"></p>
      <div style="display:flex;gap:8px;margin-top:10px"><button class="primary" data-r="save" type="button">Use this</button></div>`;
    const r = name => el.querySelector(`[data-r="${name}"]`);

    const current = () => settings && settings.providers.find(p => p.id === r('provider').value);
    function error(text) { r('error').textContent = text || ''; r('error').classList.toggle('hidden', !text); }

    function draw() {
      const p = current();
      if (!p) return;
      const chosen = settings.choice.provider === p.id;
      let note = p.note;
      if (p.kind === 'apple' && apple) note = apple.ok ? p.note : apple.reason;
      r('note').textContent = note;
      r('urlRow').classList.toggle('hidden', !p.custom_url);
      r('keyRow').classList.toggle('hidden', p.kind === 'apple' || (!p.needs_key && !p.custom_url));
      r('key').placeholder = p.has_key ? 'A key is saved. Paste a new one to replace it.' : p.needs_key ? 'Paste your API key' : 'Only if the service needs one';
      r('forget').classList.toggle('hidden', !p.has_key);
      r('modelRow').classList.toggle('hidden', p.kind === 'apple');
      const fixed = p.models && p.models.length;
      r('modelList').classList.toggle('hidden', !fixed);
      r('model').classList.toggle('hidden', !!fixed);
      r('list').classList.toggle('hidden', !!fixed);
      if (fixed) {
        r('modelList').innerHTML = p.models.map(m => `<option value="${esc(m.id)}">${esc(m.label)}</option>`).join('');
        if (chosen && p.models.some(m => m.id === settings.choice.model)) r('modelList').value = settings.choice.model;
      } else {
        if (picked !== p.id) r('model').value = chosen ? settings.choice.model : '';
        r('url').value = chosen ? settings.choice.base_url : r('url').value;
        document.getElementById('aiModels').innerHTML = (models[p.id] || []).map(m => `<option value="${esc(m)}">`).join('');
      }
      picked = p.id;
      if (p.kind === 'apple' && !apple) post({cmd: 'ai_apple_status'});
    }

    r('provider').onchange = () => { error(''); draw(); };
    r('forget').onclick = () => post({cmd: 'ai_forget_key', provider: r('provider').value});
    r('list').onclick = () => {
      error('');
      r('list').disabled = true;
      post({cmd: 'ai_models', provider: r('provider').value, base_url: r('url').value.trim(), key: r('key').value.trim()});
    };
    r('save').onclick = () => {
      const p = current();
      if (!p) return;
      const model = p.kind === 'apple' ? 'on-device' : p.models && p.models.length ? r('modelList').value : r('model').value.trim();
      if (p.kind !== 'apple' && !model) return error('Choose a model first. "List models" shows what this service has.');
      if (p.custom_url && !r('url').value.trim()) return error('Enter the service\'s address first.');
      if (p.needs_key && !p.has_key && !r('key').value.trim()) return error('Paste an API key first.');
      post({cmd: 'ai_save', provider: p.id, model, base_url: r('url').value.trim(), key: r('key').value.trim()});
      r('key').value = '';
    };

    function handle(message) {
      if (message.type === 'ai_settings') {
        settings = message;
        r('provider').innerHTML = settings.providers.map(p => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('');
        r('provider').value = settings.choice.provider;
        picked = null;
        error(message.error || '');
        draw();
        if (onChange) onChange(settings);
        return true;
      }
      if (message.type === 'ai_models') {
        r('list').disabled = false;
        if (message.error) error(message.error);
        else { models[message.provider] = message.models; error(''); draw(); r('model').focus(); }
        return true;
      }
      if (message.type === 'ai_apple_status') {
        apple = message;
        draw();
        if (onChange && settings) onChange(settings);
        return true;
      }
      return false;
    }
    post({cmd: 'ai_settings'});
    return {handle, get settings() { return settings; }, get apple() { return apple; }};
  }

  root.AIProvider = {mount};
})(window);
