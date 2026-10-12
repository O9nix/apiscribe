'use strict';

/**
 * Парсер: текст исходника -> список записей документации.
 *
 * Поддерживаются два стиля, их можно смешивать:
 *   1. JSDoc-стиль: @apiName / @apiGroup / @class + @param / @returns / @throws / @example,
 *      описание обычным текстом. Имя, класс и сигнатура при необходимости берутся из кода.
 *   2. HTTP-стиль (apiDoc): @api {GET} /path Заголовок + @apiParam / @apiSuccess ...
 *
 * Язык учитывается только при извлечении комментариев (см. languages.js).
 */

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lineOf(text, idx) {
  let n = 1;
  for (let i = 0; i < idx; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

function indentOf(l) {
  return l.match(/^\s*/)[0].length;
}

function dedentLines(lines) {
  let min = Infinity;
  for (const l of lines) {
    if (!l.trim()) continue;
    min = Math.min(min, indentOf(l));
  }
  if (min === Infinity) min = 0;
  return lines.map((l) => l.slice(Math.min(min, indentOf(l))));
}

function cleanBlock(body, starStyle) {
  const lines = body.split(/\r?\n/);
  if (starStyle) {
    return lines
      .map((l, i) => (i === 0 ? l.trimStart() : l.replace(/^\s*\*\s?/, '')))
      .join('\n');
  }
  return [lines[0].trimStart(), ...dedentLines(lines.slice(1))].join('\n');
}

/* ------------------------------------------------------------------ */
/* Извлечение комментариев                                              */
/* ------------------------------------------------------------------ */

function lineStartsOf(text) {
  const a = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) a.push(i + 1);
  return a;
}

/** Позиции объявлений классов (class Name в начале строки). */
function classIndex(text) {
  const out = [];
  const re = /^[ \t]*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(text))) out.push({ pos: m.index, name: m[1] });
  return out;
}

function classBefore(classes, idx) {
  let r = null;
  for (const c of classes) {
    if (c.pos < idx) r = c.name;
    else break;
  }
  return r;
}

/**
 * Достаёт из текста файла все комментарии, содержащие @api.
 * Для каждого запоминает: тело, строку, ближайший объявленный выше класс (cls)
 * и кусок кода сразу после комментария (after) — из него выводятся имя и параметры.
 */
function extractComments(text, spec) {
  const found = [];
  const classes = classIndex(text);
  const make = (line, body, start, end) => ({
    line,
    body,
    start,
    cls: classBefore(classes, start),
    after: text.slice(end, end + 800),
  });

  for (const [open, close] of spec.block || []) {
    const re = new RegExp(esc(open) + '([\\s\\S]*?)' + esc(close), 'g');
    const starStyle = open.endsWith('*');
    let m;
    while ((m = re.exec(text))) {
      if (!m[1].includes('@api')) continue;
      found.push(
        make(lineOf(text, m.index), cleanBlock(m[1], starStyle), m.index, m.index + m[0].length)
      );
    }
  }

  const prefixes = (spec.line || []).slice().sort((a, b) => b.length - a.length);
  if (prefixes.length) {
    const starts = lineStartsOf(text);
    let cur = null;
    const flush = () => {
      if (cur) {
        const body = cur.lines.join('\n');
        if (body.includes('@api')) {
          const end = cur.last + 1 < starts.length ? starts[cur.last + 1] : text.length;
          found.push(make(cur.line, body, cur.start, end));
        }
        cur = null;
      }
    };
    text.split(/\r?\n/).forEach((raw, i) => {
      const t = raw.trimStart();
      const p = prefixes.find((x) => t.startsWith(x));
      if (p) {
        if (!cur) cur = { line: i + 1, start: starts[i], last: i, lines: [] };
        let rest = t.slice(p.length);
        if (rest.startsWith(' ')) rest = rest.slice(1);
        cur.lines.push(rest);
        cur.last = i;
      } else {
        flush();
      }
    });
    flush();
  }

  found.sort((a, b) => a.start - b.start);
  return found;
}

/* ------------------------------------------------------------------ */
/* Теги                                                                 */
/* ------------------------------------------------------------------ */

const JSDOC_TAGS = new Set([
  'class', 'event', 'param', 'arg', 'argument', 'property', 'prop', 'type',
  'returns', 'return', 'throws', 'exception', 'example', 'since', 'deprecated',
  'description', 'desc', 'function', 'method', 'see', 'private', 'public',
  'static', 'async', 'override', 'author', 'global',
]);

