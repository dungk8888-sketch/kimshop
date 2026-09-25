import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let source = readFileSync(path, 'utf8');
const labels = [
  ['<User size={14} /> Tài Khoản\n', '<User size={14} /> Tài Khoản / Tải Xuống\n'],
  ['<User size={12} /> Tài Khoản</button>', '<User size={12} /> Tài Khoản / Tải Xuống</button>'],
];

for (const [before, after] of labels) {
  if (!source.includes(before)) throw new Error(`Missing account navigation label: ${before}`);
  source = source.replace(before, after);
}

writeFileSync(path, source);
