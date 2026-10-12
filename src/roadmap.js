'use strict';

/**
 * Roadmap: ROADMAP.md -> roadmap.html.
 *
 * Формат источника (markdown):
 *   # Название
 *   > Подзаголовок для шапки (необязательно)
 *   Текущая версия: **0.1.2**            <- запасной источник версии
 *
 *   ## 0.3.0 — Название этапа            <- этап; заголовки без версии игнорируются
 *   Одно-два предложения: lead.
 *
 *   **Макет**                            <- жирная метка = заголовок следующего списка
 *   - пункт
 *     - подпункт
 *
 *   **Схема**                            <- метка перед ``` блоком = заголовок схемы
 *   ```
 *   +----+----+
 *   ```
 *
 *   **Зачем:** результат этапа.
 *
 * Статус этапа считается по текущей версии проекта (version.md / package.json):
 *   версия этапа == текущей -> «сейчас», меньше -> «готово», больше -> «план».
 *   Если точного совпадения нет, «сейчас» получает ближайший этап ниже текущей версии.
 *   Вручную можно переопределить: ## 0.4.0 — Название [done] | [current] | [planned]
 */

const fs = require('fs');
const path = require('path');

const I18N = {
  ru: {
    includes: 'Что входит', scheme: 'Схема', version: 'Версия', current: 'Текущая версия',
    nowBadge: 'сейчас', doneBadge: 'готово', pick: 'Выберите этап слева.', order: 'Порядок',
    aria: 'Этапы roadmap', source: 'Источник', hint: 'Файл создан автоматически: правьте источник и пересоберите документацию.',
    unknown: 'версия не определена',
  },
  en: {
    includes: 'Scope', scheme: 'Diagram', version: 'Version', current: 'Current version',
    nowBadge: 'now', doneBadge: 'done', pick: 'Pick a stage on the left.', order: 'Order',
    aria: 'Roadmap stages', source: 'Source', hint: 'Generated automatically: edit the source and rebuild the docs.',
    unknown: 'version unknown',
  },
};

const RESULT_KEYS = /^(зачем|результат|итог|итоги|что получим|why|result|outcome)$/i;
const VERSION_RE = '(\\d+\\.\\d+\\.\\d+(?:[-+][0-9A-Za-z.-]+)?)';
const STEP_HEAD = new RegExp('^##\\s+v?' + VERSION_RE + '\\s*(?:[\\u2014\\u2013:|-]\\s*|\\s+)?(.*)$');

/* ---------- версии ---------- */

function parseVersion(v) {
  const m = String(v).match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+](.+))?$/);
  if (!m) return null;
  return { n: [+m[1], +m[2], +m[3]], pre: m[4] || '' };
}

function cmpVersion(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i] < y.n[i] ? -1 : 1;
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1; // 1.0.0 новее 1.0.0-beta
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

/* ---------- разбор markdown ---------- */

