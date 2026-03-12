import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export function BarcodeInstructionGraphic({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 150" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Book */}
      <path d="M40 30 L100 20 L130 90 L70 100 Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M40 30 L35 35 L65 105 L70 100" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M65 105 L125 95 L130 90" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      
      {/* Barcode on book */}
      <g transform="rotate(-10 85 70)">
        <rect x="85" y="70" width="30" height="15" rx="1" stroke="currentColor" strokeWidth="1.5" fill="#1e293b" />
        <line x1="88" y1="73" x2="88" y2="82" stroke="currentColor" strokeWidth="1" />
        <line x1="91" y1="73" x2="91" y2="82" stroke="currentColor" strokeWidth="1.5" />
        <line x1="94" y1="73" x2="94" y2="82" stroke="currentColor" strokeWidth="1" />
        <line x1="97" y1="73" x2="97" y2="82" stroke="currentColor" strokeWidth="2" />
        <line x1="101" y1="73" x2="101" y2="82" stroke="currentColor" strokeWidth="1" />
        <line x1="104" y1="73" x2="104" y2="82" stroke="currentColor" strokeWidth="1.5" />
        <line x1="108" y1="73" x2="108" y2="82" stroke="currentColor" strokeWidth="1" />
        <line x1="111" y1="73" x2="111" y2="82" stroke="currentColor" strokeWidth="1" />
      </g>

      {/* Phone */}
      <g transform="rotate(15 110 30)">
        <rect x="110" y="30" width="45" height="80" rx="6" stroke="currentColor" strokeWidth="2" fill="#0f172a" />
        <rect x="114" y="34" width="37" height="72" rx="3" stroke="currentColor" strokeWidth="1" />
        
        {/* Scanning frame on phone */}
        <path d="M120 50 L118 50 L118 52" stroke="#34d399" strokeWidth="1.5" />
        <path d="M145 50 L147 50 L147 52" stroke="#34d399" strokeWidth="1.5" />
        <path d="M120 70 L118 70 L118 68" stroke="#34d399" strokeWidth="1.5" />
        <path d="M145 70 L147 70 L147 68" stroke="#34d399" strokeWidth="1.5" />
        <line x1="115" y1="60" x2="150" y2="60" stroke="#34d399" strokeWidth="1.5" strokeDasharray="2 2" />
      </g>

      {/* Arrow */}
      <path d="M100 20 Q120 10 130 30" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" fill="none" />
      <path d="M128 28 L130 30 L132 27" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

export function CoverInstructionGraphic({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 150" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Book */}
      <path d="M40 30 L100 20 L130 90 L70 100 Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M40 30 L35 35 L65 105 L70 100" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M65 105 L125 95 L130 90" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      
      {/* Title on book */}
      <g transform="rotate(-10 70 50)">
        <rect x="65" y="45" width="40" height="4" rx="2" fill="currentColor" />
        <rect x="70" y="53" width="30" height="3" rx="1.5" fill="currentColor" opacity="0.6" />
        <rect x="65" y="65" width="20" height="2" rx="1" fill="currentColor" opacity="0.4" />
        <rect x="65" y="70" width="35" height="2" rx="1" fill="currentColor" opacity="0.4" />
        <rect x="65" y="75" width="25" height="2" rx="1" fill="currentColor" opacity="0.4" />
      </g>

      {/* Phone */}
      <g transform="rotate(15 110 30)">
        <rect x="110" y="30" width="45" height="80" rx="6" stroke="currentColor" strokeWidth="2" fill="#0f172a" />
        <rect x="114" y="34" width="37" height="72" rx="3" stroke="currentColor" strokeWidth="1" />
        
        {/* Scanning frame on phone */}
        <path d="M118 40 L116 40 L116 42" stroke="#34d399" strokeWidth="1.5" />
        <path d="M147 40 L149 40 L149 42" stroke="#34d399" strokeWidth="1.5" />
        <path d="M118 80 L116 80 L116 78" stroke="#34d399" strokeWidth="1.5" />
        <path d="M147 80 L149 80 L149 78" stroke="#34d399" strokeWidth="1.5" />
        
        {/* Mini book inside phone */}
        <rect x="122" y="48" width="20" height="25" rx="1" stroke="currentColor" strokeWidth="1" />
        <line x1="125" y1="53" x2="137" y2="53" stroke="currentColor" strokeWidth="1" />
        <line x1="125" y1="57" x2="134" y2="57" stroke="currentColor" strokeWidth="0.5" />
      </g>
    </svg>
  );
}

interface ScannerInstructionProps {
  type: 'barcode' | 'cover';
}

export default function ScannerInstruction({ type }: ScannerInstructionProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
    }, 4000); // Hide after 4 seconds
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none p-4"
        >
          <div className="bg-slate-900/85 backdrop-blur-md border border-white/10 p-6 rounded-3xl shadow-2xl max-w-[260px] w-full flex flex-col items-center text-center">
            <div className="w-40 h-32 mb-4 text-white">
              {type === 'barcode' ? <BarcodeInstructionGraphic /> : <CoverInstructionGraphic />}
            </div>
            <h3 className="text-white font-bold text-lg mb-1">
              {type === 'barcode' ? 'Scan Barcode' : 'Scan Cover'}
            </h3>
            <p className="text-slate-300 text-sm leading-tight">
              {type === 'barcode' 
                ? 'Position the barcode on the back of the book within the frame.' 
                : 'Position the entire front cover of the book within the frame.'}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
