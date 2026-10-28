import { mkdir, copyFile, readFile, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const target = 'public/engine/19.0.1';
await mkdir(target, { recursive: true });
for (const name of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'])
  await copyFile(`node_modules/stockfish/bin/${name}`, `${target}/${name}`);
await copyFile('node_modules/stockfish/Copying.txt', `${target}/COPYING.txt`);
await copyFile('vendor/stockfish-19.0.1-source.tar.gz', `${target}/source.tar.gz`);
await copyFile('vendor/nn-61e7af4bb97d.nnue', `${target}/nn-61e7af4bb97d.nnue`);
await mkdir('vendor/chessground', { recursive: true });
await cp('node_modules/@lichess-org/chessground/src', 'vendor/chessground/src', {
  recursive: true,
});
await cp('node_modules/@lichess-org/chessground/assets', 'vendor/chessground/assets', {
  recursive: true,
});
await copyFile(
  'node_modules/@lichess-org/chessground/package.json',
  'vendor/chessground/package.json',
);
await copyFile('LICENSE', 'vendor/chessground/LICENSE');
await mkdir('vendor/licenses', { recursive: true });
for (const [name, path] of Object.entries({
  stockfish: 'stockfish/Copying.txt',
  font: '@fontsource-variable/public-sans/LICENSE',
  chess: 'chess.js/LICENSE',
  react: 'react/LICENSE',
  router: 'react-router/LICENSE.md',
  idb: 'idb/LICENSE',
  oidc: 'openid-client/LICENSE.md',
})) {
  await copyFile(`node_modules/${path}`, `vendor/licenses/${name}.txt`);
}
const pkg = JSON.parse(await readFile('node_modules/stockfish/package.json', 'utf8'));
if (pkg.version !== '19.0.1')
  throw new Error(
    'Engine version changed: update the source distribution and bot version before building.',
  );
const hash = createHash('sha256')
  .update(await readFile('vendor/stockfish-19.0.1-source.tar.gz'))
  .digest('hex');
if (hash !== 'a18aa8a871f5265014b110b3e07804ff3637899d2e189be6ded2b99e2c17a10e')
  throw new Error('Engine source archive integrity mismatch');
console.log('Engine source verified.');
