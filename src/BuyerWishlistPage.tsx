import React from 'react';
import { Heart } from 'lucide-react';

type Props = {
  wishlist: string[];
  products: any[];
  isShopActive: (shopId:any) => boolean;
  openProduct: (product:any) => void;
  toggleWishlist: (productId:string) => void;
  productThumb: (src:any, width?:number) => string;
  formatVND: (value:any) => string;
};

export default function BuyerWishlistPage({ wishlist, products, isShopActive, openProduct, toggleWishlist, productThumb, formatVND }: Props) {
  const likedProducts = products.filter((p) => wishlist.includes(p.id) && isShopActive(p.shopId));
  return (
    <main className="max-w-6xl mx-auto px-4 py-5 flex-1 w-full">
      <h2 className="font-bold text-sm text-gray-800 tracking-wide mb-3.5">SẢN PHẨM ĐÃ THÍCH ({wishlist.length})</h2>
      {wishlist.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center text-gray-300 gap-3"><Heart size={36} /><p className="text-gray-400">Bạn chưa thích sản phẩm nào</p></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
          {likedProducts.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group">
              <div className="relative cursor-pointer overflow-hidden" onClick={() => openProduct(p)}>
                <img src={productThumb(p.image, 320)} alt={p.name} loading="lazy" decoding="async" className="w-full h-36 object-cover group-hover:scale-105 transition-transform duration-300" />
                <button onClick={(e) => { e.stopPropagation(); toggleWishlist(p.id); }} className="absolute top-2 right-2 bg-white/95 backdrop-blur-sm rounded-full p-1.5 shadow-sm hover:scale-110 transition-transform">
                  <Heart size={13} className="fill-[#EE4D2D] text-[#EE4D2D]" />
                </button>
              </div>
              <div className="p-2.5 space-y-1.5 cursor-pointer" onClick={() => openProduct(p)}>
                <div className="text-[11px] line-clamp-2 h-8 text-gray-700">{p.name}</div>
                <div className="text-[#EE4D2D] font-bold text-sm">{formatVND(p.price)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
