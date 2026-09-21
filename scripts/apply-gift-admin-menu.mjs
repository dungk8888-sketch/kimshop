#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_PATH = resolve(process.cwd(), 'src/App.tsx');
const MARKER = 'kimshop:open-gift-admin';
const ANCHOR = `                      <button
                        onClick={() => goSellerPage('sellerApprovals')}`;
const INSERT = `                      <button
                        onClick={() => window.dispatchEvent(new Event('kimshop:open-gift-admin'))}
                        className="w-full flex items-center justify-between text-left px-2 py-2 md:py-1.5 rounded-sm text-[12px] text-gray-500 hover:text-gray-800"
                      >
                        <span>Quản Trị Hộp Quà</span>
                      </button>
`;

function log(msg) { console.log(`[apply-gift-admin-menu] ${msg}`); }

function main() {
  const source = readFileSync(APP_PATH, 'utf8');
  if (source.includes(MARKER)) {
    log('đã gắn từ trước, không đổi gì.');
    return;
  }
  const idx = source.indexOf(ANCHOR);
  if (idx === -1) throw new Error('Không tìm thấy neo khối "Quản Trị Hệ Thống" trong src/App.tsx.');
  if (source.indexOf(ANCHOR, idx + 1) !== -1) throw new Error('Neo xuất hiện nhiều hơn 1 lần trong src/App.tsx — không chèn để tránh nhân đôi mục menu.');
  const patched = source.slice(0, idx) + INSERT + source.slice(idx);
  const count = patched.split(MARKER).length - 1;
  if (count !== 1) throw new Error(`Kết quả patch không hợp lệ (số mục menu = ${count}). Không ghi file.`);
  writeFileSync(APP_PATH, patched, 'utf8');
  log('đã thêm mục "Quản Trị Hộp Quà" vào Kênh Người Bán.');
}
main();
