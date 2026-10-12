(function () {
  'use strict';

  var DATA = JSON.parse(document.getElementById('apiscribe-data').textContent);

  var I18N = {
    ru: {
      search: 'Поиск...', overview: 'Обзор', changelog: 'История изменений', version: 'Версия',
      header: 'Заголовки', path: 'Параметры пути', query: 'Query-параметры', body: 'Тело запроса', param: 'Параметры',
      success: 'Успешный ответ', error: 'Ошибки', examples: 'Примеры', field: 'Поле', type: 'Тип',
      description: 'Описание', required: 'обязательное', optional: 'необязательное', def: 'по умолчанию',
      added: 'Добавлено', changed: 'Изменено', removed: 'Удалено', none: 'Изменений нет',
      deprecated: 'Устарел', since: 'С версии', permissions: 'Доступ', source: 'Исходник',
      presentIn: 'Есть в версиях', copy: 'Копировать', copied: 'Скопировано', endpoints: 'записей',
      notFound: 'Этого элемента нет в выбранной версии.', initial: 'Первая версия', latest: 'последняя',
      isNew: 'новое', isChanged: 'изменено', released: 'Дата', groups: 'Категории', noMatch: 'Ничего не найдено',
      menu: 'Меню', returns: 'Возвращает', throws: 'Исключения', properties: 'Свойства', members: 'Содержимое',
      name: 'Имя', open: 'открыть страницу'
    },
    en: {
      search: 'Search...', overview: 'Overview', changelog: 'Changelog', version: 'Version',
      header: 'Headers', path: 'Path parameters', query: 'Query parameters', body: 'Request body', param: 'Parameters',
      success: 'Success response', error: 'Errors', examples: 'Examples', field: 'Field', type: 'Type',
      description: 'Description', required: 'required', optional: 'optional', def: 'default',
      added: 'Added', changed: 'Changed', removed: 'Removed', none: 'No changes',
      deprecated: 'Deprecated', since: 'Since', permissions: 'Permissions', source: 'Source',
      presentIn: 'Present in versions', copy: 'Copy', copied: 'Copied', endpoints: 'entries',
      notFound: 'This item does not exist in the selected version.', initial: 'Initial version', latest: 'latest',
      isNew: 'new', isChanged: 'changed', released: 'Date', groups: 'Categories', noMatch: 'Nothing found',
      menu: 'Menu', returns: 'Returns', throws: 'Throws', properties: 'Properties', members: 'Contents',
      name: 'Name', open: 'open page'
    }
  };
  var T = I18N[DATA.lang] || I18N.en;

  var versions = DATA.versions;
  var latest = versions[versions.length - 1];
  var state = { version: latest ? latest.version : '', key: '', query: '' };
  var expanded = {}; // key -> true/false (ручное раскрытие узлов меню)
  var closedCats = {};

  /* ---------- helpers ---------- */

  function add(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(e, x); });
    else e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }

  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') e.className = v;
        else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) add(e, arguments[i]);
    return e;
  }

  function byVersion(v) {
    for (var i = 0; i < versions.length; i++) if (versions[i].version === v) return versions[i];
    return null;
  }

  function findEp(v, key) {
    for (var i = 0; i < v.endpoints.length; i++) if (v.endpoints[i].key === key) return v.endpoints[i];
    return null;
  }

  function hashFor(version, key) {
    return '#/' + encodeURIComponent(version) + (key ? '/' + encodeURIComponent(key) : '');
  }

  function parseHash() {
    var s = location.hash.replace(/^#\/?/, '');
    if (!s) return {};
    var p = s.split('/');
    return { version: decodeURIComponent(p[0] || ''), key: p[1] ? decodeURIComponent(p[1]) : '' };
  }

  /* ---------- текст: inline-разметка и мини-markdown ---------- */

  function inline(s) {
    return String(s).split(/(`[^`]+`|\*\*[^*]+\*\*)/).map(function (x) {
      if (/^`[^`]+`$/.test(x)) return h('code', null, x.slice(1, -1));
      if (/^\*\*[^*]+\*\*$/.test(x)) return h('strong', null, x.slice(2, -2));
      return x;
    });
  }

  function inlineLines(lines) {
    var out = [];
    lines.forEach(function (l, i) {
      if (i) out.push(h('br'));
      out.push(inline(l.trim()));
    });
    return out;
  }

  // абзацы, списки, блоки кода ```...```, `код`, **жирный**; переносы строк сохраняются
  function rich(text, cls) {
    var box = h('div', { class: 'rich' + (cls ? ' ' + cls : '') });
    var lines = String(text || '').split('\n');
    var para = [];
    var list = null;
    var i = 0;

    function flushPara() {
      if (para.length) box.appendChild(h('p', null, inlineLines(para)));
      para = [];
    }
    function flushList() {
      if (list) {
        box.appendChild(h(list.ordered ? 'ol' : 'ul', null, list.items.map(function (it) {
          return h('li', null, inline(it));
        })));
      }
      list = null;
    }

    while (i < lines.length) {
      var l = lines[i];
      if (/^\s*```/.test(l)) {
        flushPara(); flushList();
        var buf = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        box.appendChild(h('pre', { class: 'md-pre' }, h('code', null, buf.join('\n'))));
        continue;
      }
      if (!l.trim()) { flushPara(); flushList(); i++; continue; }
      var bm = l.match(/^\s*[-*]\s+(.*)$/);
      var om = l.match(/^\s*\d+[.)]\s+(.*)$/);
      if (bm || om) {
        flushPara();
        var ord = !!om;
        if (list && list.ordered !== ord) flushList();
        if (!list) list = { ordered: ord, items: [] };
        list.items.push((bm || om)[1]);
        i++;
        continue;
      }
      flushList();
      para.push(l);
      i++;
    }
    flushPara(); flushList();
    return box;
  }

  function firstLine(text) {
    var t = String(text || '').trim();
    if (!t || /^```/.test(t)) return '';
    var s = t.split(/\n\s*\n/)[0].replace(/\s*\n\s*/g, ' ').replace(/[`*]/g, '');
    return s.length > 140 ? s.slice(0, 137) + '...' : s;
  }

  function copyText(text, btn) {
    function done() {
      btn.textContent = T.copied;
      setTimeout(function () { btn.textContent = T.copy; }, 1200);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {});
      return;
    }
    var ta = h('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    document.body.removeChild(ta);
  }

  function statusOf(v, key) {
    if (!v.changes) return '';
    if (v.changes.added.indexOf(key) >= 0) return 'add';
    if (v.changes.changed.indexOf(key) >= 0) return 'chg';
    return '';
  }

  /* ---------- иерархия: категория -> группа (api.game) -> метод (api.game.show) ---------- */

  function prep(v) {
    if (v._p) return v._p;
    var byKey = {};
    var byPath = {};
    var kids = {};
    var parent = {};
    v.endpoints.forEach(function (e) {
      byKey[e.key] = e;
      if (e.doc) byPath[e.group + '\u0000' + e.path] = e;
    });
    v.endpoints.forEach(function (e) {
      if (!e.doc) return;
      var parts = e.path.split('.');
      for (var i = parts.length - 1; i >= 1; i--) {
        var c = byPath[e.group + '\u0000' + parts.slice(0, i).join('.')];
        if (c) {
          parent[e.key] = c.key;
          (kids[c.key] = kids[c.key] || []).push(e);
          break;
        }
      }
    });
    v._p = { byKey: byKey, kids: kids, parent: parent };
    return v._p;
  }

  function descendants(P, ep) {
    var out = [];
    (P.kids[ep.key] || []).forEach(function (k) {
      out.push(k);
      descendants(P, k).forEach(function (d) { out.push(d); });
    });
    return out;
  }

  function ancestors(P, ep) {
    var out = [];
    var p = P.parent[ep.key];
    while (p) {
      var pe = P.byKey[p];
      out.unshift(pe);
      p = P.parent[pe.key];
    }
    return out;
  }

  function dispKind(P, ep) {
    if (ep.doc && ep.method === 'PROP' && P.kids[ep.key]) return 'NS';
    return ep.method;
  }

  function labelOf(P, ep) {
    if (!ep.doc) return ep.title || ep.path;
    var p = P.parent[ep.key];
    var base = ep.path;
    if (p) base = ep.path.slice(P.byKey[p].path.length + 1);
    return base + (ep.sig || '');
  }

  function badge(kind) {
    return h('span', { class: 'method m-' + kind }, kind);
  }

  /* ---------- каркас ---------- */

  var app = document.getElementById('app');
  var nav = h('div', { class: 'nav' });
  var main = h('main', { class: 'main' });
  var select = h('select', { onchange: function () {
    var nv = byVersion(select.value);
    var k = state.key;
    if (k && k !== '~changelog' && !(nv && findEp(nv, k))) k = '';
    location.hash = hashFor(select.value, k);
  } });
  var search = h('input', { type: 'search', placeholder: T.search, oninput: function () {
    state.query = search.value.trim().toLowerCase();
    renderNav();
  } });

  versions.slice().reverse().forEach(function (v) {
    select.appendChild(h('option', { value: v.version }, T.version + ' ' + v.version + (v === latest ? ' (' + T.latest + ')' : '')));
  });

  var side = h('aside', { class: 'side' }, h('div', { class: 'brand' }, DATA.title), select, search, nav);
  var topbar = h('div', { class: 'topbar' },
    h('button', { type: 'button', onclick: function () { document.body.classList.toggle('nav-open'); } }, T.menu),
    h('strong', null, DATA.title));
  app.appendChild(topbar);
  app.appendChild(h('div', { class: 'layout' }, side, main));

  /* ---------- меню ---------- */

  function navLink(href, active, kids, title) {
    return h('a', { class: 'item' + (active ? ' active' : ''), href: href, title: title || null,
      onclick: function () { document.body.classList.remove('nav-open'); } }, kids);
  }

  function navRow(v, P, ep, flat) {
    var st = statusOf(v, ep.key);
    return navLink(hashFor(v.version, ep.key), state.key === ep.key, [
      badge(dispKind(P, ep)),
      h('span', { class: 'label' + (ep.deprecated ? ' dep' : '') }, flat ? (ep.title || ep.path) : labelOf(P, ep)),
      st ? h('span', { class: 'dot ' + st, title: st === 'add' ? T.isNew : T.isChanged }) : null
    ], ep.title || ep.path);
  }

  function navNode(v, P, ep, openSet) {
    var kids = P.kids[ep.key] || [];
    if (!kids.length) return h('div', { class: 'nnode' }, h('div', { class: 'nrow' }, h('span', { class: 'chev-sp' }), navRow(v, P, ep, false)));

    var open = expanded.hasOwnProperty(ep.key) ? expanded[ep.key] : !!openSet[ep.key];
    var chev = h('button', { class: 'chev' + (open ? ' open' : ''), type: 'button', 'aria-label': 'toggle',
      onclick: function (e) {
        e.preventDefault();
        expanded[ep.key] = !open;
        renderNav();
      } }, '▸');
    return h('div', { class: 'nnode' },
      h('div', { class: 'nrow' }, chev, navRow(v, P, ep, false)),
      open ? h('div', { class: 'nkids' }, kids.map(function (k) { return navNode(v, P, k, openSet); })) : null);
  }

  function renderNav() {
    var v = byVersion(state.version);
    nav.textContent = '';
    if (!v) return;
    var P = prep(v);

    nav.appendChild(h('div', { class: 'top' },
      navLink(hashFor(v.version, ''), !state.key, [h('span', { class: 'label' }, T.overview)]),
      navLink(hashFor(v.version, '~changelog'), state.key === '~changelog', [h('span', { class: 'label' }, T.changelog)])));

    var q = state.query;
    var groups = {};
    var order = [];
    function put(ep) {
      if (!groups[ep.group]) { groups[ep.group] = []; order.push(ep.group); }
      groups[ep.group].push(ep);
    }

    var openSet = {};
    var active = state.key && P.byKey[state.key];
    if (active) {
      openSet[active.key] = true;
      ancestors(P, active).forEach(function (a) { openSet[a.key] = true; });
    }

    if (q) {
      v.endpoints.forEach(function (ep) {
        if ((ep.title + ' ' + ep.path + ' ' + ep.method + ' ' + ep.group).toLowerCase().indexOf(q) >= 0) put(ep);
      });
    } else {
      v.endpoints.forEach(function (ep) { if (!P.parent[ep.key]) put(ep); });
    }

    if (!order.length) nav.appendChild(h('p', { class: 'muted', style: 'padding:6px 8px' }, T.noMatch));

    order.forEach(function (g) {
      var det = h('details', { open: !closedCats[g] || !!q }, h('summary', null, g));
      det.addEventListener('toggle', function () { if (!q) closedCats[g] = !det.open; });
      groups[g].forEach(function (ep) {
        det.appendChild(q ? h('div', { class: 'nnode' }, h('div', { class: 'nrow' }, navRow(v, P, ep, true))) : navNode(v, P, ep, openSet));
      });
      nav.appendChild(det);
    });
  }

  /* ---------- содержимое ---------- */

  function link(v, key, title) {
    return h('a', { href: hashFor(v.version, key) }, h('code', null, key), title && title !== key ? ' — ' + title : '');
  }

  function changeBlock(v) {
    var c = v.changes;
    if (!c) return h('p', { class: 'muted' }, T.initial + ': ' + v.endpoints.length + ' ' + T.endpoints);
    if (!c.added.length && !c.changed.length && !c.removed.length) return h('p', { class: 'muted' }, T.none);
    function list(title, cls, items) {
      if (!items.length) return null;
      return [h('h3', { class: cls }, title + ' (' + items.length + ')'),
        h('ul', { class: cls }, items.map(function (i) { return h('li', null, i); }))];
    }
    function titleOf(key) { var e = findEp(v, key); return e ? e.title : ''; }
    return h('div', { class: 'changes' },
      list(T.added, 'add', c.added.map(function (k) { return link(v, k, titleOf(k)); })),
      list(T.changed, 'chg', c.changed.map(function (k) { return link(v, k, titleOf(k)); })),
      list(T.removed, 'rem', c.removed.map(function (r) { return h('span', null, h('code', null, r.key), r.title && r.title !== r.key ? ' — ' + r.title : ''); })));
  }

  function viewOverview(v) {
    var P = prep(v);
    var root = h('div', null);
    root.appendChild(h('h1', null, DATA.title));
    root.appendChild(h('p', { class: 'muted' },
      T.version + ' ' + v.version + ' · ' + T.released + ' ' + (v.date || '') + ' · ' + v.endpoints.length + ' ' + T.endpoints));
    root.appendChild(h('h2', null, T.changelog + ' ' + v.version));
    root.appendChild(changeBlock(v));
    root.appendChild(h('h2', null, T.groups));
    var groups = {};
    var order = [];
    v.endpoints.forEach(function (ep) {
      if (P.parent[ep.key]) return;
      if (!groups[ep.group]) { groups[ep.group] = []; order.push(ep.group); }
      groups[ep.group].push(ep);
    });
    order.forEach(function (g) {
      root.appendChild(h('div', { class: 'card' }, h('strong', null, g),
        h('div', { style: 'margin-top:8px' }, groups[g].map(function (ep) {
          var sum = firstLine(ep.description);
          return h('div', { style: 'margin:5px 0' },
            badge(dispKind(P, ep)), ' ',
            h('a', { href: hashFor(v.version, ep.key) }, ep.doc ? h('code', null, ep.title) : (ep.title || ep.path)),
            ep.doc ? null : [' ', h('code', null, ep.path)],
            sum ? h('span', { class: 'muted' }, ' — ' + sum) : null);
        }))));
    });
    return root;
  }

  function viewChangelog() {
    var root = h('div', null, h('h1', null, T.changelog));
    versions.slice().reverse().forEach(function (v) {
      root.appendChild(h('h2', null, v.version, ' ', h('span', { class: 'muted', style: 'font-weight:400;font-size:13px' }, v.date || '')));
      root.appendChild(changeBlock(v));
    });
    return root;
  }

  function fieldsTable(fields, isParam) {
    return h('table', { class: 'fields' },
      h('thead', null, h('tr', null, h('th', null, T.field), h('th', null, T.type), h('th', null, T.description))),
      h('tbody', null, fields.map(function (f) {
        var depth = (f.name.match(/\./g) || []).length;
        return h('tr', null,
          h('td', null, h('span', { style: depth ? 'margin-left:' + depth * 14 + 'px' : null }, h('code', null, f.name)), ' ',
            f.optional ? h('span', { class: 'tag' }, T.optional) : (isParam ? h('span', { class: 'tag req' }, T.required) : null)),
          h('td', null, f.type ? h('code', null, f.type) : ''),
          h('td', null, rich(f.description, 'cell'),
            f['default'] !== undefined ? h('div', { class: 'muted' }, T.def + ': ', h('code', null, f['default'])) : null));
      })));
  }

  function groupBy(fields, fallback) {
    var order = [];
    var map = {};
    fields.forEach(function (f) {
      var g = f.group || fallback;
      if (!map.hasOwnProperty(g)) { map[g] = []; order.push(g); }
      map[g].push(f);
    });
    return order.map(function (g) { return { group: g, fields: map[g] }; });
  }

  function exampleBlock(ex) {
    var btn = h('button', { class: 'copy', type: 'button', onclick: function () { copyText(ex.content, btn); } }, T.copy);
    return h('div', { class: 'example' },
      h('div', { class: 'ex-head' },
        h('span', { class: 'grow' }, ex.title || ex.type || ''),
        ex.title && ex.type ? h('span', { class: 'tag' }, ex.type) : null, btn),
      h('pre', null, h('code', null, ex.content)));
  }

  function section(title, content, tag) {
    var frag = document.createDocumentFragment();
    frag.appendChild(h(tag || 'h2', null, title));
    add(frag, content);
    return frag;
  }

  function metaTags(v, ep) {
    var st = statusOf(v, ep.key);
    var tags = [];
    if (st) tags.push(h('span', { class: 'tag ' + st }, st === 'add' ? T.isNew : T.isChanged));
    if (ep.deprecated) tags.push(h('span', { class: 'tag dep' }, T.deprecated + (ep.deprecated !== true ? ': ' + ep.deprecated : '')));
    if (ep.since) tags.push(h('span', { class: 'tag' }, T.since + ' ' + ep.since));
    if (ep.type) tags.push(h('span', { class: 'tag' }, T.type + ': ' + ep.type));
    ep.permissions.forEach(function (p) { tags.push(h('span', { class: 'tag' }, T.permissions + ': ' + p)); });
    return tags.length ? h('div', { class: 'tags' }, tags) : null;
  }

  // Тело записи (без заголовка). sub — уровень подзаголовков, footer — версии и исходник.
  function endpointBody(v, ep, sub, footer) {
    var out = document.createDocumentFragment();
    add(out, metaTags(v, ep));
    if (ep.description) out.appendChild(rich(ep.description));

    ['header', 'path', 'query', 'body', 'param'].forEach(function (g) {
      if (ep.params[g] && ep.params[g].length) out.appendChild(section(T[g], fieldsTable(ep.params[g], true), sub));
    });
    if (ep.properties && ep.properties.length) out.appendChild(section(T.properties, fieldsTable(ep.properties, false), sub));

    if (ep.returns) {
      out.appendChild(section(T.returns, [
        ep.returns.type ? h('code', null, ep.returns.type) : null,
        ep.returns.description ? rich(ep.returns.description) : null
      ], sub));
    }
    if (ep.throws && ep.throws.length) {
      out.appendChild(section(T.throws, ep.throws.map(function (x) {
        return h('div', { style: 'margin:6px 0' },
          x.type ? h('code', null, x.type) : null, x.type && x.description ? ' — ' : null, inline(x.description));
      }), sub));
    }
    if (ep.examples.length) out.appendChild(section(T.examples, ep.examples.map(exampleBlock), sub));

    if (ep.success.length || ep.successExamples.length) {
      var s = [];
      groupBy(ep.success, '200').forEach(function (g) {
        s.push(h('h3', null, g.group), fieldsTable(g.fields, false));
      });
      s.push(ep.successExamples.map(exampleBlock));
      out.appendChild(section(T.success, s, sub));
    }
    if (ep.error.length || ep.errorExamples.length) {
      var er = [];
      groupBy(ep.error, '').forEach(function (g) {
        if (g.group) er.push(h('h3', null, g.group));
        er.push(fieldsTable(g.fields, false));
      });
      er.push(ep.errorExamples.map(exampleBlock));
      out.appendChild(section(T.error, er, sub));
    }

    if (footer) out.appendChild(footerBlock(v, ep, sub));
    return out;
  }

  // Версии, в которых есть запись, и ссылка на исходник
  function footerBlock(v, ep, sub) {
    var out = document.createDocumentFragment();
    var present = versions.filter(function (x) { return findEp(x, ep.key); });
    if (present.length > 1) {
      out.appendChild(section(T.presentIn, h('div', { class: 'vlist' }, present.slice().reverse().map(function (x) {
        return h('a', { class: x === v ? 'cur' : '', href: hashFor(x.version, ep.key) }, x.version);
      })), sub));
    }
    if (ep.source && ep.source.file) {
      out.appendChild(h('div', { class: 'source' }, T.source + ': ', h('code', null, ep.source.file + (ep.source.line ? ':' + ep.source.line : ''))));
    }
    return out;
  }

  function crumbs(v, P, ep) {
    var chain = ancestors(P, ep);
    var root = chain.length ? chain[0] : ep;
    var parts = root.path === ep.group ? [] : [h('span', null, ep.group), ' › '];
    chain.forEach(function (a, i) {
      if (i) parts.push(' › ');
      parts.push(h('a', { href: hashFor(v.version, a.key) }, a.path));
    });
    if (chain.length) parts.push(' › ');
    parts.push(h('strong', null, ep.path));
    return h('div', { class: 'crumbs' }, parts);
  }

  // Страница одного элемента: метод, свойство, событие или HTTP-маршрут
  function viewEndpoint(v, ep) {
    var P = prep(v);
    var root = h('article', null);
    if (ep.doc) {
      root.appendChild(crumbs(v, P, ep));
      root.appendChild(h('h1', { class: 'doc-h1' }, badge(dispKind(P, ep)), ' ', h('code', { class: 'sig' }, ep.title)));
    } else {
      root.appendChild(h('h1', null, ep.title || ep.path));
      root.appendChild(h('div', { class: 'urlbar' }, badge(ep.method), h('code', null, ep.path)));
    }
    root.appendChild(endpointBody(v, ep, 'h2', true));
    return root;
  }

  // Страница группы (например api.game): описание группы + все её члены подряд
  function viewGroup(v, ep) {
    var P = prep(v);
    var members = descendants(P, ep);
    var root = h('article', null);
    root.appendChild(crumbs(v, P, ep));
    root.appendChild(h('h1', { class: 'doc-h1' }, badge(dispKind(P, ep)), ' ', h('code', { class: 'sig' }, ep.title)));
    root.appendChild(endpointBody(v, ep, 'h2', false));

    root.appendChild(h('h2', null, T.members + ' (' + members.length + ')'));
    root.appendChild(h('table', { class: 'fields members' },
      h('thead', null, h('tr', null, h('th', null, T.name), h('th', null, T.description))),
      h('tbody', null, members.map(function (m) {
        return h('tr', null,
          h('td', null, badge(dispKind(P, m)), ' ',
            h('a', { href: hashFor(v.version, m.key) }, h('code', null, m.path + (m.sig || '')))),
          h('td', null, firstLine(m.description)));
      }))));

    members.forEach(function (m) {
      var box = h('section', { class: 'member' });
      box.appendChild(h('h2', { class: 'member-h' }, badge(dispKind(P, m)), ' ',
        h('code', { class: 'sig' }, m.title),
        h('a', { class: 'permalink', href: hashFor(v.version, m.key), title: T.open }, '↗')));
      box.appendChild(endpointBody(v, m, 'h3', false));
      root.appendChild(box);
    });

    root.appendChild(footerBlock(v, ep, 'h2'));
    return root;
  }

  function viewItem(v, ep) {
    var P = prep(v);
    return P.kids[ep.key] ? viewGroup(v, ep) : viewEndpoint(v, ep);
  }

  function renderMain() {
    var v = byVersion(state.version);
    main.textContent = '';
    if (!v) {
      main.appendChild(h('h1', null, DATA.title));
      return;
    }
    var view;
    if (state.key === '~changelog') {
      view = viewChangelog();
    } else if (state.key) {
      var ep = findEp(v, state.key);
      view = ep ? viewItem(v, ep) : h('div', null, h('h1', null, state.key), h('p', { class: 'muted' }, T.notFound),
        h('p', null, h('a', { href: hashFor(v.version, '') }, T.overview)));
    } else {
      view = viewOverview(v);
    }
    main.appendChild(view);
    window.scrollTo(0, 0);
  }

  function route() {
    var p = parseHash();
    var v = byVersion(p.version) || latest;
    state.version = v ? v.version : '';
    state.key = byVersion(p.version) ? (p.key || '') : '';
    select.value = state.version;
    document.title = DATA.title + (state.key && state.key !== '~changelog' ? ' — ' + state.key : '');
    renderNav();
    renderMain();
  }

  window.addEventListener('hashchange', route);
  route();
})();
