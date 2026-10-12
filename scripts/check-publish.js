'use strict';
// Запускается перед `npm publish` (prepublishOnly): не даёт опубликовать пакет с незаполненными заглушками.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const bad = [];
for (const f of ['package.json', 'LICENSE']) {
  const t = fs.readFileSync(path.join(root, f), 'utf8');
  if (/\bOWNER\b/.test(t)) bad.push(`${f}: замените OWNER на ваш логин GitHub`);
  if (/YOUR NAME/.test(t)) bad.push(`${f}: замените YOUR NAME на ваше имя`);
}
if (bad.length) {
  console.error('Публикация остановлена, заполните заглушки:\n  - ' + bad.join('\n  - '));
  process.exit(1);
}
