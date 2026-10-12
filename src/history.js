'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA = 1;

function stripSource(ep) {
  const { source, ...rest } = ep;
  return JSON.stringify(rest);
}

function sameEndpoints(a, b) {
  if (a.length !== b.length) return false;
  const bm = new Map(b.map((e) => [e.key, stripSource(e)]));
  return a.every((e) => bm.get(e.key) === stripSource(e));
}

/** Что изменилось между двумя наборами эндпоинтов. */
function diff(prev, cur) {
  const pm = new Map(prev.map((e) => [e.key, e]));
  const cm = new Map(cur.map((e) => [e.key, e]));
  const added = [];
  const changed = [];
  const removed = [];
  for (const e of cur) {
    if (!pm.has(e.key)) added.push(e.key);
    else if (stripSource(pm.get(e.key)) !== stripSource(e)) changed.push(e.key);
  }
  for (const e of prev) {
    if (!cm.has(e.key)) removed.push({ key: e.key, title: e.title });
  }
  return { added, changed, removed };
}

function loadHistory(file, title) {
  if (fs.existsSync(file)) {
    const h = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(h.versions)) throw new Error(`Повреждён файл истории: ${file}`);
    h.title = title || h.title;
    return h;
  }
  return { schema: SCHEMA, title, versions: [] };
}

function saveHistory(file, history) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(history, null, 2) + '\n');
}

/**
 * Правила:
 *  - версии нет в истории      -> добавляем новую запись ('new-version')
 *  - версия последняя          -> обновляем её запись, если API изменилось ('updated' / 'unchanged')
 *  - версия есть, но не последняя -> старая история неприкосновенна ('locked' / 'unchanged')
 */
function upsertVersion(history, version, endpoints) {
  const now = new Date().toISOString();
  const idx = history.versions.findIndex((v) => v.version === version);
  if (idx < 0) {
    history.versions.push({ version, date: now.slice(0, 10), updatedAt: now, endpoints });
    return 'new-version';
  }
  const entry = history.versions[idx];
  const same = sameEndpoints(entry.endpoints, endpoints);
  if (same) return 'unchanged';
  if (idx !== history.versions.length - 1) return 'locked';
  entry.endpoints = endpoints;
  entry.updatedAt = now;
  return 'updated';
}

module.exports = { loadHistory, saveHistory, upsertVersion, diff, SCHEMA };
