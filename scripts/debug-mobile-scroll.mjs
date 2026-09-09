import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
for (const key of ['scrollTo','scrollY','selectedProduct','setSelectedProduct','setView(\'product','setView("product','Quay lại']) {
  console.log('\n###',key);
  let i=0,c=0;
  while((i=s.indexOf(key,i))>=0 && c<12){
    console.log(s.slice(Math.max(0,i-420),Math.min(s.length,i+760)).replace(/\n/g,'\\n'));
    i+=key.length; c++;
  }
}
