import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const index = join(dist, 'index.html');

if (!existsSync(index)) {
  console.error('dist/index.html not found - run the build first.');
  process.exit(1);
}

for (const file of ['404.html']) {
  copyFileSync(index, join(dist, file));
}
writeFileSync(join(dist, '.nojekyll'), '');
console.log('GitHub Pages fallback written: dist/404.html, dist/.nojekyll');
