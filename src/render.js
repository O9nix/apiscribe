'use strict';

const fs = require('fs');
const path = require('path');
const { diff } = require('./history');

const TOOL_VERSION = require('../package.json').version;

function read(name) {
  return fs.readFileSync(path.join(__dirname, name), 'utf8');
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** history -> самодостаточный HTML (данные, стили и скрипт внутри одного файла). */
function renderHtml(history, opts) {
  const versions = history.versions.map((v, i) => ({
    version: v.version,
    date: v.date,
    updatedAt: v.updatedAt,
    endpoints: v.endpoints,
    changes: i > 0 ? diff(history.versions[i - 1].endpoints, v.endpoints) : null,
  }));

  const data = {
    title: opts.title,
    lang: opts.lang,
    generatedAt: new Date().toISOString(),
    versions,
  };

  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(new RegExp('\\u2028', 'g'), '\\u2028')
    .replace(new RegExp('\\u2029', 'g'), '\\u2029');

  return read('template.html')
    .replace('__TOOL__', () => TOOL_VERSION)
    .replace('__LANG__', () => escHtml(opts.lang))
    .replace('__TITLE__', () => escHtml(opts.title))
    .replace('/*__CSS__*/', () => read('style.css'))
    .replace('__DATA__', () => json)
    .replace('/*__JS__*/', () => read('client.js').replace(/<\/script/gi, '<\\/script'));
}

module.exports = { renderHtml, TOOL_VERSION };