// Теги в одну строку: последующие строки текста — это описание, а не продолжение тега.
const SINGLE_LINE = new Set([
  'apiName', 'apiGroup', 'apiSince', 'apiPermission', 'apiDeprecated', 'apiDefine',
  'class', 'event', 'since', 'deprecated', 'function', 'method', 'see',
  'private', 'public', 'static', 'async', 'override', 'author', 'global',
]);

function isTag(name) {
  return name.startsWith('api') || JSDOC_TAGS.has(name);
}

/**
 * Разбивает тело комментария на теги и свободный текст.
 * Возвращает { tags: [{name, text}], desc } — desc это текст описания без тегов.
 */
function splitTags(body) {
  const tags = [];
  const descLines = [];
  let cur = null;
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*@(\w+)(?:[ \t]+(.*))?$/);
    if (m && isTag(m[1])) {
      cur = { name: m[1], text: m[2] || '' };
      tags.push(cur);
    } else if (cur && !SINGLE_LINE.has(cur.name)) {
      cur.text += '\n' + line;
    } else {
      descLines.push(line);
    }
  }
  for (const t of tags) t.text = t.text.replace(/\s+$/, '');
  return { tags, desc: trimBlank(descLines).join('\n') };
}

function trimBlank(lines) {
  let a = 0;
  let b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b);
}

function parseField(text) {
  const m = text.match(/^(?:\(([^)]+)\)\s*)?(?:\{([^}]*)\}\s*)?(\[[^\]]*\]|\S+)\s*(?:-\s*)?([\s\S]*)$/);
  if (!m) return null;
  let name = m[3];
  let optional = false;
  let def;
  if (name[0] === '[') {
    optional = true;
    name = name.slice(1, -1);
    const i = name.indexOf('=');
    if (i >= 0) {
      def = name.slice(i + 1);
      name = name.slice(0, i);
    }
  }
  const f = {
    group: m[1] ? m[1].trim() : null,
    type: m[2] ? m[2].trim() : '',
    name: name.trim(),
    optional,
    description: m[4].trim(),
  };
  if (def !== undefined) f.default = def.replace(/^["']|["']$/g, '');
  return f;
}

/** "{Тип} описание" — для returns / throws / type. */
function parseTyped(text) {
  const m = text.match(/^(?:\{([^}]*)\}\s*)?([\s\S]*)$/);
  return { type: m[1] ? m[1].trim() : '', description: m[2].trim() };
}

function parseExample(text) {
  const idx = text.indexOf('\n');
  const head = idx < 0 ? text : text.slice(0, idx);
  let body = idx < 0 ? '' : text.slice(idx + 1);
  const hm = head.match(/^(?:\{([^}]*)\}\s*)?(.*)$/);
  const lines = body.split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  body = dedentLines(lines).join('\n');
  return { type: hm[1] ? hm[1].trim() : '', title: hm[2].trim(), content: body };
}

/** JSDoc @example: код обычно на следующих строках, но допустима и одна строка в самом теге. */
function parseJsExample(text) {
  const idx = text.indexOf('\n');
  const head = (idx < 0 ? text : text.slice(0, idx)).trim();
  const rest = idx < 0 ? '' : text.slice(idx + 1);
  if (head && !/^\{[^}]*\}/.test(head) && !rest.trim()) {
    return { type: '', title: '', content: head };
  }
  return parseExample(text);
}

const PARAM_GROUPS = {
  apiHeader: 'header',
  apiPath: 'path',
  apiQuery: 'query',
  apiBody: 'body',
  apiParam: 'param',
};

/* ------------------------------------------------------------------ */
/* Вывод имени и параметров из кода                                     */
/* ------------------------------------------------------------------ */

const NOT_METHODS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'else', 'do', 'try', 'with']);

function splitParams(s) {
  return s
    .split(',')
    .map((p) => p.trim().split(/\s*=\s*/)[0].replace(/^\.\.\./, '').replace(/\s*[:?].*$/, '').trim())
    .filter(Boolean);
}