function parseBlock(lines) {
  const step = { lead: '', sections: [], notes: [], result: '', sketches: [] };
  let para = [];
  let label = null;
  let section = null;
  let started = false;
  let mode = 'normal'; // 'result' — абзацы идут в результат
  let lastTop = null;
  let lastTarget = null;
  let prevBlank = true;

  const flush = () => {
    if (!para.length) return;
    const t = para.join(' ').replace(/\s+/g, ' ').trim();
    para = [];
    if (!t) return;
    if (mode === 'result') step.result += (step.result ? ' ' : '') + t;
    else if (!started) step.lead += (step.lead ? ' ' : '') + t;
    else step.notes.push(t);
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/\t/g, '    ').replace(/\s+$/, '');
    const line = raw.trim();

    // блок кода -> схема
    const fm = line.match(/^(```+|~~~+)/);
    if (fm) {
      flush();
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fm[1])) { buf.push(lines[i].replace(/\s+$/, '')); i++; }
      step.sketches.push({ title: label, text: buf.join('\n') });
      label = null;
      section = null;
      started = true;
      mode = 'normal';
      prevBlank = false;
      continue;
    }

    if (!line || /^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flush();
      prevBlank = true;
      continue;
    }

    // метка: **Текст** или ### Текст
    let m = line.match(/^\*\*([^*]+?)\*\*\s*$/) || line.match(/^#{3,6}\s+(.+)$/);
    if (m) {
      flush();
      const text = m[1].replace(/\s*:\s*$/, '').trim();
      if (RESULT_KEYS.test(text)) { mode = 'result'; label = null; }
      else { label = text; section = null; mode = 'normal'; started = true; }
      prevBlank = false;
      continue;
    }

    // «**Зачем:** текст» в одну строку
    m = line.match(/^\*\*([^*]+?)\*\*\s*:?\s*(.+)$/);
    if (m && RESULT_KEYS.test(m[1].replace(/\s*:\s*$/, '').trim())) {
      flush();
      mode = 'result';
      para.push(m[2]);
      prevBlank = false;
      continue;
    }

    // пункт списка
    m = raw.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (m) {
      flush();
      mode = 'normal';
      started = true;
      const sub = m[1].length >= 2 && lastTop;
      if (!section) {
        section = { label, items: [] };
        label = null;
        step.sections.push(section);
      }
      if (sub) {
        lastTop.sub.push({ text: m[3].trim() });
        lastTarget = lastTop.sub[lastTop.sub.length - 1];
      } else {
        lastTop = { text: m[3].trim(), sub: [] };
        section.items.push(lastTop);
        lastTarget = lastTop;
      }
      prevBlank = false;
      continue;
    }

    // продолжение пункта (отступ, без пустой строки перед)
    if (/^\s{2,}\S/.test(raw) && lastTarget && section && !prevBlank) {
      lastTarget.text += ' ' + line;
      continue;
    }

    // цитата -> обычный абзац
    para.push(line.replace(/^>\s?/, ''));
    prevBlank = false;
  }
  flush();

  // «**Зачем:** что получим» — в плашке результат читается лучше с заглавной буквы
  if (step.result) step.result = step.result.charAt(0).toUpperCase() + step.result.slice(1);

  // sub: [{text}] -> [text]
  step.sections.forEach((s) => s.items.forEach((it) => { it.sub = it.sub.map((x) => x.text); }));
  return step;
}

function parseRoadmap(text) {
  const src = String(text).replace(/\r\n?/g, '\n').split('\n');
  const warnings = [];
  let title = '';
  let subtitle = '';
  const pre = [];
  const blocks = [];
  let cur = null;
  let inFence = false;

  for (const l of src) {
    if (/^\s*(```|~~~)/.test(l)) inFence = !inFence;
    if (!inFence && /^##\s+/.test(l)) {
      cur = { head: l.trim(), lines: [] };
      blocks.push(cur);
    } else if (cur) cur.lines.push(l);
    else pre.push(l);
  }

  for (const l of pre) {
    const h = l.match(/^#\s+(.+)$/);
    if (h && !title) title = h[1].trim();
  }
  const quote = pre.filter((l) => /^\s*>/.test(l)).map((l) => l.replace(/^\s*>\s?/, '').trim());
  subtitle = quote.join(' ').trim();

  const pm = pre.join('\n').match(/(?:Текущая версия|Current version)\s*:?\s*\*{0,2}v?(\d+\.\d+\.\d+[0-9A-Za-z.+-]*)/i);
  const currentFromText = pm ? pm[1].replace(/[.*]+$/, '') : null;

  const steps = [];
  const seen = new Set();
  for (const b of blocks) {
    const m = b.head.match(STEP_HEAD);
    if (!m) continue; // «## Порядок» и прочие разделы без версии
    let name = (m[2] || '').trim();
    let forced = null;
    const sm = name.match(/\s*\[(done|current|planned)\]\s*$/i);
    if (sm) { forced = sm[1].toLowerCase(); name = name.slice(0, sm.index).trim(); }
    if (seen.has(m[1])) { warnings.push(`roadmap: версия ${m[1]} встречается дважды — повтор пропущен`); continue; }
    seen.add(m[1]);
    const body = parseBlock(b.lines);
    steps.push(Object.assign({ version: m[1], title: name || m[1], forced }, body));
  }
  if (!steps.length) warnings.push('roadmap: не найдено ни одного этапа вида "## 0.1.0 — Название"');

  return { title: title || 'Roadmap', subtitle, currentFromText, steps, warnings };
}

/** Проставляет status каждому этапу. */
function applyStatuses(steps, current) {
  let currentIdx = -1;
  if (current) {
    steps.forEach((s, i) => { if (cmpVersion(s.version, current) === 0) currentIdx = i; });
    if (currentIdx < 0) {
      let best = -1;
      steps.forEach((s, i) => {
        if (cmpVersion(s.version, current) < 0 && (best < 0 || cmpVersion(s.version, steps[best].version) > 0)) best = i;
      });
      currentIdx = best;
    }
  }
  steps.forEach((s, i) => {
    if (s.forced) { s.status = s.forced; return; }
    if (!current) s.status = 'planned';
    else if (i === currentIdx) s.status = 'current';
    else s.status = cmpVersion(s.version, current) < 0 ? 'done' : 'planned';
  });
  return steps;
}

/* ---------- сборка HTML ---------- */

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderRoadmapHtml(parsed, opts) {
  const T = I18N[opts.lang] || I18N.en;
  const subtitle = parsed.subtitle ||
    `${T.order}: ` + parsed.steps.map((s) => s.title).join(' → ');

  const data = {
    lang: opts.lang,
    title: parsed.title,
    subtitle,
    current: opts.current || null,
    versionFile: opts.versionFileName || '',
    sourceName: opts.sourceName || '',
    T,
    steps: parsed.steps.map((s) => ({
      version: s.version,
      title: s.title,
      status: s.status,
      lead: s.lead,
      sections: s.sections,
      notes: s.notes,
      result: s.result,
      sketches: s.sketches,
    })),
  };
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(new RegExp('\\u2028', 'g'), '\\u2028')
    .replace(new RegExp('\\u2029', 'g'), '\\u2029');

  const tpl = fs.readFileSync(path.join(__dirname, 'roadmap.html'), 'utf8');
  return tpl
    .replace('__TOOL__', () => opts.toolVersion || '')
    .replace('__LANG__', () => escHtml(opts.lang))
    .replace('__TITLE__', () => escHtml(parsed.title))
    .replace('__DATA__', () => json);
}

module.exports = { parseRoadmap, applyStatuses, renderRoadmapHtml, cmpVersion, parseVersion };
