#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MAIN_PATH = resolve(process.cwd(), 'src/main.tsx');
const IMPORT_MARKER = "from './giftAdmin/GiftAdminRoot'";
const IMPORT_LINE = "import GiftAdminRoot from './giftAdmin/GiftAdminRoot'; // [gift-admin] Claude 3";
const MOUNT_MARKER = '<GiftAdminRoot />';
const CLAUDE2_ANCHOR = '<GiftFeatureRoot />';
const BOUNDARY_ANCHOR = '</AppErrorBoundary>';

function log(msg) { console.log(`[apply-gift-admin-integration] ${msg}`); }

function insertImport(source) {
  if (source.includes(IMPORT_MARKER)) return source;
  const importRe = /^import[^\n]*\n/gm;
  let lastEnd = -1;
  let m;
  while ((m = importRe.exec(source)) !== null) {
    if (lastEnd !== -1 && m.index > lastEnd + 200) break;
    lastEnd = m.index + m[0].length;
  }
  if (lastEnd === -1) throw new Error('Không tìm thấy dòng import nào trong src/main.tsx — cấu trúc file đã đổi, cần cập nhật script này.');
  return source.slice(0, lastEnd) + IMPORT_LINE + '\n' + source.slice(lastEnd);
}

function detectIndent(source, idx) {
  const lineStart = source.lastIndexOf('\n', idx) + 1;
  const line = source.slice(lineStart, idx);
  const match = line.match(/^\s*/);
  return match ? match[0] : '  ';
}

function insertMount(source) {
  if (source.includes(MOUNT_MARKER)) return source;
  const idx2 = source.indexOf(CLAUDE2_ANCHOR);
  if (idx2 !== -1) {
    const at = idx2 + CLAUDE2_ANCHOR.length;
    const indent = detectIndent(source, idx2);
    log('neo theo <GiftFeatureRoot /> của Claude 2');
    return source.slice(0, at) + `\n${indent}${MOUNT_MARKER}` + source.slice(at);
  }
  const idxB = source.indexOf(BOUNDARY_ANCHOR);
  if (idxB !== -1) {
    const indent = detectIndent(source, idxB);
    log('neo theo </AppErrorBoundary> (chưa thấy GiftFeatureRoot của Claude 2)');
    return source.slice(0, idxB) + `  ${MOUNT_MARKER}\n${indent}` + source.slice(idxB);
  }
  throw new Error('Không tìm thấy neo nào trong src/main.tsx (<GiftFeatureRoot /> hoặc </AppErrorBoundary>). Cấu trúc main.tsx đã đổi.');
}

function main() {
  const source = readFileSync(MAIN_PATH, 'utf8');
  if (source.includes(IMPORT_MARKER) && source.includes(MOUNT_MARKER)) {
    log('đã gắn từ trước, không đổi gì.');
    return;
  }
  const patched = insertMount(insertImport(source));
  const importCount = patched.split(IMPORT_MARKER).length - 1;
  const mountCount = patched.split(MOUNT_MARKER).length - 1;
  if (importCount !== 1 || mountCount !== 1) throw new Error(`Kết quả patch không hợp lệ (import=${importCount}, mount=${mountCount}). Không ghi file.`);
  writeFileSync(MAIN_PATH, patched, 'utf8');
  log('đã gắn <GiftAdminRoot /> vào src/main.tsx.');
}
main();
