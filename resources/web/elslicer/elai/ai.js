// Elai with an AI: Elai looks up the written answers and settings closest to the question, and the AI answers from
// those, with the conversation so far. The look-up keeps a small model accurate and keeps the request short.
//
// Plain functions on globalThis.ElaiAI, so the same file runs in the app's page and in Node for testing.
(function (root) {
  const INSTRUCTIONS = [
    'You are Elai, the assistant inside Elslicer, a 3D printing slicer based on OrcaSlicer.',
    'Elslicer looked up the reference items below for the user\'s latest message. Each has an id and says what it is about.',
    'Choose the one item that answers what the user wants. Use the conversation so far to tell what "it", "that" or "no, I mean..." refers to:',
    'a message starting with "no" means the earlier answer was wrong, so choose a different item.',
    'Prefer a topic over a setting unless the user names that setting.',
    'Choose none if no item fits, or if the message is small talk or thanks.',
  ].join(' ');

  const plain = html => String(html || '').replace(/<li>/g, '\n- ').replace(/<\/(p|ul|ol|h2)>/g, '\n').replace(/<[^>]*>/g, '')
    .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

  function valueText(s, value) {
    const def = s.def || {};
    if (def.kind === 'bool') return value === '1' ? 'on' : 'off';
    if (def.options) { const o = def.options.find(o => o.value === value); if (o) return o.label; }
    return def.unit && !String(value).endsWith('%') ? `${value} ${def.unit}` : String(value);
  }
  const TYPE_NAMES = {print: 'Process', filament: 'Filament', printer: 'Printer'};
  const where = s => [TYPE_NAMES[s.type] || s.type, s.page, s.group].filter(Boolean).join(' > ');

  // Helpers the written answers call, writing a setting's name, place and value as text.
  function textHelpers(elai) {
    return {
      at(key) { const s = elai.setting(key); return s ? `"${s.label}" (${where(s)}, now ${valueText(s, s.value)})` : ''; },
      value: key => (elai.setting(key) || {}).value,
    };
  }

  const clip = (text, n) => text.length > n ? text.slice(0, n).replace(/\s+\S*$/, '') + '...' : text;
  function topicText(t, helpers) {
    let answer = '';
    try { answer = plain(t.answer(helpers)).replace(/\s+/g, ' '); } catch (e) { answer = ''; }
    return `id ${t.id} (topic): ${t.title}. ${clip(answer, 260)}`;
  }
  function settingText(s) {
    const tip = plain(s.tooltip).replace(/\s+/g, ' ');
    return `id ${s.key} (setting): "${s.label}" in ${where(s)}, now ${valueText(s, s.value)}.${tip ? ' ' + clip(tip, 160) : ''}`;
  }

  // "No, ..." after an answer says that answer was wrong.
  const DISAGREE = /^\s*(no|nope|nah|not (that|this|it)|wrong|that'?s (wrong|not it|not what)|the other)\b/i;

  // The request for one question. history is [{role: 'user' | 'elai', text, id}], oldest first, without this question.
  // id is the topic id or setting key Elai answered with.
  // budget is the most characters the reference may take, so the whole request fits the model's window.
  function build(elai, history, question, {budget = 6500, context = ''} = {}) {
    const helpers = textHelpers(elai);
    const lastUser = [...history].reverse().find(m => m.role === 'user');
    // The question alone first, then with the one before, so "no, into two parts" still finds what "it" was.
    const now = elai.retrieve(question);
    const withBefore = lastUser ? elai.retrieve(lastUser.text + ' ' + question) : {topics: [], settings: []};
    const lastElai = [...history].reverse().find(m => m.role === 'elai');
    const rejected = DISAGREE.test(question) && lastElai ? lastElai.id : null;
    const topics = [...new Set([...now.topics, ...withBefore.topics])].filter(t => t.id !== rejected).slice(0, 7);
    // Settings only when no written answer comes near: one that does explains the problem as well as the setting.
    const settings = topics.length ? [] : [...new Set([...now.settings, ...withBefore.settings])].filter(s => s.key !== rejected).slice(0, 5);

    const parts = [];
    let used = 0;
    const take = text => { if (used + text.length > budget) return false; parts.push(text); used += text.length + 2; return true; };
    const kept = {topics: [], settings: []};
    for (const t of topics) if (take(topicText(t, helpers))) kept.topics.push(t);
    for (const s of settings) if (take(settingText(s))) kept.settings.push(s);
    const choices = [...kept.topics.map(t => t.id), ...kept.settings.map(s => s.key)];

    const turns = history.slice(-6).map(m => `${m.role === 'user' ? 'User' : 'Elai'}: ${m.text.length > 400 ? m.text.slice(0, 400) + '...' : m.text}`);
    const prompt = [
      context ? `Current setup: ${context}` : '',
      `Reference:\n${parts.join('\n') || '(nothing found)'}`,
      turns.length ? `Conversation so far:\n${turns.join('\n')}` : '',
      `User's latest message: ${question}`,
    ].filter(Boolean).join('\n\n');
    return {instructions: INSTRUCTIONS, prompt, choices, topics: kept.topics, settings: kept.settings};
  }

  // The settings a written answer names or its buttons change.
  function keysOf(t) {
    const keys = new Set();
    const h = {at: key => { keys.add(key); return ''; }, value: () => ''};
    try { t.answer(h); (t.actions ? t.actions(h) : []).forEach(a => { Object.keys(a.set || {}).forEach(k => keys.add(k)); if (a.show) keys.add(a.show); }); } catch (e) { /* an answer that can't run names nothing */ }
    return keys;
  }

  // What the model chose, if it is one of the items it was offered. A setting that one of the offered written answers
  // covers gives that answer instead: it explains the problem as well as naming the setting.
  function check(reply, request, elai) {
    const pick = String(reply.pick || '');
    const topic = request.topics.find(t => t.id === pick);
    if (topic) return {topic, setting: null};
    if (!request.settings.some(s => s.key === pick)) return {topic: null, setting: null};
    const covering = request.topics.find(t => keysOf(t).has(pick));
    return covering ? {topic: covering, setting: null} : {topic: null, setting: elai.setting(pick)};
  }

  root.ElaiAI = {INSTRUCTIONS, build, check, plain, valueText};
})(typeof window !== 'undefined' ? window : globalThis);