/** По первым строкам кода после комментария пытается понять, что именно задокументировано. */
function inferFromCode(after) {
  const s = (after || '').replace(/^\s+/, '');
  let m;

  m = s.match(/^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/);
  if (m) return { kind: 'CLASS', name: m[1] };

  m = s.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/);
  if (m) return { kind: 'METHOD', name: m[1], params: splitParams(m[2]) };

  m = s.match(/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/);
  if (m) return { kind: 'METHOD', name: m[1], params: splitParams(m[2]) };

  m = s.match(/^(?:(?:static|async|public|private|protected)\s+)*(#?[A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?::[^{]+)?\{/);
  if (m && !NOT_METHODS.has(m[1])) return { kind: 'METHOD', name: m[1], params: splitParams(m[2]) };

  m = s.match(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(([^)]*)\)|[A-Za-z_$][\w$]*)\s*=>/);
  if (m) return { kind: 'METHOD', name: m[1], params: splitParams(m[2] || '') };

  m = s.match(/^([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(?:function\s*\w*\s*)?\(([^)]*)\)\s*(?:=>|\{)/);
  if (m) return { kind: 'METHOD', name: m[1], params: splitParams(m[2]) };

  m = s.match(/^([A-Za-z_$][\w$]*)\s*[:,=]/);
  if (m) return { kind: null, name: m[1] };

  m = s.match(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/);
  if (m) return { kind: null, name: m[1] };

  return null;
}

/* ------------------------------------------------------------------ */
/* Сборка записи                                                        */
/* ------------------------------------------------------------------ */

function expand(tags, defs, warn, loc, depth) {
  const out = [];
  for (const t of tags) {
    if (t.name !== 'apiUse') {
      out.push(t);
      continue;
    }
    const d = defs[t.text.trim()];
    if (!d) warn(`${loc}: @apiUse "${t.text.trim()}" не найден (нужен @apiDefine)`);
    else if (depth < 5) out.push(...expand(d, defs, warn, loc, depth + 1));
  }
  return out;
}

function buildEndpoint(tags, desc, ctx, file, line, warn) {
  const loc = `${file}:${line}`;
  const ep = {
    key: '',
    method: '',
    path: '',
    title: '',
    group: '',
    description: '',
    since: null,
    deprecated: null,
    permissions: [],
    params: { header: [], path: [], query: [], body: [], param: [] },
    success: [],
    error: [],
    examples: [],
    successExamples: [],
    errorExamples: [],
    source: { file, line },
  };
  let hasApi = false;
  let apiName = null;
  let classTag = null;
  let eventName = null;
  let isMethod = false;
  let isGlobal = false;

  for (const t of tags) {
    switch (t.name) {
      case 'api': {
        const m = t.text.match(/^\{(\w+)\}\s+(\S+)\s*(.*)$/);
        if (!m) {
          warn(`${loc}: неверный формат @api, ожидается "@api {GET} /path Заголовок"`);
          break;
        }
        hasApi = true;
        ep.method = m[1].toUpperCase();
        ep.path = m[2];
        ep.title = m[3].trim();
        break;
      }
      case 'apiName':
        apiName = t.text.trim();
        break;
      case 'class':
        classTag = t.text.trim().split(/\s+/)[0] || true;
        break;
      case 'event':
        eventName = t.text.trim().split(/\s+/)[0];
        break;
      case 'function':
      case 'method':
        isMethod = true;
        break;
      case 'global':
        isGlobal = true;
        break;
      case 'apiGroup':
        ep.group = t.text.trim();
        break;
      case 'apiDescription':
      case 'description':
      case 'desc':
        ep.description = t.text.trim();
        break;
      case 'apiSince':
      case 'since':
        ep.since = t.text.trim() || null;
        break;
      case 'apiDeprecated':
      case 'deprecated':
        ep.deprecated = t.text.trim() || true;
        break;
      case 'apiPermission':
        if (t.text.trim()) ep.permissions.push(t.text.trim());
        break;
      case 'apiHeader':
      case 'apiPath':
      case 'apiQuery':
      case 'apiBody':
      case 'apiParam': {
        const f = parseField(t.text);
        if (f) ep.params[PARAM_GROUPS[t.name]].push(f);
        break;
      }
      case 'param':
      case 'arg':
      case 'argument': {
        const f = parseField(t.text);
        if (f) ep.params.param.push(f);
        break;
      }
      case 'property':
      case 'prop': {
        const f = parseField(t.text);
        if (f) (ep.properties = ep.properties || []).push(f);
        break;
      }
      case 'type':
        ep.type = parseTyped(t.text).type;
        break;
      case 'apiSuccess':
      case 'apiError': {
        const f = parseField(t.text);
        if (f) ep[t.name === 'apiSuccess' ? 'success' : 'error'].push(f);
        break;
      }
      case 'apiReturns':
      case 'returns':
      case 'return':
        ep.returns = parseTyped(t.text);
        break;
      case 'apiThrows':
      case 'throws':
      case 'exception':
        (ep.throws = ep.throws || []).push(parseTyped(t.text));
        break;
      case 'apiExample':
        ep.examples.push(parseExample(t.text));
        break;
      case 'example':
        ep.examples.push(parseJsExample(t.text));
        break;
      case 'apiSuccessExample':
        ep.successExamples.push(parseExample(t.text));
        break;
      case 'apiErrorExample':
        ep.errorExamples.push(parseExample(t.text));
        break;
      case 'apiDefine':
      case 'see':
      case 'private':
      case 'public':
      case 'static':
      case 'async':
      case 'override':
      case 'author':
        break;
      default:
        if (t.name.startsWith('api')) warn(`${loc}: неизвестный тег @${t.name}`);
    }
  }

  /* --- HTTP-стиль --- */
  if (hasApi) {
    if (!ep.title) ep.title = `${ep.method} ${ep.path}`;
    ep.key = `${ep.method} ${ep.path}`;
    if (apiName) ep.name = apiName;
    if (!ep.group) ep.group = 'General';
    if (!ep.description && desc) ep.description = desc;
    return ep;
  }

  /* --- JSDoc-стиль --- */
  const inferred = inferFromCode(ctx.after);
  let kind;
  let name = apiName;

  if (classTag) {
    kind = 'CLASS';
    name = typeof classTag === 'string' ? classTag : name || (inferred && inferred.name);
  } else if (eventName) {
    kind = 'EVENT';
    name = eventName;
  } else {
    if (!name && inferred) name = inferred.name;
    if (inferred && inferred.kind === 'CLASS') kind = 'CLASS';
    else if (
      isMethod ||
      ep.params.param.length ||
      ep.returns ||
      ep.throws ||
      (inferred && inferred.kind === 'METHOD')
    ) kind = 'METHOD';
    else kind = 'PROP';
  }

  if (!name) {
    warn(`${loc}: не удалось определить имя записи — добавьте @apiName`);
    return null;
  }
  if (kind !== 'CLASS' && kind !== 'EVENT' && !isGlobal && !name.includes('.') && ctx.cls) {
    name = `${ctx.cls}.${name}`;
  }

  let sig = '';
  if (kind === 'METHOD') {
    const documented = ep.params.param.filter((f) => !f.name.includes('.')).map((f) => f.name);
    const names = documented.length ? documented : (inferred && inferred.params) || [];
    sig = `(${names.join(', ')})`;
  }

  ep.key = name;
  ep.method = kind;
  ep.path = name;
  ep.title = name + sig;
  if (sig) ep.sig = sig;
  ep.doc = true;
  ep.group = ep.group || (kind === 'CLASS' ? name : ctx.cls) || 'General';
  if (!ep.description && desc) ep.description = desc;
  return ep;
}

/**
 * files: [{ path, text, spec }]
 * Двухпроходный разбор, чтобы @apiUse мог ссылаться на @apiDefine из других файлов.
 * Порядок записей — как в исходниках.
 */
function parseSources(files) {
  const warnings = [];
  const warn = (m) => warnings.push(m);
  const defs = {};
  const blocks = [];

  for (const f of files) {
    for (const c of extractComments(f.text, f.spec)) {
      const { tags, desc } = splitTags(c.body);
      if (!tags.length) continue;
      if (tags[0].name === 'apiDefine') {
        const name = tags[0].text.trim().split(/\s+/)[0];
        if (name) defs[name] = tags.slice(1);
        else warn(`${f.path}:${c.line}: @apiDefine без имени`);
        continue;
      }
      blocks.push({ tags, desc, ctx: { cls: c.cls, after: c.after }, file: f.path, line: c.line });
    }
  }

  const endpoints = [];
  const seen = new Map();
  for (const b of blocks) {
    const loc = `${b.file}:${b.line}`;
    const tags = expand(b.tags, defs, warn, loc, 0);
    const ep = buildEndpoint(tags, b.desc, b.ctx, b.file, b.line, warn);
    if (!ep) continue;
    if (seen.has(ep.key)) {
      warn(`${loc}: дубликат ${ep.key} (уже описан в ${seen.get(ep.key)}) — пропущен`);
      continue;
    }
    seen.set(ep.key, loc);
    endpoints.push(ep);
  }
  return { endpoints, warnings };
}

module.exports = { extractComments, splitTags, parseSources, inferFromCode };
