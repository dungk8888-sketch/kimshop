import { readFileSync, writeFileSync } from 'node:fs';

const path='src/main.tsx';
let s=readFileSync(path,'utf8');

if(!s.includes("AdminUserManagerEnhancer")){
  const importAnchor="const AccountSettings = lazy(() => import('./AccountSettings'));";
  if(!s.includes(importAnchor)) throw new Error('[admin-user-manager-integration] import anchor missing');
  s=s.replace(
    importAnchor,
    importAnchor+"\nconst AdminUserManagerEnhancer = lazy(() => import('./AdminUserManagerEnhancer'));"
  );
}

if(!s.includes('<AdminUserManagerEnhancer />')){
  const boundary="    </AppErrorBoundary>";
  if(!s.includes(boundary)) throw new Error('[admin-user-manager-integration] boundary anchor missing');
  s=s.replace(
    boundary,
    "      <Suspense fallback={null}><AdminUserManagerEnhancer /></Suspense>\n"+boundary
  );
}

writeFileSync(path,s,'utf8');
console.log('[admin-user-manager-integration] applied');
