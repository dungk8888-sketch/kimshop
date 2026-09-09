import { readFileSync, writeFileSync } from 'node:fs';
const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

const oldListener = "      if (_event !== 'INITIAL_SESSION') loadUserSession(session);";
if (!s.includes(oldListener)) throw new Error('[session refresh guard] onAuthStateChange condition not found');
const newListener = "      if (_event !== 'INITIAL_SESSION' && _event !== 'TOKEN_REFRESHED') loadUserSession(session);";
s = s.replace(oldListener, newListener);

const oldWanted = "    const wanted = [...new Set((ids || []).filter(Boolean))];";
if (!s.includes(oldWanted)) throw new Error('[session refresh guard] ensureSupportProducts wanted-ids line not found');
const newWanted = "    const wanted = [...new Set((ids || []).filter(Boolean))].filter((id) => !products.some((p: any) => p.id === id));";
s = s.replace(oldWanted, newWanted);

writeFileSync(path, s, 'utf8');
console.log('[KIMSHOP PERF] TOKEN_REFRESHED không còn tải lại toàn bộ session; ensureSupportProducts bỏ qua id đã có sẵn');