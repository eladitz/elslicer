// Elai: answers questions about the app from what is on this computer. No AI service is called.
//
// A question is matched two ways. First against the written answers in knowledge.js, each a common problem or task
// with the words people use for it. Then against every setting the app has: its name, where it is, its tooltip and
// the settings guide's explanation. The better match answers. The question's wording also says whether the person
// wants something gone ("remove", "turn off", "don't want") or added, so a setting can be offered switched that way.
//
// Plain functions on globalThis.Elai, so the same file runs in the app's page and in Node for testing.
(function (root) {
  // Words that carry no meaning for matching.
  const STOP = new Set(('a an the i im i\'m me my mine we our you your it its it\'s this that these those is are was were be been am ' +
    'to of in on at for from by with as and or but so if then than there here what which who whom how why when where ' +
    'do does did done can could would should will shall may might must have has had having get gets got getting ' +
    'please help thanks thank hi hello hey just really very some any all much many one ones thing things way want wanted ' +
    'need needs like know tell show see make makes made use using used keep about into out up down over again also still ' +
    'other another meant mean instead else something anything stuff ' +
    'area part parts print printed printing model object my\'s ive i\'ve dont don\'t doesnt doesn\'t cant can\'t won\'t wont').split(/\s+/));

  // Other words for the same thing, and common slips. Each maps to the word the knowledge and settings use.
  const SAME = {
    rim: 'brim', rims: 'brim', brims: 'brim', brimm: 'brim', border: 'brim', flange: 'brim', apron: 'brim', ring: 'brim', ears: 'ear',
    rafts: 'raft', supports: 'support', scaffold: 'support', scaffolding: 'support', props: 'support',
    strings: 'stringing', stringy: 'stringing', string: 'stringing', hairs: 'stringing', hairy: 'stringing', cobweb: 'stringing', cobwebs: 'stringing', oozing: 'ooze',
    warp: 'warping', warped: 'warping', warps: 'warping', curling: 'warping', curl: 'warping', curled: 'warping', lifting: 'warping', lifts: 'warping', lift: 'warping',
    stick: 'adhesion', sticking: 'adhesion', sticks: 'adhesion', adhere: 'adhesion', adhering: 'adhesion', grip: 'adhesion',
    seams: 'seam', zit: 'seam', zits: 'seam', scar: 'seam', zipper: 'seam', blob: 'blobs', wisps: 'stringing', wisp: 'stringing',
    faster: 'speed', quicker: 'speed', fast: 'speed', slow: 'speed', slower: 'speed', speeds: 'speed', time: 'speed', hours: 'speed',
    stronger: 'strength', strong: 'strength', sturdy: 'strength', weak: 'strength', breaks: 'strength', snapped: 'strength', durable: 'strength', tough: 'strength',
    smoother: 'smooth', smoothness: 'smooth', rough: 'smooth', layers: 'layer', threads: 'stringing',
    walls: 'wall', perimeters: 'wall', perimeter: 'wall', shells: 'wall', loops: 'loop',
    holes: 'hole', tight: 'fit', loose: 'fit', fitting: 'fit', fits: 'fit',
    colours: 'colour', color: 'colour', colors: 'colour', coloured: 'colour', colored: 'colour', multicolor: 'colour', multicolour: 'colour', paint: 'paint', painting: 'paint',
    photo: 'image', picture: 'image', pic: 'image', jpg: 'image', png: 'image',
    cutting: 'cut', split: 'cut', halves: 'cut', half: 'cut', connector: 'connectors', screws: 'screw', thread: 'screw', threaded: 'screw',
    failed: 'fail', failure: 'fail', stopped: 'fail', crashed: 'fail', resume: 'continue', restart: 'continue',
    foot: 'elephant', bulge: 'elephant', bulging: 'elephant', flared: 'elephant',
    tower: 'tower', purge: 'purge', purging: 'purge', flush: 'purge', flushing: 'purge', waste: 'purge',
    sag: 'droop', sagging: 'droop', droopy: 'droop', drooping: 'droop', bridges: 'bridge', bridging: 'bridge',
    overhangs: 'overhang', infill: 'infill', fill: 'infill', inside: 'infill',
    temp: 'temperature', temperatures: 'temperature', hot: 'temperature', cold: 'temperature',
    gcode: 'export', 'g-code': 'export', send: 'export', upload: 'export',
    texture: 'fuzzy', textured: 'fuzzy', ironed: 'ironing', iron: 'ironing',
    layerheight: 'layer', resolution: 'detail', detailed: 'detail', details: 'detail', fine: 'detail',
    claude: 'ai', assistant: 'ai', elai: 'ai',
  };

  // Words that only ask how, not about what: they don't tell one topic from another.
  const GENERIC = new Set(['add', 'remov', 'remove', 'turn', 'too', 'more', 'less', 'bad', 'fix', 'issue', 'problem', 'look', 'come',
    'wont', 'won\'t', 'lot', 'set', 'setting', 'sett', 'value', 'best', 'good', 'better', 'off', 'no', 'not', 'stop', 'disable', 'enable',
    'reduce', 'increase', 'way', 'happen', 'keep', 'go', 'goe', 'try', 'work', 'right', 'wrong', 'mm', 'change']);
  // Thanks and small talk, which aren't questions about printing.
  const CHAT = /^\s*(ok(ay)?|cool|great|nice|awesome|perfect|thanks?|thank you|thx|ty|got it|sure|yes|yep|no|nope|why|hmm+|lol|wow|good)(\s+(thanks?|thank you|man|mate|then|so much|a lot))*\s*[!.?]*\s*$/i;

  // Words that ask for something to go, or to come.
  const OFF_WORDS = new Set(['remove', 'removed', 'removing', 'delete', 'disable', 'disabled', 'off', 'stop', 'without', 'rid', 'no', 'none',
    'eliminate', 'avoid', 'prevent', 'skip', 'kill', 'hide', 'drop', 'lose', 'cancel']);
  const ON_WORDS = new Set(['add', 'enable', 'enabled', 'on', 'turn-on', 'include', 'need', 'needs', 'needed', 'give', 'wider', 'bigger', 'larger', 'more', 'increase']);
  const OFF_PHRASES = ['turn off', 'switch off', 'get rid', 'dont want', 'don\'t want', 'do not want', 'no more', 'not print', 'dont print', 'don\'t print'];

  const words = text => String(text || '').toLowerCase().replace(/<[^>]*>/g, ' ').replace(/[’`]/g, '\'')
    .replace(/'s\b/g, '').replace(/[^a-z0-9%.'\- ]+/g, ' ').split(/\s+/).map(w => w.replace(/^[-'.]+|[-'.]+$/g, '')).filter(Boolean);

  // A rough stem, so "warping", "warped" and "warps" meet.
  function stem(w) {
    if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
    if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
    if (w.length > 4 && w.endsWith('es') && !w.endsWith('ses')) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
    return w;
  }

  // The meaningful words of a text, each mapped to its usual form and stemmed.
  function terms(text) {
    const out = [];
    for (const raw of words(text)) {
      if (STOP.has(raw)) continue;
      const w = SAME[raw] || raw;
      if (STOP.has(w)) continue;
      out.push(stem(w));
    }
    return out;
  }

  function editDistance(a, b, limit) {
    if (Math.abs(a.length - b.length) > limit) return limit + 1;
    let prev = Array.from({length: b.length + 1}, (_, i) => i);
    for (let i = 1; i <= a.length; ++i) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; ++j) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        best = Math.min(best, cur[j]);
      }
      if (best > limit) return limit + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  // What may follow a word's stem: a plural, a tense, a doubled last letter ("clog", "clogg") and the like.
  const ENDINGS = /^(s|es|e|d|ed|y|ly|ing|ion|ions|ation|ations|al|ness|ment|ive|ity|ure|[bdgklmnprt]|[bdgklmnprt](ed|er|ing|y))$/;

  // How alike two words are, 0 to 1: the same, one starting the other, or a slip of a letter or two.
  function alike(a, b) {
    if (a === b) return 1;
    const short = a.length < b.length ? a : b, long = a.length < b.length ? b : a;
    if (short.length >= 4 && long.startsWith(short) && ENDINGS.test(long.slice(short.length))) return 0.8;
    if (a[0] !== b[0]) return 0;
    if (short.length >= 6 && editDistance(a, b, 1) <= 1) return 0.75;
    if (short.length >= 9 && editDistance(a, b, 2) <= 2) return 0.6;
    return 0;
  }

  // Drops a leading "no," / "nope" / "no I meant" that answers the last reply rather than asking anything.
  function clean(question) {
    return String(question || '').replace(/^\s*(no|nope|nah|wrong)\s*([,.!:;-]+|\s(?=i\b|i'm\b|that\b|the other\b|not\b))\s*/i, '');
  }

  // Whether the question asks for something to go (-1), to come (1), or neither (0).
  function wants(question) {
    question = clean(question);
    const text = ' ' + words(question).join(' ') + ' ';
    if (OFF_PHRASES.some(p => text.includes(' ' + p + ' ') || text.includes(' ' + p))) return -1;
    const ws = words(question);
    if (ws.some(w => OFF_WORDS.has(w))) return -1;
    if (ws.some(w => ON_WORDS.has(w)) || text.includes(' turn on ') || text.includes(' switch on ')) return 1;
    return 0;
  }

  // ---------------------------------------------------------------------------
  // Matching the written answers
  // ---------------------------------------------------------------------------

  // An answer's words with their weight; "words" lists them as "word:weight" or "word" (weight 1). A phrase
  // ("elephant foot") counts when all its words are there. An answer needs one of its "needs" words to count at all.
  function prepareTopics(topics) {
    return topics.map(t => ({
      ...t,
      keys: (t.words || []).map(entry => {
        const [phrase, weight] = entry.split(':');
        return {terms: terms(phrase), weight: weight ? parseFloat(weight) : 1};
      }).filter(k => k.terms.length),
      needs: (t.needs || []).map(n => terms(n)).filter(n => n.length),
      patterns: t.patterns || [],
    })).map(t => ({...t, vocab: [...new Set([...t.keys.flatMap(k => k.terms), ...t.needs.flat()])]}));
  }

  function matchPhrase(phrase, qterms) {
    let total = 0;
    for (const p of phrase) {
      let best = 0;
      for (const q of qterms) best = Math.max(best, alike(p, q));
      if (best === 0) return 0;
      total += best;
    }
    return total / phrase.length;
  }

  function coverTopic(topic, qterms, weight) {
    if (!qterms.length) return 0;
    let covered = 0, total = 0;
    for (const q of qterms) {
      const w = weight(q);
      total += w;
      if (topic.vocab.some(t => alike(q, t) >= 0.8)) covered += w;
    }
    return total ? covered / total : 0;
  }

  function scoreTopic(topic, qterms, mode, question) {
    const patterned = topic.patterns.some(p => p.test(question));
    if (!patterned && topic.needs.length && !topic.needs.some(n => matchPhrase(n, qterms) > 0)) return 0;
    let score = 0;
    for (const key of topic.keys) score += matchPhrase(key.terms, qterms) * key.weight;
    if (score > 0 && topic.mode && mode && topic.mode === (mode < 0 ? 'off' : 'on')) score += 1;
    if (score > 0 && topic.mode && mode && topic.mode !== (mode < 0 ? 'off' : 'on')) score -= 1;
    if (score > 0 && topic.mode === 'on' && !mode) score += 0.5;
    // A whole-sentence pattern is the clearest sign of all.
    return patterned ? score + 6 : score;
  }

  // ---------------------------------------------------------------------------
  // Matching the settings
  // ---------------------------------------------------------------------------

  // Each setting as weighted words: its name counts most, then its key and where it is, then its explanations.
  function prepareSettings(settings, guides) {
    const docs = settings.map(s => {
      const weights = new Map();
      const add = (text, weight) => { for (const t of terms(text)) weights.set(t, Math.max(weights.get(t) || 0, weight)); };
      add(s.label, 3);
      add(s.key.replace(/_/g, ' '), 2);
      const own = new Set([...terms(s.label), ...terms(s.key.replace(/_/g, ' '))]);
      const label = terms(s.label);
      add(s.group, 1);
      add(s.page, 0.7);
      add(s.tooltip, 0.6);
      const g = guides && guides[s.key];
      if (g) { add(g.title, 3); add(g.text, 0.5); }
      return {setting: s, weights, own: [...own], label};
    });
    // Rare words tell settings apart; words in every tooltip don't.
    const df = new Map();
    for (const d of docs) for (const t of d.weights.keys()) df.set(t, (df.get(t) || 0) + 1);
    const n = docs.length || 1;
    for (const d of docs) d.idf = t => Math.log(1 + n / (df.get(t) || 1));
    return {docs, df, n};
  }

  function scoreSetting(doc, qterms, df, n) {
    let score = 0, hits = 0;
    for (const q of qterms) {
      let best = 0;
      for (const [t, w] of doc.weights) {
        const a = alike(q, t);
        if (a > 0) best = Math.max(best, a * w * Math.log(1 + n / (df.get(t) || 1)));
      }
      if (best > 0) ++hits;
      score += best;
    }
    // Settings that match more of the question's words win over one strong word, and a setting whose own name the
    // question spells out wins over one that only mentions those words.
    if (!qterms.length) return 0;
    const named = doc.own.length ? doc.own.filter(t => qterms.some(q => alike(q, t) === 1)).length / doc.own.length : 0;
    const coverage = hits / qterms.length;
    // A setting that shares only one word of a longer question is a guess, not an answer.
    if (qterms.length > 1 && coverage < 0.6 && named < 1) return {score: 0, guess: score * coverage};
    if (qterms.length === 1 && !doc.own.some(t => alike(qterms[0], t) >= 0.8)) return {score: 0, guess: score};
    // Every word of the question is in the setting's name, as in "belt tilt" for "Belt tilt axis".
    const inLabel = qterms.every(q => doc.label.some(t => alike(q, t) >= 0.8)) &&
      doc.label.filter(t => qterms.some(q => alike(q, t) >= 0.8)).length >= doc.label.length * 0.4;
    return {score: score * coverage * (0.6 + 0.4 * named), guess: 0, named: inLabel ? Math.max(named, 0.5) : named, coverage, label: doc.label};
  }

  // The value that turns a setting off or on, if it has one.
  function switchValue(s, mode) {
    const def = s.def || {};
    if (def.kind === 'bool') return s.value === '0' || s.value === '1' ? (mode < 0 ? '0' : '1') : null;
    if (def.options) {
      const off = def.options.find(o => /^(no|none|disabled?|off|no_.*|.*_none|no .*)$/i.test(o.value));
      if (mode < 0) return off ? off.value : null;
      const on = def.options.find(o => o !== off);
      return on && s.value === (off && off.value) ? on.value : null;
    }
    if (mode < 0 && (def.kind === 'int' || def.kind === 'number') && (def.min === undefined || def.min <= 0) &&
        /(loops|layers|count|width|number)/.test(s.key)) return '0';
    return null;
  }

  // ---------------------------------------------------------------------------
  // Answering
  // ---------------------------------------------------------------------------

  // knowledge: the written answers. settings: [{key, type, label, page, group, tooltip, value, def}].
  // guides: {key: {title, text}} from the settings guide, if loaded.
  function create(knowledge, settings, guides) {
    const topics = prepareTopics(knowledge);
    const index = prepareSettings(settings, guides);
    const byKey = new Map(settings.map(s => [s.key, s]));
    // How many answers know a word: one that most answers mention ("layer", "wall") says little about which is meant.
    const topicDf = q => topics.filter(t => t.vocab.some(v => alike(q, v) >= 0.8)).length;
    const weight = q => Math.log(1 + topics.length / (1 + topicDf(q)));

    function ask(question) {
      question = clean(question);
      if (CHAT.test(question)) return {kind: 'chat', mode: 0};
      const qterms = terms(question);
      const mode = wants(question);
      const patterned = topics.some(t => t.patterns.some(p => p.test(question)));
      if (!qterms.length && !patterned) return {kind: 'empty', mode};
      // The words that say what the question is about; "remove", "too", "fix" and the like say nothing about which topic.
      const content = [...new Set(qterms.filter(q => !GENERIC.has(q)))];

      const rankedTopics = topics.map(t => ({topic: t, score: scoreTopic(t, qterms, mode, question), cover: coverTopic(t, content, weight)}))
        .filter(r => r.score > 0).sort((a, b) => b.score - a.score);
      const scored = index.docs.map(d => ({setting: d.setting, ...scoreSetting(d, qterms, index.df, index.n)}));
      const rankedSettings = scored.filter(r => r.score > 0).sort((a, b) => b.score - a.score);
      const guesses = scored.filter(r => r.guess > 0).sort((a, b) => b.guess - a.guess);
      // What to offer when unsure: answers that match the question somewhat, and settings it nearly names.
      // Each must match a fair share of the question and come near the best, so no option is a stray word's echo.
      const options = () => {
        const best = rankedTopics.length ? rankedTopics[0].score : 0;
        const bestSetting = rankedSettings.length ? rankedSettings[0].score : 0;
        const inName = r => content.length && content.every(q => r.label.some(t => alike(q, t) >= 0.8));
        // Settings only when the question names one in two or more words, or no written answer is near.
        const topicOptions = rankedTopics.filter((r, i) => r.score >= 1.5 && r.score >= best * 0.5 && (i === 0 || r.cover >= 0.25)).slice(0, 3);
        return {topics: topicOptions.map(r => r.topic),
                settings: rankedSettings.filter(r => inName(r) && content.length >= 2 && r.score >= bestSetting * 0.5).slice(0, 2).map(r => r.setting)};
      };

      // Other answers worth a link: close in score and about a fair share of the question.
      const related = (list, best) => list.filter(r => r.score >= 1.5 && r.score >= best * 0.5 && r.cover >= 0.25).slice(0, 3).map(r => r.topic);
      const topTopic = rankedTopics[0], topSetting = rankedSettings[0];
      // A written answer wins when it matches clearly; it knows the problem, not just the setting's name.
      if (topTopic && topTopic.score >= 2 && (!topSetting || topTopic.score * 5 >= topSetting.score)) {
        const margin = topTopic.score - (rankedTopics[1] ? rankedTopics[1].score : 0);
        const alone = rankedTopics.filter(r => r.score >= 1.5).length === 1 && topTopic.score >= 3 && topTopic.cover >= 0.3;
        const sure = topTopic.topic.patterns.some(p => p.test(question)) || alone || (margin >= 1 && (!content.length || topTopic.cover >= 0.5));
        if (sure)
          return {kind: 'topic', mode, topic: topTopic.topic, score: topTopic.score,
                  also: related(rankedTopics.slice(1), topTopic.score)};
        const offer = options();
        return {kind: offer.topics.length || offer.settings.length ? 'unsure' : 'none', mode, ...offer};
      }
      if (topSetting && topSetting.score >= 2) {
        const s = topSetting.setting;
        // A setting is the answer only when the question names it; otherwise it's one guess among others.
        if (topSetting.coverage < 1 || topSetting.named < 0.5) {
          const offer = options();
          return {kind: offer.topics.length || offer.settings.length ? 'unsure' : 'none', mode, ...offer};
        }
        return {kind: 'setting', mode, setting: s, score: topSetting.score, switchTo: mode ? switchValue(s, mode) : null,
                also: rankedSettings.slice(1, 4).filter(r => r.score >= topSetting.score * 0.5).map(r => r.setting),
                topics: related(rankedTopics, rankedTopics.length ? rankedTopics[0].score : 0).slice(0, 2)};
      }
      const offer = options();
      return {kind: offer.topics.length || offer.settings.length ? 'unsure' : 'none', mode, ...offer};
    }


    // What an AI answering this question should read: the closest written answers and settings, best first.
    // Looser than ask(), since the AI decides which of them fits; it only needs the right one to be among them.
    function retrieve(question, topicCount = 4, settingCount = 8) {
      question = clean(question);
      const qterms = terms(question);
      if (!qterms.length) return {topics: [], settings: [], mode: 0};
      const mode = wants(question);
      const content = [...new Set(qterms.filter(q => !GENERIC.has(q)))];
      const rankedTopics = topics.map(t => ({topic: t, score: scoreTopic(t, qterms, mode, question), cover: coverTopic(t, content, weight)}))
        .filter(r => r.score >= 1).sort((a, b) => b.score - a.score);
      const best = rankedTopics.length ? rankedTopics[0].score : 0;
      const scored = index.docs.map(d => ({setting: d.setting, ...scoreSetting(d, qterms, index.df, index.n)}))
        .filter(r => r.score > 0).sort((a, b) => b.score - a.score);
      return {mode,
              topics: rankedTopics.filter(r => r.score >= best * 0.3).slice(0, topicCount).map(r => r.topic),
              settings: scored.slice(0, settingCount).map(r => r.setting)};
    }

    return {ask, retrieve, setting: key => byKey.get(key), topics};
  }

  root.Elai = {create, terms, wants, alike, switchValue};
})(typeof window !== 'undefined' ? window : globalThis);
