// 在独立下载的 VS Code 中加载扩展并运行集成测试：node test/integration/runTest.mjs
import { runTests } from '@vscode/test-electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

try {
  await runTests({
    version: process.env.VSCODE_VERSION ?? 'stable',
    timeout: 120000,
    extensionDevelopmentPath: root,
    extensionTestsPath: join(root, 'test/integration/suite.cjs'),
    launchArgs: [join(root, 'test/fixtures/project'), '--disable-extensions', '--skip-welcome', '--skip-release-notes'],
  });
} catch (err) {
  console.error(err);
  process.exit(1);
}
