'use strict';

const { diff } = require('./history');

const I18N = {
  ru: {
    version: 'Версия', date: 'Дата', entries: 'записей', toc: 'Содержание', changelog: 'История изменений',
    field: 'Поле', type: 'Тип', description: 'Описание', required: 'обязательное', optional: 'необязательное',
    def: 'по умолчанию', header: 'Заголовки', path: 'Параметры пути', query: 'Query-параметры',
    body: 'Тело запроса', param: 'Параметры', properties: 'Свойства', returns: 'Возвращает', throws: 'Исключения',
    examples: 'Примеры', success: 'Успешный ответ', error: 'Ошибки', since: 'с версии', deprecated: 'устарело',
    permissions: 'доступ', source: 'Исходник', members: 'Содержимое', added: 'Добавлено', changed: 'Изменено',
    name: 'Имя', removed: 'Удалено', none: 'Изменений нет', initial: 'Первая версия', generated: 'Файл создан автоматически',
    kinds: { CLASS: 'Класс', METHOD: 'Метод', PROP: 'Свойство', EVENT: 'Событие', NS: 'Группа', TYPE: 'Тип' },
  },
  en: {
    version: 'Version', date: 'Date', entries: 'entries', toc: 'Contents', changelog: 'Changelog',
    field: 'Field', type: 'Type', description: 'Description', required: 'required', optional: 'optional',
    def: 'default', header: 'Headers', path: 'Path parameters', query: 'Query parameters',
    body: 'Request body', param: 'Parameters', properties: 'Properties', returns: 'Returns', throws: 'Throws',
    examples: 'Examples', success: 'Success response', error: 'Errors', since: 'since', deprecated: 'deprecated',
    permissions: 'permissions', source: 'Source', members: 'Contents', added: 'Added', changed: 'Changed',
    name: 'Name', removed: 'Removed', none: 'No changes', initial: 'Initial version', generated: 'Generated automatically',
    kinds: { CLASS: 'Class', METHOD: 'Method', PROP: 'Property', EVENT: 'Event', NS: 'Group', TYPE: 'Type' },
  },
};

/** Текст для ячейки таблицы: без переносов и вертикальных черт. */
function cell(s) {
  return String(s || '').trim().replace(/\r?\n+/g, ' ').replace(/\|/g, '\\|');
}

function code(s) {
  const t = String(s);
  return t.includes('`') ? '`` ' + t + ' ``' : '`' + t + '`';
}

