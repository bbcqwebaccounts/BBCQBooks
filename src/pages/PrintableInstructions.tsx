import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, ScanLine, Book, Camera, Keyboard, BellRing, Library, ArrowRight } from 'lucide-react';

export default function PrintableInstructions() {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans print:bg-white">
      {/* Print-only styles */}
      <style>
        {`
          @media print {
            @page {
              size: A4;
              margin: 0;
            }
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              background-color: white !important;
            }
            .no-print {
              display: none !important;
            }
            .print-container {
              width: 210mm;
              height: 297mm;
              padding: 20mm;
              margin: 0 auto;
              box-sizing: border-box;
              page-break-after: always;
            }
          }
          @media screen {
            .print-container {
              max-width: 210mm;
              min-height: 297mm;
              margin: 2rem auto;
              padding: 2rem;
              background: white;
              box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
            }
          }
        `}
      </style>

      {/* Screen-only controls */}
      <div className="no-print fixed top-4 right-4 flex gap-4">
        <button 
          onClick={() => window.print()}
          className="px-6 py-2.5 bg-[#1a202c] text-white font-medium rounded-xl shadow-sm hover:bg-slate-800 transition-colors flex items-center gap-2"
        >
          <ScanLine className="w-5 h-5" />
          Print Instructions
        </button>
        <button 
          onClick={() => window.close()}
          className="px-6 py-2.5 bg-white text-slate-700 font-medium rounded-xl shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          Close
        </button>
      </div>

      <div className="print-container flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-slate-100 pb-8 mb-10">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-[#1a202c] text-white rounded-2xl flex items-center justify-center">
              <Library className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-slate-900">Library Self-Service</h1>
              <p className="text-xl text-slate-500 mt-1">Borrow and return books in seconds</p>
            </div>
          </div>
          <div className="text-right">
            <div className="inline-block p-4 bg-white border-2 border-slate-100 rounded-3xl shadow-sm">
              <QRCodeSVG 
                value="https://bbcqbooks.pages.dev/" 
                size={140}
                level="H"
                includeMargin={false}
              />
            </div>
            <p className="text-sm font-bold text-slate-600 mt-3 flex items-center justify-center gap-1">
              <Smartphone className="w-4 h-4" /> Scan to start
            </p>
          </div>
        </div>

        {/* Main Instructions */}
        <div className="flex-1 flex flex-col gap-10">
          
          <div className="flex gap-6 items-start">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 text-2xl font-bold text-slate-900">1</div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Open the Library App</h2>
              <p className="text-lg text-slate-600">Scan the QR code above with your phone's camera to open the library portal.</p>
            </div>
          </div>

          <div className="flex gap-6 items-start">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 text-2xl font-bold text-slate-900">2</div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Choose an Action</h2>
              <p className="text-lg text-slate-600 mb-4">Tap on <strong className="text-slate-900">Borrow</strong> or <strong className="text-slate-900">Return</strong> on the home screen.</p>
            </div>
          </div>

          <div className="flex gap-6 items-start">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 text-2xl font-bold text-slate-900">3</div>
            <div className="w-full">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Identify Your Book</h2>
              <p className="text-lg text-slate-600 mb-8">Use one of these three easy methods to find the book:</p>
              
              <div className="grid grid-cols-3 gap-6">
                {/* Method 1: Barcode */}
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col items-center text-center">
                  <div className="h-32 w-full flex items-center justify-center relative mb-4">
                    {/* Custom SVG for Barcode Scanning */}
                    <svg viewBox="0 0 200 150" className="w-full h-full text-slate-800">
                      <rect x="30" y="20" width="100" height="110" rx="4" fill="white" stroke="currentColor" strokeWidth="2" />
                      {/* Barcode on book */}
                      <rect x="50" y="90" width="60" height="30" fill="white" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M55 95 v20 M60 95 v20 M63 95 v20 M68 95 v20 M72 95 v20 M75 95 v20 M80 95 v20 M85 95 v20 M88 95 v20 M92 95 v20 M95 95 v20 M100 95 v20 M105 95 v20" stroke="currentColor" strokeWidth="1.5" />
                      {/* Phone scanning */}
                      <rect x="110" y="40" width="60" height="100" rx="8" fill="white" stroke="currentColor" strokeWidth="2" />
                      <rect x="115" y="45" width="50" height="90" rx="4" fill="#f8fafc" stroke="currentColor" strokeWidth="1" />
                      {/* Scan line */}
                      <path d="M120 80 h40" stroke="#ef4444" strokeWidth="2" strokeDasharray="4 2" />
                      {/* Arrow */}
                      <path d="M100 60 Q 120 40 140 60" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
                      <polygon points="135,55 140,60 145,55" fill="currentColor" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-lg text-slate-900 mb-2 flex items-center gap-2 justify-center">
                    <ScanLine className="w-5 h-5" /> Scan Barcode
                  </h3>
                  <p className="text-sm text-slate-500">Scan the library barcode on the back of the book.</p>
                </div>

                {/* Method 2: Cover */}
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col items-center text-center">
                  <div className="h-32 w-full flex items-center justify-center relative mb-4">
                    {/* Custom SVG for Cover Scanning */}
                    <svg viewBox="0 0 200 150" className="w-full h-full text-slate-800">
                      <rect x="30" y="20" width="100" height="110" rx="4" fill="white" stroke="currentColor" strokeWidth="2" />
                      <text x="80" y="60" fontSize="12" fontWeight="bold" textAnchor="middle" fill="currentColor">BOOK TITLE</text>
                      <text x="80" y="75" fontSize="8" textAnchor="middle" fill="currentColor">AUTHOR NAME</text>
                      {/* Phone scanning */}
                      <rect x="110" y="40" width="60" height="100" rx="8" fill="white" stroke="currentColor" strokeWidth="2" />
                      <rect x="115" y="45" width="50" height="90" rx="4" fill="#f8fafc" stroke="currentColor" strokeWidth="1" />
                      {/* Viewfinder */}
                      <path d="M125 60 h5 v-5 M155 60 h-5 v-5 M125 100 h5 v5 M155 100 h-5 v5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      <rect x="130" y="65" width="20" height="25" fill="none" stroke="currentColor" strokeWidth="1" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-lg text-slate-900 mb-2 flex items-center gap-2 justify-center">
                    <Camera className="w-5 h-5" /> Scan Cover
                  </h3>
                  <p className="text-sm text-slate-500">Take a clear photo of the entire front cover.</p>
                </div>

                {/* Method 3: Manual */}
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col items-center text-center">
                  <div className="h-32 w-full flex items-center justify-center relative mb-4">
                    <div className="w-24 h-24 bg-white rounded-xl border-2 border-slate-200 flex items-center justify-center shadow-sm">
                      <Keyboard className="w-12 h-12 text-slate-400" />
                    </div>
                  </div>
                  <h3 className="font-bold text-lg text-slate-900 mb-2 flex items-center gap-2 justify-center">
                    <Book className="w-5 h-5" /> Type Title
                  </h3>
                  <p className="text-sm text-slate-500">Search for the book by typing its title or author.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-6 items-start">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 text-2xl font-bold text-slate-900">4</div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Confirm & Done</h2>
              <p className="text-lg text-slate-600">Review the details on screen and tap confirm. You're all set!</p>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-12 bg-slate-50 border border-slate-200 rounded-2xl p-6 flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
            <BellRing className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-slate-900 text-lg">SMS Reminders Included</h4>
            <p className="text-slate-600 mt-1">
              When you borrow a book, you'll automatically receive a friendly SMS reminder when your book is due to be returned. No need to worry about late fees!
            </p>
          </div>
        </div>
        
        <div className="mt-8 text-center text-slate-400 text-sm font-medium">
          Powered by BBCQ Books Library System
        </div>
      </div>
    </div>
  );
}
