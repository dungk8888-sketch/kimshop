import fs from 'node:fs';

const file='src/App.tsx';
let s=fs.readFileSync(file,'utf8');
let changes=0;
const hit=(label,n)=>{ if(n) console.log('[EGRESS V8]',label,n); changes+=n; };

// Support products: remove image_url from the main hydration query.
{
  const before=s;
  s=s.replace(
    ".select('id,shop_id,seller_id,name,category,category_id,price,original_price,stock,sold,rating,image_url,flash_sale,flash_price,status,created_at')\n        .in('id', wanted)",
    ".select('id,shop_id,seller_id,name,category,category_id,price,original_price,stock,sold,rating,flash_sale,flash_price,status,created_at,updated_at')\n        .in('id', wanted)"
  );
  hit('support main query narrowed',before===s?0:1);
}

// Order list must never download the legacy product_image_url snapshots.
{
  const re=/\.from\('order_items'\)\s*\n?\s*\.select\('\*'\)\s*\n?\s*\.in\('order_id',\s*orderIds\)/g;
  const m=s.match(re)||[];
  s=s.replace(re,".from('order_items')\n          .select('id,order_id,product_id,variant_id,product_name,variant_name,quantity,unit_price,original_unit_price,sort_order')\n          .in('order_id', orderIds)");
  hit('order_items select star removed',m.length);
}

// Since product_image_url is intentionally absent, order rows get no embedded legacy base64.
// Existing UI tolerates an empty image and current product cards remain unaffected.
{
  const re=/image:\s*it\.product_image_url\s*\|\|\s*'',/g;
  const m=s.match(re)||[];
  s=s.replace(re,"image: '',");
  hit('legacy order image field detached',m.length);
}

// Seller catalog: do not include products.image_url in the broad seller product rowset.
{
  const re=/supabase\.from\('products'\)\.select\('\*'\)\.eq\('seller_id',\s*sellerId\)\.neq\('status','deleted'\)\.order\('created_at',\{ascending:false\}\)/g;
  const m=s.match(re)||[];
  s=s.replace(re,"supabase.from('products').select('id,shop_id,seller_id,name,slug,description,category,category_id,price,original_price,stock,sold,rating,status,sort_order,created_at,updated_at,flash_sale,flash_price').eq('seller_id', sellerId).neq('status','deleted').order('created_at',{ascending:false})");
  hit('seller products select star removed',m.length);
}

// Bulk product gallery relations may be used in seller/admin hydration.
// Filter legacy data URLs at the database so they never leave Postgres.
{
  const re=/supabase\.from\('product_images'\)\.select\('\*'\)\.in\('product_id',\s*ids\)/g;
  const m=s.match(re)||[];
  s=s.replace(re,"supabase.from('product_images').select('*').in('product_id', ids).not('public_url','like','data:%')");
  hit('bulk gallery base64 filtered',m.length);
}

// Bulk variant hydration does not need the variant image payload.
{
  const re=/supabase\.from\('product_variants'\)\.select\('\*'\)\.in\('product_id',\s*ids\)/g;
  const m=s.match(re)||[];
  s=s.replace(re,"supabase.from('product_variants').select('id,product_id,name,price,stock,sort_order,created_at,updated_at,sku,original_price,attributes,is_active').in('product_id', ids)");
  hit('bulk variant image_url removed',m.length);
}

// Product card support queries that still explicitly include image_url must refuse data URLs.
// This covers cart/wishlist/viewed and any future small support hydration path.
{
  const needle=".in('id', wanted).neq('status','deleted');";
  const idx=s.indexOf(needle);
  if(idx>=0){
    const start=Math.max(0,s.lastIndexOf("const { data: raw",idx));
    const end=s.indexOf("const rich = buildProducts(rows, meta.shops, meta.categories);",idx);
    if(start>=0 && end>idx){
      const block=s.slice(start,end);
      if(!block.includes(".not('image_url','like','data:%')") && block.includes('image_url')){
        // image_url was not successfully removed above; enforce URL-only at query level.
        const patched=block.replace(".in('id', wanted).neq('status','deleted');",".in('id', wanted).neq('status','deleted').not('image_url','like','data:%');");
        s=s.slice(0,start)+patched+s.slice(end);
        hit('support base64 server filter fallback',1);
      }
    }
  }
}

const dangerousOrderQuery=/\.from\('order_items'\)[\s\S]{0,120}\.select\('\*'\)[\s\S]{0,120}\.in\('order_id',\s*orderIds\)/;
if(dangerousOrderQuery.test(s)) throw new Error('[EGRESS V8] dangerous order_items select(*) still present');
const dangerousSeller=/supabase\.from\('products'\)\.select\('\*'\)\.eq\('seller_id',\s*sellerId\)/;
if(dangerousSeller.test(s)) throw new Error('[EGRESS V8] dangerous seller products select(*) still present');

fs.writeFileSync(file,s);
console.log('[EGRESS V8] safe patch complete; changes=',changes);