/** Блок кода; если внутри уже есть ```, забор делается длиннее. */
function fence(content, lang) {
  let f = '```';
  while (content.includes(f)) f += '`';
  return `${f}${lang || ''}\n${content}\n${f}`;
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

/** Дерево: запись -> родитель по префиксу пути внутри той же категории (как в HTML). */
function buildTree(endpoints) {
  const byPath = new Map();
  endpoints.forEach((e) => {
    if (e.doc) byPath.set(e.group + '\u0000' + e.path, e);
  });
  const parent = new Map();
  const kids = new Map();
  endpoints.forEach((e) => {
    if (!e.doc) return;
    const parts = e.path.split('.');
    for (let i = parts.length - 1; i >= 1; i--) {
      const p = byPath.get(e.group + '\u0000' + parts.slice(0, i).join('.'));
      if (p) {
        parent.set(e.key, p);
        if (!kids.has(p.key)) kids.set(p.key, []);
        kids.get(p.key).push(e);
        break;
      }
    }
  });
  return { parent, kids };
}

function kindOf(ep, tree, T) {
  const k = ep.method;
  if (ep.doc && k === 'PROP' && tree.kids.has(ep.key)) return T.kinds.NS;
  return (ep.doc && T.kinds[k]) || k;
}

function fieldsTable(fields, T, isParam) {
  const out = [`| ${T.field} | ${T.type} | ${T.description} |`, '| --- | --- | --- |'];
  fields.forEach((f) => {
    const mark = f.optional ? ` *(${T.optional})*` : isParam ? ` *(${T.required})*` : '';
    let d = cell(f.description);
    if (f.default !== undefined) d += (d ? ' ' : '') + `${T.def}: ${code(f.default)}`;
    out.push(`| ${code(f.name)}${mark} | ${f.type ? code(f.type) : ''} | ${d} |`);
  });
  return out.join('\n');
}

function renderMarkdown(history, opts) {
  const T = I18N[opts.lang] || I18N.en;
  const versions = history.versions;
  const latest = versions[versions.length - 1];
  const out = [];
  const used = new Map();

  function anchor(key) {
    const base = slugify(key);
    const n = used.get(base) || 0;
    used.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  }

  out.push(`# ${opts.title}`, '');
  if (!latest) return out.join('\n') + '\n';

  const eps = latest.endpoints;
  const tree = buildTree(eps);
  const ids = new Map();
  eps.forEach((e) => ids.set(e.key, anchor(e.key)));

  out.push(`**${T.version} ${latest.version}**` + (latest.date ? ` · ${T.date} ${latest.date}` : '') + ` · ${eps.length} ${T.entries}`, '');
  out.push(`<!-- ${T.generated}: apiscribe ${opts.toolVersion || ''}. ${opts.lang === 'en' ? 'Do not edit by hand' : 'Вручную не редактируйте'}. -->`, '');

  // категории в порядке появления
  const groups = new Map();
  eps.forEach((e) => {
    if (tree.parent.has(e.key)) return;
    if (!groups.has(e.group)) groups.set(e.group, []);
    groups.get(e.group).push(e);
  });

  // ---- содержание ----
  out.push(`## ${T.toc}`, '');
  const tocLine = (e, depth) => {
    const label = e.doc ? e.title : (e.title && e.title !== e.key ? `${e.key} — ${e.title}` : e.key);
    out.push(`${'  '.repeat(depth)}- [${label.replace(/([\[\]])/g, '\\$1')}](#${ids.get(e.key)})`);
    (tree.kids.get(e.key) || []).forEach((k) => tocLine(k, depth + 1));
  };
  for (const [g, list] of groups) {
    out.push(`- **${g}**`);
    list.forEach((e) => tocLine(e, 1));
  }
  out.push(`- [${T.changelog}](#changelog)`, '');

  // ---- тело записи ----
  function body(e, level) {
    const lines = [];
    const meta = [];
    meta.push(kindOf(e, tree, T));
    if (e.since) meta.push(`${T.since} ${e.since}`);
    if (e.deprecated) meta.push(`${T.deprecated}${e.deprecated !== true ? ': ' + e.deprecated : ''}`);
    (e.permissions || []).forEach((p) => meta.push(`${T.permissions}: ${p}`));
    if (e.type) meta.push(`${T.type}: ${e.type}`);
    lines.push(`*${meta.join(' · ')}*`, '');

    if (e.description) lines.push(e.description.trim(), '');

    const sub = '#'.repeat(Math.min(level + 1, 6));
    ['header', 'path', 'query', 'body', 'param'].forEach((g) => {
      const f = e.params && e.params[g];
      if (f && f.length) lines.push(`${sub} ${T[g]}`, '', fieldsTable(f, T, true), '');
    });
    if (e.properties && e.properties.length) lines.push(`${sub} ${T.properties}`, '', fieldsTable(e.properties, T, false), '');

    if (e.returns) {
      lines.push(`${sub} ${T.returns}`, '', [e.returns.type ? code(e.returns.type) : '', e.returns.description].filter(Boolean).join(' — '), '');
    }
    if (e.throws && e.throws.length) {
      lines.push(`${sub} ${T.throws}`, '');
      e.throws.forEach((x) => lines.push(`- ${[x.type ? code(x.type) : '', cell(x.description)].filter(Boolean).join(' — ')}`));
      lines.push('');
    }

    const lang = (ex) => ex.type || (e.doc ? 'js' : '');
    const exTitle = (ex) => (ex.title ? `**${ex.title}**` : '');
    if (e.examples && e.examples.length) {
      lines.push(`${sub} ${T.examples}`, '');
      e.examples.forEach((ex) => { if (exTitle(ex)) lines.push(exTitle(ex), ''); lines.push(fence(ex.content, lang(ex)), ''); });
    }

    if ((e.success && e.success.length) || (e.successExamples && e.successExamples.length)) {
      lines.push(`${sub} ${T.success}`, '');
      const byG = new Map();
      (e.success || []).forEach((f) => { const g = f.group || '200'; if (!byG.has(g)) byG.set(g, []); byG.get(g).push(f); });
      for (const [g, f] of byG) lines.push(`**${g}**`, '', fieldsTable(f, T, false), '');
      (e.successExamples || []).forEach((ex) => { if (exTitle(ex)) lines.push(exTitle(ex), ''); lines.push(fence(ex.content, lang(ex)), ''); });
    }
    if ((e.error && e.error.length) || (e.errorExamples && e.errorExamples.length)) {
      lines.push(`${sub} ${T.error}`, '');
      const byG = new Map();
      (e.error || []).forEach((f) => { const g = f.group || ''; if (!byG.has(g)) byG.set(g, []); byG.get(g).push(f); });
      for (const [g, f] of byG) { if (g) lines.push(`**${g}**`, ''); lines.push(fieldsTable(f, T, false), ''); }
      (e.errorExamples || []).forEach((ex) => { if (exTitle(ex)) lines.push(exTitle(ex), ''); lines.push(fence(ex.content, lang(ex)), ''); });
    }
    return lines;
  }

  function entry(e, level) {
    const h = '#'.repeat(Math.min(level, 6));
    const title = e.doc ? code(e.title) : (e.title && e.title !== e.key ? `${code(e.key)} — ${e.title}` : code(e.key));
    out.push(`<a id="${ids.get(e.key)}"></a>`, '', `${h} ${title}`, '');
    out.push(...body(e, level));
    const members = tree.kids.get(e.key) || [];
    if (members.length) {
      // сводная таблица группы, затем сами члены
      const flat = [];
      (function walk(list) { list.forEach((m) => { flat.push(m); walk(tree.kids.get(m.key) || []); }); })(members);
      out.push(`${'#'.repeat(Math.min(level + 1, 6))} ${T.members}`, '', `| ${T.name} | ${T.description} |`, '| --- | --- |');
      flat.forEach((m) => {
        const first = String(m.description || '').trim().split(/\n\s*\n/)[0].replace(/\s*\n\s*/g, ' ');
        out.push(`| [${code(m.path + (m.sig || ''))}](#${ids.get(m.key)}) | ${cell(first.length > 140 ? first.slice(0, 137) + '...' : first)} |`);
      });
      out.push('');
    }
    if (e.source && e.source.file) out.push(`<sub>${T.source}: ${e.source.file}${e.source.line ? ':' + e.source.line : ''}</sub>`, '');
    members.forEach((m) => entry(m, level + 1));
  }

  for (const [g, list] of groups) {
    out.push(`## ${g}`, '');
    list.forEach((e) => entry(e, 3));
  }

  // ---- история изменений по всем версиям ----
  out.push(`<a id="changelog"></a>`, '', `## ${T.changelog}`, '');
  versions.slice().reverse().forEach((v, i, arr) => {
    const prev = versions[versions.length - 1 - i - 1];
    out.push(`### ${v.version}` + (v.date ? ` (${v.date})` : ''), '');
    if (!prev) {
      out.push(`${T.initial}: ${v.endpoints.length} ${T.entries}`, '');
      return;
    }
    const c = diff(prev.endpoints, v.endpoints);
    if (!c.added.length && !c.changed.length && !c.removed.length) {
      out.push(T.none, '');
      return;
    }
    const list = (title, items) => {
      if (!items.length) return;
      out.push(`**${title} (${items.length})**`, '');
      items.forEach((x) => out.push(`- ${x}`));
      out.push('');
    };
    list(T.added, c.added.map(code));
    list(T.changed, c.changed.map(code));
    list(T.removed, c.removed.map((r) => code(r.key)));
  });

  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
}

module.exports = { renderMarkdown };
