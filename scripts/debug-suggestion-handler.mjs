import { readFileSync, writeFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
const needles=['const filteredProducts','filteredProducts =','loadStorefrontPage','function loadStorefrontPage','sortBy===','sortBy ===','GỢI Ý HÔM NAY','value={sortBy}'];
let out='';
for(const needle of needles){
  let i=0,count=0;
  while((i=s.indexOf(needle,i))!==-1 && count<20){
    const chunk=`\n[KIMSHOP SUGGEST TRACE] ${needle} #${count+1}\n`+s.slice(Math.max(0,i-1800),Math.min(s.length,i+3200))+`\n[END TRACE]\n`;
    console.log(chunk);
    out+=chunk;
    i+=needle.length; count++;
  }
}
writeFileSync('public/debug-suggestion.txt',out,'utf8');
