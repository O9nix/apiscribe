'use strict';

const fs = require('fs');
const path = require('path');
const defaultLanguages = require('./languages');
const { scanFiles } = require('./scanner');
const { parseSources } = require('./parser');
const { loadHistory, saveHistory, upsertVersion, diff } = require('./history');
const { renderHtml, TOOL_VERSION } = require('./render');
const { renderMarkdown } = require('./markdown');
const { parseRoadmap, applyStatuses, renderRoadmapHtml } = require('./roadmap');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
}

/** Настройки: значения по умолчанию < package.json["apiscribe"] < apiscribe.config.json < аргументы. */
function resolveOptions(user = {}) {
  const cwd = path.resolve(user.cwd || process.cwd());
  const pkg = readJson(path.join(cwd, 'package.json')) || {};
  const cfgFile = path.resolve(cwd, user.config || 'apiscribe.config.json');
  const cfg = readJson(cfgFile) || {};
  const o = Object.assign(
    {
      src: '.',
      out: 'docs/api',
      versionFile: 'version.md',
      historyFile: null,
      title: pkg.name ? `${pkg.name} API` : 'API Documentation',
      lang: 'ru',
      exclude: [],
      languages: {},
      markdown: true,
      markdownFile: 'api.md',
      roadmap: undefined,
      roadmapOut: null,
      roadmapVersionFile: null,
      force: false,
      quiet: false,
    },
    pkg.apiscribe || {},
    cfg,
    Object.fromEntries(Object.entries(user).filter(([, v]) => v !== undefined))
  );

  const outDir = path.resolve(cwd, o.out);
  const exclude = [...(o.exclude || [])];
  const outRel = path.relative(path.resolve(cwd, o.src), outDir).split(path.sep).join('/');
  if (outRel && !outRel.startsWith('..')) exclude.push(outRel);

  // Roadmap: false — выключен; строка — путь к источнику; не задан — ищем ROADMAP.md в корне проекта
  let roadmapFile = null;
  if (o.roadmap !== false) {
    if (typeof o.roadmap === 'string' && o.roadmap) {
      roadmapFile = path.resolve(cwd, o.roadmap);
    } else {
      for (const c of ['ROADMAP.md', 'roadmap.md']) {
        if (fs.existsSync(path.resolve(cwd, c))) { roadmapFile = path.resolve(cwd, c); break; }
      }
    }
  }

  return {
    cwd,
    srcDir: path.resolve(cwd, o.src),
    outDir,
    outFile: path.join(outDir, 'index.html'),
    mdFile: o.markdown === false ? null : path.resolve(outDir, o.markdownFile || 'api.md'),
    roadmapFile,
    roadmapOut: path.resolve(cwd, o.roadmapOut || path.join(o.out, 'roadmap.html')),
    roadmapVersionFile: o.roadmapVersionFile ? path.resolve(cwd, o.roadmapVersionFile) : path.resolve(cwd, o.versionFile),
    versionFile: path.resolve(cwd, o.versionFile),
    historyFile: path.resolve(cwd, o.historyFile || path.join(o.out, 'history.json')),
    title: o.title,
    lang: o.lang,
    exclude,
    languages: Object.assign({}, defaultLanguages, o.languages),
    force: !!o.force,
    quiet: !!o.quiet,
  };
}

