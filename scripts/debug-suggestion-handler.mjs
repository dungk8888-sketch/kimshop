import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
const needles=['storefrontLoading','const setSortBy','setSortBy =','loadMoreStorefront','IntersectionObserver','GỢI Ý HÔM NAY'];
for(const needle of needles){
  let i=0,count=0;
  while((i=s.indexOf(needle,i))!==-1 && count<20){
    console.log(`\n[KIMSHOP SUGGEST TRACE] ${needle} #${count+1}\n`+s.slice(Math.max(0,i-1100),Math.min(s.length,i+1700))+`\n[END TRACE]`);
    i+=needle.length; count++;
  }
}
