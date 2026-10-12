'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_EXCLUDE = [
  'node_modules', '.git', 'dist', 'build', 'coverage', 'vendor',
  '__pycache__', '.venv', 'venv', 'target', '.next',
];
const MAX_SIZE = 1024 * 1024;

/**
 * Рекурсивно обходит srcDir и возвращает файлы с поддерживаемыми расширениями.
 * exclude — имена папок/файлов или относительные префиксы путей.
 */
function scanFiles(srcDir, languages, exclude) {
  const names = new Set();
  const prefixes = [];
  for (const e of [...DEFAULT_EXCLUDE, ...(exclude || [])]) {
    const n = e.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
    if (n.includes('/')) prefixes.push(n);
    else names.add(n);
  }

  const result = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      const rel = path.relative(srcDir, full).split(path.sep).join('/');
      if (names.has(ent.name)) continue;
      if (prefixes.some((p) => rel === p || rel.startsWith(p + '/'))) continue;
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        const spec = languages[ext];
        if (!spec) continue;
        let st;
        try {
          st = fs.statSync(full);
        } catch (e) {
          continue;
        }
        if (st.size > MAX_SIZE) continue;
        result.push({ path: rel, text: fs.readFileSync(full, 'utf8'), spec });
      }
    }
  };
  walk(srcDir);
  return result;
}

module.exports = { scanFiles };
