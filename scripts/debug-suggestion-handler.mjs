import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
const needles=['Gợi ý hôm nay','GỢI Ý HÔM NAY','Gợi Ý Hôm Nay','suggest','setSortBy','sortBy','setSelectedCategory'];
for(const needle of needles){
  let i=0,count=0;
  while((i=s.indexOf(needle,i))!==-1 && count<12){
    console.log(`\n[KIMSHOP SUGGEST TRACE] ${needle} #${count+1}\n`+s.slice(Math.max(0,i-900),Math.min(s.length,i+1400))+`\n[END TRACE]`);
    i+=needle.length; count++;
  }
}
