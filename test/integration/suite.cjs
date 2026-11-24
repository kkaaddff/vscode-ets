// 运行在扩展宿主中的集成测试，验证各语言功能已正确注册并返回预期结果。
const assert = require('node:assert/strict');
const path = require('node:path');
const vscode = require('vscode');

const PAGE = path.join(__dirname, '../fixtures/project/entry/src/main/ets/pages/Index.ets');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

async function waitFor(fn, message, timeout = 15000) {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error(`超时：${message}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

let doc;
const pos = (needle, delta = 0) => doc.positionAt(doc.getText().indexOf(needle) + delta);

test('扩展激活且语言为 arkts', async () => {
  doc = await vscode.workspace.openTextDocument(PAGE);
  await vscode.window.showTextDocument(doc);
  assert.equal(doc.languageId, 'arkts');
  const ext = vscode.extensions.getExtension('kkaaddff.arkts-ets');
  // activate() 会在激活失败时抛出异常
  await ext.activate();
  assert.ok(ext.isActive);
});

test('大纲包含 struct 与组件树', async () => {
  const symbols = await waitFor(
    () => vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', doc.uri),
    '大纲',
  );
  const index = symbols.find((s) => s.name === 'Index');
  assert.ok(index, 'Index');
  assert.equal(index.kind, vscode.SymbolKind.Struct);
  const build = index.children.find((s) => s.name === 'build');
  assert.deepEqual(build.children.map((s) => s.name), ['Column']);
  assert.deepEqual(build.children[0].children.map((s) => s.name), ['Text', 'Image', 'Image', 'Text', 'Image']);
});

test('格式化文档', async () => {
  const options = { tabSize: 2, insertSpaces: true };
  // 没有任何编辑时命令返回 undefined
  const none = await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', doc.uri, options);
  assert.ok(!none || none.length === 0, `示例已是规范格式，却产生了编辑：${JSON.stringify(none)}`);

  const messy = await vscode.workspace.openTextDocument({
    language: 'arkts',
    content: "struct A {\nbuild(){\nRow(){\nText('a')\n}\n.width(1)\n.height(2)\n}\n}\n",
  });
  const edits = await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', messy.uri, options);
  assert.ok(edits && edits.length > 0, '应产生格式化编辑');
  const we = new vscode.WorkspaceEdit();
  we.set(messy.uri, edits);
  await vscode.workspace.applyEdit(we);
  assert.equal(
    messy.getText(),
    "struct A {\n  build() {\n    Row() {\n      Text('a')\n    }\n    .width(1)\n    .height(2)\n  }\n}\n",
  );
});

test('装饰器补全', async () => {
  const list = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', doc.uri, pos('@State', 1), '@');
  const labels = list.items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label));
  assert.ok(labels.includes('State') && labels.includes('Link'), '成员装饰器');
  assert.ok(!labels.includes('Entry'), '成员位置不应提示 @Entry');
});

test('资源补全', async () => {
  const list = await vscode.commands.executeCommand(
    'vscode.executeCompletionItemProvider',
    doc.uri,
    pos("app.string.ok'", 4),
  );
  const labels = list.items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label));
  for (const l of ['app.string.ok', 'app.string.app_name', 'app.color.primary', 'app.media.icon']) {
    assert.ok(labels.includes(l), `缺少 ${l}：${labels.join(', ')}`);
  }
});

test('资源悬停显示多语言取值', async () => {
  const hovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', doc.uri, pos('app.string.ok', 5));
  const text = hovers.flatMap((h) => h.contents.map((c) => c.value ?? String(c))).join('\n');
  assert.match(text, /确定/);
  assert.match(text, /OK/);
});

test('装饰器悬停', async () => {
  const hovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', doc.uri, pos('@State', 2));
  const text = hovers.flatMap((h) => h.contents.map((c) => c.value ?? String(c))).join('\n');
  assert.match(text, /gitee\.com\/openharmony\/docs/);
});

test('跳转到资源定义', async () => {
  const links = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', doc.uri, pos('app.string.ok', 5));
  const files = links.map((l) => (l.targetUri ?? l.uri).fsPath).sort();
  assert.equal(files.length, 2, '应跳转到 base 与 zh_CN 两处');
  assert.ok(files.every((f) => f.endsWith(path.join('element', 'string.json'))));
  const raw = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', doc.uri, pos('img/logo.svg', 2));
  assert.ok((raw[0].targetUri ?? raw[0].uri).fsPath.endsWith(path.join('rawfile', 'img', 'logo.svg')));
});

test('不存在的资源产生警告', async () => {
  const diagnostics = await waitFor(() => {
    const d = vscode.languages.getDiagnostics(doc.uri).filter((x) => x.source === 'arkts');
    return d.length >= 2 && d;
  }, '资源诊断');
  const messages = diagnostics.map((d) => d.message).sort();
  assert.equal(diagnostics.length, 2, messages.join('\n'));
  assert.match(messages.join('\n'), /app\.string\.missing/);
  assert.match(messages.join('\n'), /nope\.png/);
});

test('颜色：ARGB 字符串与颜色资源', async () => {
  const colors = await vscode.commands.executeCommand('vscode.executeDocumentColorProvider', doc.uri);
  const byText = Object.fromEntries(colors.map((c) => [doc.getText(c.range), c.color]));
  const argb = byText['#80FF0000'];
  assert.ok(argb, Object.keys(byText).join(', '));
  assert.equal(Math.round(argb.alpha * 255), 128);
  assert.equal(argb.red, 1);
  const res = byText["$r('app.color.primary')"];
  assert.ok(res, '颜色资源');
  assert.equal(Math.round(res.blue * 255), 0xff);
});

exports.run = async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${name}\n    ${err && err.stack ? err.stack : err}`);
    }
  }
  console.log(`\n${tests.length - failed} 通过，${failed} 失败`);
  if (failed) throw new Error(`${failed} 个集成测试失败`);
};
