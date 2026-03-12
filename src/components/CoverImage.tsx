import React from 'react';
import { Book as BookIcon } from 'lucide-react';

interface CoverImageProps {
  cover_url?: string;
  title: string;
  is_dvd?: boolean;
  className?: string;
}

export default function CoverImage({ cover_url, title, is_dvd, className = "w-full h-full object-cover" }: CoverImageProps) {
  return (
    <div className="relative w-full h-full overflow-hidden">
      {cover_url ? (
        <img 
          src={cover_url} 
          alt={title} 
          className={className} 
          referrerPolicy="no-referrer" 
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-slate-100">
          <BookIcon className="w-1/2 h-1/2 text-slate-300" />
        </div>
      )}
      {is_dvd && (
        <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider backdrop-blur-sm">
          DVD
        </div>
      )}
    </div>
  );
}
