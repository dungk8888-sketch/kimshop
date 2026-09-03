import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
const keys=['applyAIDraft','AIProductAssistantPanel','onApply=','variantPrices'];
for(const key of keys){let i=s.indexOf(key);console.log(`\n[AI TRACE ${key}] index=${i}`);if(i>=0)console.log(s.slice(Math.max(0,i-2500),Math.min(s.length,i+5000)));}
