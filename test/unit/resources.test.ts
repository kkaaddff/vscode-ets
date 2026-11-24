import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyResourcePath,
  findResourceRefs,
  parseElementFile,
  parseRef,
  resourceCompletionContext,
} from '../../src/core/resources';
import { parseArkTS } from '../../src/core/source';

test('parseElementFile: 解析 element 资源', () => {
  const text = `{
    // 允许注释
    "string": [
      { "name": "app_name", "value": "Demo" },
      { "name": "greeting", "value": "你好" },
    ],
    "color": [{ "name": "primary", "value": "#FF007DFF" }],
    "strarray": [{ "name": "list", "value": [{ "value": "a" }] }],
    "unknown": [{ "name": "ignored", "value": 1 }]
  }`;
  const entries = parseElementFile(text);
  assert.deepEqual(
    entries.map((e) => `${e.type}.${e.name}=${e.value}`),
    ['string.app_name=Demo', 'string.greeting=你好', 'color.primary=#FF007DFF', 'strarray.list=[{ "value": "a" }]'],
  );
  const first = entries[0];
  assert.equal(text.slice(first.nameStart, first.nameEnd), '"app_name"');
  assert.deepEqual(parseElementFile('not json'), []);
});

test('classifyResourcePath: 识别资源目录结构', () => {
  const base = '/p/entry/src/main/resources';
  assert.deepEqual(classifyResourcePath(`${base}/base/element/string.json`), { kind: 'element', qualifier: 'base' });
  assert.deepEqual(classifyResourcePath(`${base}/zh_CN/element/string.json`), { kind: 'element', qualifier: 'zh_CN' });
  assert.deepEqual(classifyResourcePath(`${base}/dark/media/icon.png`), { kind: 'media', qualifier: 'dark', name: 'icon' });
  assert.deepEqual(classifyResourcePath(`${base}/base/profile/main_pages.json`), {
    kind: 'profile',
    qualifier: 'base',
    name: 'main_pages',
  });
  assert.deepEqual(classifyResourcePath(`${base}/rawfile/img/a.png`), { kind: 'rawfile', path: 'img/a.png' });
  assert.equal(classifyResourcePath(`${base}/base/element/readme.txt`), undefined);
  assert.equal(classifyResourcePath('/p/src/index.ets'), undefined);
});

test('parseRef: 资源引用格式', () => {
  assert.deepEqual(parseRef('app.string.app_name'), { scope: 'app', type: 'string', name: 'app_name' });
  assert.deepEqual(parseRef('sys.color.ohos_id_color_primary'), { scope: 'sys', type: 'color', name: 'ohos_id_color_primary' });
  assert.deepEqual(parseRef('[lib].media.icon'), { scope: '[lib]', type: 'media', name: 'icon' });
  assert.equal(parseRef('app.string'), undefined);
  assert.equal(parseRef('string.ok'), undefined);
});

test('findResourceRefs: 找出 $r / $rawfile 引用', () => {
  const text = [
    'struct A {',
    '  build() {',
    "    Text($r('app.string.ok'))",
    '    // $r("app.string.comment")',
    '    Image($rawfile("img/a.png"))',
    "    Text('$r(app.string.no)')",
    '  }',
    '}',
  ].join('\n');
  const refs = findResourceRefs(parseArkTS(text));
  assert.deepEqual(
    refs.map((r) => [r.kind, r.value, text.slice(r.start, r.end), text.slice(r.callStart, r.callEnd)]),
    [
      ['r', 'app.string.ok', 'app.string.ok', "$r('app.string.ok')"],
      ['rawfile', 'img/a.png', 'img/a.png', '$rawfile("img/a.png")'],
    ],
  );
});

test('resourceCompletionContext: 判断补全位置', () => {
  assert.deepEqual(resourceCompletionContext("Text($r('app.str"), { kind: 'r', quote: "'", prefix: 'app.str' });
  assert.deepEqual(resourceCompletionContext('Image($rawfile("'), { kind: 'rawfile', quote: '"', prefix: '' });
  assert.equal(resourceCompletionContext("Text($r('app.string.ok')"), undefined);
  assert.equal(resourceCompletionContext("Text('app."), undefined);
});
