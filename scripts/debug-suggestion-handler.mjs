import { readFileSync, writeFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
const needles=['storefrontLoading','const setSortBy','setSortBy =','loadMoreStorefront','IntersectionObserver','GỢI Ý HÔM NAY','value={sortBy}','onChange'];
let out='';
for(const needle of needles){
  let i=0,count=0;
  while((i=s.indexOf(needle,i))!==-1 && count<20){
    const chunk=`\n[KIMSHOP SUGGEST TRACE] ${needle} #${count+1}\n`+s.slice(Math.max(0,i-1400),Math.min(s.length,i+2600))+`\n[END TRACE]\n`;
    console.log(chunk);
    out+=chunk;
    i+=needle.length; count++;
  }
}
writeFileSync('public/debug-suggestion.txt',out,'utf8');
