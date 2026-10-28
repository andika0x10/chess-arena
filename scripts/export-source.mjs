import { mkdir, readdir } from 'node:fs/promises';
import { create } from 'tar';
await mkdir('public/source', { recursive: true });
const configs = (await readdir('.')).filter((name) =>
  /^(package(-lock)?\.json|.*\.config\.ts|tsconfig.*\.json|wrangler\.jsonc|README\.md|LICENSE|THIRD_PARTY_NOTICES\.md|\.dev\.vars\.example|\.gitignore)$/.test(
    name,
  ),
);
await create({ gzip: true, file: 'public/source/chess-arena-source.tar.gz', portable: true }, [
  ...configs,
  '.prettierrc.json',
  'app',
  'workers',
  'migrations',
  'scripts',
  'tests',
  'vendor',
  'public/_headers',
  'public/favicon.svg',
]);
