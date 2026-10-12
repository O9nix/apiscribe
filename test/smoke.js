'use strict';
// Быстрая проверка основных сценариев. Запуск: npm test (без внешних зависимостей, Node >= 16).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseSources, generate, generateRoadmap } = require('../src');
const languages = require('../src/languages');
const { parseRoadmap, applyStatuses } = require('../src/roadmap');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    console.error('  FAIL ' + name + '\n' + (e.stack || e));
    process.exitCode = 1;
  }
}
const js = (text, p = 'a.js') => ({ path: p, text, spec: languages['.js'] });
const byKey = (eps, k) => eps.find((e) => e.key === k);

test('JSDoc: класс, метод, параметры, исключения, пример', () => {
  const { endpoints, warnings } = parseSources([js(`
/**
 * @class Foo
 * @apiGroup Foo
 * Описание класса.
 */
export class Foo {
    /**
     * @apiName bar
     * @apiGroup Foo
     * Делает дело.
     * @param {string} name Имя
     * @param {number} [limit=10] Лимит
     * @returns {boolean} Результат
     * @throws {Error} Ошибка
     * @example
     * foo.bar('x');
     */
    bar(name, limit) {}
}`)]);
  assert.deepStrictEqual(warnings, []);
  assert.ok(byKey(endpoints, 'Foo'));
  const m = byKey(endpoints, 'Foo.bar');
  assert.strictEqual(m.method, 'METHOD');
  assert.strictEqual(m.params.param[0].optional, false);
  assert.strictEqual(m.params.param[1].optional, true);
  assert.strictEqual(m.params.param[1].default, '10');
  assert.strictEqual(m.returns.type, 'boolean');
  assert.strictEqual(m.throws.length, 1);
  assert.strictEqual(m.examples[0].content, "foo.bar('x');");
});

test('JSDoc: имя и параметры выводятся из кода', () => {
  const { endpoints } = parseSources([js(`
/**
 * @apiGroup Util
 * Складывает.
 */
function add(a, b) {}`)]);
  assert.strictEqual(endpoints[0].key, 'add');
  assert.strictEqual(endpoints[0].title, 'add(a, b)');
});

test('HTTP-стиль и @apiUse', () => {
  const { endpoints, warnings } = parseSources([js(`
/** @apiDefine NotFound
 * @apiError (404) NotFound Не найдено */
/**
 * @api {GET} /users/:id Пользователь
 * @apiGroup Users
 * @apiPath {Number} id Идентификатор
 * @apiUse NotFound
 */
app.get('/users/:id', () => {});`)]);
  assert.deepStrictEqual(warnings, []);
  const e = byKey(endpoints, 'GET /users/:id');
  assert.strictEqual(e.error.length, 1);
  assert.strictEqual(e.params.path[0].name, 'id');
});

test('Python: docstring', () => {
  const { endpoints } = parseSources([{ path: 'a.py', spec: languages['.py'], text: `
def f():
    """
    @api {GET} /x Икс
    @apiGroup X
    """
` }]);
  assert.strictEqual(endpoints[0].key, 'GET /x');
});

test('generate(): версии, история, защита старых версий, markdown', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apiscribe-'));
  try {
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'a.js'), '/**\n * @api {GET} /a A\n * @apiGroup G\n */\nx();\n');
    fs.writeFileSync(path.join(dir, 'version.md'), '1.0.0\n');
    const opts = { cwd: dir, src: 'src', out: 'docs', roadmap: false };

    let r = generate(opts);
    assert.strictEqual(r.status, 'new-version');
    for (const f of ['index.html', 'api.md', 'history.json']) assert.ok(fs.existsSync(path.join(dir, 'docs', f)), f);
    assert.strictEqual(generate(opts).status, 'unchanged');

    fs.appendFileSync(path.join(dir, 'src', 'a.js'), '/**\n * @api {GET} /b B\n * @apiGroup G\n */\ny();\n');
    assert.strictEqual(generate(opts).status, 'updated');

    fs.writeFileSync(path.join(dir, 'version.md'), '1.1.0\n');
    assert.strictEqual(generate(opts).status, 'new-version');
    let h = JSON.parse(fs.readFileSync(path.join(dir, 'docs', 'history.json'), 'utf8'));
    assert.deepStrictEqual(h.versions.map((v) => v.version), ['1.0.0', '1.1.0']);

    fs.writeFileSync(path.join(dir, 'version.md'), '1.0.0\n'); // откат версии
    fs.appendFileSync(path.join(dir, 'src', 'a.js'), '/**\n * @api {GET} /c C\n * @apiGroup G\n */\nz();\n');
    assert.strictEqual(generate(opts).status, 'locked');
    h = JSON.parse(fs.readFileSync(path.join(dir, 'docs', 'history.json'), 'utf8'));
    assert.strictEqual(h.versions[0].endpoints.length, 2); // старая запись не тронута
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('HTML: данные нельзя использовать для вставки скрипта', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apiscribe-'));
  try {
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'a.js'), '/**\n * @api {GET} /a A\n * @apiGroup G\n * @apiDescription </script><script>alert(1)</script>\n */\nx();\n');
    fs.writeFileSync(path.join(dir, 'version.md'), '1.0.0\n');
    generate({ cwd: dir, src: 'src', out: 'docs', roadmap: false });
    const html = fs.readFileSync(path.join(dir, 'docs', 'index.html'), 'utf8');
    assert.strictEqual(html.split('<script').length - 1, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Roadmap: разбор и статусы по версии', () => {
  const p = parseRoadmap(`# R
> Подзаголовок
## 0.1.0 — Один
Лид.
**Что внутри**
- пункт
  - подпункт
**Зачем:** итог
## 0.2.0 — Два
## Порядок
текст
`);
  assert.strictEqual(p.steps.length, 2);
  assert.strictEqual(p.subtitle, 'Подзаголовок');
  assert.strictEqual(p.steps[0].sections[0].items[0].sub[0], 'подпункт');
  assert.strictEqual(p.steps[0].result, 'Итог');
  applyStatuses(p.steps, '0.1.5');
  assert.deepStrictEqual(p.steps.map((s) => s.status), ['current', 'planned']);
  applyStatuses(p.steps, '0.2.0');
  assert.deepStrictEqual(p.steps.map((s) => s.status), ['done', 'current']);
});

test('Roadmap: generateRoadmap пишет страницу и не перезаписывает без изменений', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apiscribe-'));
  try {
    fs.writeFileSync(path.join(dir, 'ROADMAP.md'), '# R\n## 0.1.0 — Один\n');
    fs.writeFileSync(path.join(dir, 'version.md'), '0.1.0\n');
    const o = { cwd: dir, out: 'docs' };
    assert.strictEqual(generateRoadmap(o).status, 'written');
    assert.ok(fs.existsSync(path.join(dir, 'docs', 'roadmap.html')));
    assert.strictEqual(generateRoadmap(o).status, 'unchanged');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n${passed} passed`);