/** Версия из version.md: первая строка вида 1.2.3 (или просто первая непустая строка). */
function readVersion(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Не найден файл версии: ${file}\nСоздайте его командой "apiscribe init" или вручную (например, 1.0.0).`);
  }
  const text = fs.readFileSync(file, 'utf8');
  if (/\.json$/i.test(file)) {
    let v;
    try {
      v = JSON.parse(text).version;
    } catch (e) {
      throw new Error(`Не удалось разобрать JSON: ${file}`);
    }
    if (!v) throw new Error(`В ${file} нет поля "version"`);
    return String(v);
  }
  const m = text.match(/\bv?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/);
  if (m) return m[1];
  const first = text.split(/\r?\n/).map((l) => l.replace(/^[#\s]+/, '').trim()).find(Boolean);
  if (!first) throw new Error(`Файл версии пуст: ${file}`);
  return first;
}

/**
 * Roadmap: читает ROADMAP.md и пишет roadmap.html рядом с документацией.
 * Статусы этапов считаются по текущей версии проекта (version.md / package.json).
 * Возвращает null, если источник не задан и ROADMAP.md не найден.
 */
function generateRoadmap(userOpts = {}) {
  const opts = resolveOptions(userOpts);
  if (!opts.roadmapFile) return null;
  if (!fs.existsSync(opts.roadmapFile)) throw new Error(`Не найден файл roadmap: ${opts.roadmapFile}`);

  const parsed = parseRoadmap(fs.readFileSync(opts.roadmapFile, 'utf8'));
  const warnings = parsed.warnings.slice();

  let current = null;
  let versionFileName = '';
  try {
    current = readVersion(opts.roadmapVersionFile);
    versionFileName = path.basename(opts.roadmapVersionFile);
  } catch (e) {
    if (parsed.currentFromText) {
      current = parsed.currentFromText;
      versionFileName = path.basename(opts.roadmapFile);
      warnings.push(`roadmap: ${path.basename(opts.roadmapVersionFile)} не найден, текущая версия взята из строки «Текущая версия» в ${versionFileName}`);
    } else {
      warnings.push(`roadmap: текущая версия не определена (${e.message.split('\n')[0]}), все этапы показаны как «план»`);
    }
  }
  applyStatuses(parsed.steps, current);

  const html = renderRoadmapHtml(parsed, {
    lang: opts.lang,
    current,
    versionFileName,
    sourceName: path.basename(opts.roadmapFile),
    toolVersion: TOOL_VERSION,
  });

  let status = 'written';
  if (fs.existsSync(opts.roadmapOut) && fs.readFileSync(opts.roadmapOut, 'utf8') === html) {
    status = 'unchanged';
  } else {
    fs.mkdirSync(path.dirname(opts.roadmapOut), { recursive: true });
    fs.writeFileSync(opts.roadmapOut, html);
  }

  return {
    status,
    current,
    steps: parsed.steps.length,
    stepsByStatus: parsed.steps.reduce((a, s) => { a[s.status] = (a[s.status] || 0) + 1; return a; }, {}),
    source: opts.roadmapFile,
    outFile: opts.roadmapOut,
    warnings,
  };
}

/**
 * Основная функция: сканирует исходники, сверяет версию с историей,
 * обновляет history.json и пересобирает index.html.
 */
function generate(userOpts = {}) {
  const opts = resolveOptions(userOpts);
  const version = readVersion(opts.versionFile);

  const files = scanFiles(opts.srcDir, opts.languages, opts.exclude);
  const { endpoints, warnings } = parseSources(files);

  const history = loadHistory(opts.historyFile, opts.title);
  const previous = history.versions.length ? history.versions[history.versions.length - 1].version : null;
  const status = upsertVersion(history, version, endpoints);

  if (status === 'new-version' || status === 'updated') saveHistory(opts.historyFile, history);

  // страница пересобирается, если API изменилось, файла нет или он собран другой версией инструмента
  let htmlStale = true;
  if (fs.existsSync(opts.outFile)) {
    htmlStale = !fs.readFileSync(opts.outFile, 'utf8').includes(`content="apiscribe ${TOOL_VERSION}"`);
  }
  const rebuild = status !== 'unchanged' || opts.force || htmlStale;
  if (rebuild) {
    fs.mkdirSync(opts.outDir, { recursive: true });
    fs.writeFileSync(opts.outFile, renderHtml(history, opts));
  }

  // Markdown лежит рядом с HTML и пересобирается в тех же случаях (плюс, если файла нет)
  if (opts.mdFile && (rebuild || !fs.existsSync(opts.mdFile))) {
    fs.mkdirSync(path.dirname(opts.mdFile), { recursive: true });
    fs.writeFileSync(opts.mdFile, renderMarkdown(history, Object.assign({ toolVersion: TOOL_VERSION }, opts)));
  }

  // Roadmap не должен ломать сборку документации: ошибки превращаются в предупреждения
  let roadmap = null;
  try {
    roadmap = generateRoadmap(userOpts);
    if (roadmap) warnings.push(...roadmap.warnings);
  } catch (e) {
    warnings.push(`roadmap: ${e.message}`);
  }

  const entry = history.versions.find((v) => v.version === version);
  const idx = history.versions.indexOf(entry);
  const changes = idx > 0 ? diff(history.versions[idx - 1].endpoints, entry.endpoints) : null;

  return {
    status,
    version,
    previousVersion: previous,
    endpointCount: endpoints.length,
    filesScanned: files.length,
    changes,
    warnings,
    outFile: opts.outFile,
    mdFile: opts.mdFile,
    roadmap,
    historyFile: opts.historyFile,
    options: opts,
  };
}

/**
 * Express/Connect-совместимый middleware.
 * Документация пересобирается при создании (старт сервера), затем отдаётся как HTML.
 *   app.use('/docs', require('apiscribe').middleware());
 */
function middleware(userOpts = {}) {
  let file;
  try {
    const r = generate(Object.assign({ quiet: true }, userOpts));
    file = r.outFile;
    for (const w of r.warnings) console.warn('[apiscribe] ' + w);
  } catch (e) {
    console.warn('[apiscribe] не удалось собрать документацию: ' + e.message);
    file = resolveOptions(userOpts).outFile;
  }
  return function apiscribe(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (next) return next();
      res.statusCode = 405;
      return res.end();
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        if (next) return next();
        res.statusCode = 404;
        return res.end();
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  };
}

/** Создаёт version.md и apiscribe.config.json, если их ещё нет. */
function init(userOpts = {}) {
  const cwd = path.resolve(userOpts.cwd || process.cwd());
  const created = [];
  const versionFile = path.join(cwd, userOpts.versionFile || 'version.md');
  if (!fs.existsSync(versionFile)) {
    fs.writeFileSync(versionFile, '0.1.0\n');
    created.push(path.relative(cwd, versionFile));
  }
  const cfgFile = path.join(cwd, 'apiscribe.config.json');
  if (!fs.existsSync(cfgFile)) {
    const cfg = {
      src: userOpts.src || 'src',
      out: userOpts.out || 'docs/api',
      versionFile: userOpts.versionFile || 'version.md',
      title: userOpts.title || 'API Documentation',
      lang: userOpts.lang || 'ru',
    };
    fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + '\n');
    created.push(path.relative(cwd, cfgFile));
  }
  return created;
}

module.exports = { generate, generateRoadmap, middleware, init, readVersion, resolveOptions, parseSources, scanFiles };
