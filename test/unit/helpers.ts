import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SAMPLE = readFileSync(join(__dirname, '../../test/fixtures/sample/Index.ets'), 'utf8');

