import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CalendarCheck, AlertCircle, Loader2, ArrowLeft, BookOpen, CheckSquare, Square } from 'lucide-react';
import { motion } from 'motion/react';

export default function ExtendLoan() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'confirm' | 'extending' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [targetLoan, setTargetLoan] = useState<any>(null);
  const [otherLoans, setOtherLoans] = useState<any[]>([]);
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<any[]>([]);
  const [maxBorrowWeeks, setMaxBorrowWeeks] = useState(0);

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await fetch(`/api/extend-info/${token}`);
        const data = await res.json();
        
        if (res.ok) {
          setTargetLoan(data.targetLoan);
          setOtherLoans(data.otherLoans);
          setMaxBorrowWeeks(data.maxBorrowWeeks || 0);
          
          // Only select target loan if it can be extended
          const canExtend = (loan: any) => {
            if (!data.maxBorrowWeeks) return true;
            const borrowDate = new Date(loan.borrow_date);
            const newDueDate = new Date(loan.due_date);
            newDueDate.setDate(newDueDate.getDate() + 7);
            const diffTime = Math.abs(newDueDate.getTime() - borrowDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays <= data.maxBorrowWeeks * 7;
          };

          if (canExtend(data.targetLoan)) {
            setSelectedTokens(new Set([token as string]));
          }
          setStatus('confirm');
        } else {
          setStatus('error');
          setMessage(data.error || 'Failed to load loan information.');
        }
      } catch (err) {
        setStatus('error');
        setMessage('A network error occurred.');
      }
    };

    if (token) {
      fetchInfo();
    }
  }, [token]);

  const canExtend = (loan: any) => {
    if (!maxBorrowWeeks) return true;
    const borrowDate = new Date(loan.borrow_date);
    const newDueDate = new Date(loan.due_date);
    newDueDate.setDate(newDueDate.getDate() + 7);
    const diffTime = Math.abs(newDueDate.getTime() - borrowDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= maxBorrowWeeks * 7;
  };

  const toggleSelection = (t: string) => {
    const newSet = new Set(selectedTokens);
    if (newSet.has(t)) {
      newSet.delete(t);
    } else {
      newSet.add(t);
    }
    setSelectedTokens(newSet);
  };

  const handleExtend = async () => {
    if (selectedTokens.size === 0) return;
    
    setStatus('extending');
    try {
      const res = await fetch('/api/extend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tokens: Array.from(selectedTokens) })
      });
      const data = await res.json();
      
      if (res.ok) {
        // Cancel old SMS reminders and create new ones
        try {
          const results = data.results || [];
          if (results.length > 0) {
            // 1. Cancel old reminders
            const batchIds = results.map((loan: any) => `Library-${loan.id}`);
            await fetch('/api/messages/cancel-by-batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ batchIds })
            });

            // 2. Create new reminders
            for (const loan of results) {
              if (loan.user_phone) {
                const [firstName, ...surnameParts] = loan.user_name.split(' ');
                const surname = surnameParts.join(' ');
                
                await fetch('/api/messages', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    firstName,
                    surname,
                    phone: loan.user_phone,
                    email: loan.user_email || '',
                    scheduledTime: loan.sms_scheduled_time,
                    message: loan.sms_message,
                    status: 'Queued',
                    batchId: `Library-${loan.id}`
                  })
                });
              }
            }
          }
        } catch (err) {
          console.error('Failed to update SMS reminders:', err);
        }

        setStatus('success');
        setMessage(data.message);
        setResults(data.results || []);
      } else {
        setStatus('error');
        setMessage(data.error || 'Failed to extend loan(s).');
      }
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'A network error occurred while extending.');
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-100 p-8 text-center"
      >
        {(status === 'loading' || status === 'extending') && (
          <div className="space-y-4">
            <Loader2 className="w-12 h-12 text-[#1a202c] animate-spin mx-auto" />
            <h2 className="text-xl font-bold text-slate-900">
              {status === 'loading' ? 'Loading loan details...' : 'Extending loan(s)...'}
            </h2>
            <p className="text-slate-500">Please wait while we update our records.</p>
          </div>
        )}

        {status === 'confirm' && targetLoan && (
          <div className="space-y-6 text-left">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <CalendarCheck className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Extend Loan</h2>
              <p className="text-slate-600">Would you like to extend your loan by 1 week?</p>
            </div>
            
            <div className={`p-4 rounded-2xl border ${canExtend(targetLoan) ? 'bg-slate-50 border-slate-100' : 'bg-rose-50 border-rose-100'}`}>
              <div className="flex items-start gap-3">
                {targetLoan.cover_url ? (
                  <img src={targetLoan.cover_url} alt={targetLoan.title} className="w-12 h-16 object-cover rounded shadow-sm" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-12 h-16 bg-slate-200 rounded flex items-center justify-center text-slate-400">
                    <BookOpen className="w-6 h-6" />
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="font-bold text-slate-900 line-clamp-2">{targetLoan.title}</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Current Due: {new Date(targetLoan.due_date).toLocaleDateString()}
                  </p>
                  {!canExtend(targetLoan) && (
                    <p className="text-xs text-rose-600 mt-2 font-medium">
                      Cannot extend: Exceeds maximum borrow limit of {maxBorrowWeeks} weeks.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {otherLoans.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Other Active Loans</h4>
                <div className="space-y-2">
                  {otherLoans.map(loan => {
                    const extendable = canExtend(loan);
                    return (
                    <button
                      key={loan.id}
                      onClick={() => extendable && toggleSelection(loan.extension_token)}
                      disabled={!extendable}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                        !extendable ? 'bg-slate-50 border-slate-100 opacity-60 cursor-not-allowed' :
                        selectedTokens.has(loan.extension_token) 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-slate-200 hover:border-blue-300'
                      }`}
                    >
                      <div className={`text-${!extendable ? 'slate-300' : selectedTokens.has(loan.extension_token) ? 'blue-600' : 'slate-400'}`}>
                        {selectedTokens.has(loan.extension_token) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 truncate">{loan.title}</p>
                        <p className="text-xs text-slate-500">Due: {new Date(loan.due_date).toLocaleDateString()}</p>
                        {!extendable && (
                          <p className="text-[10px] text-rose-500 mt-1 font-medium">Max limit reached</p>
                        )}
                      </div>
                    </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="pt-4 flex flex-col gap-3">
              <button
                onClick={handleExtend}
                disabled={selectedTokens.size === 0}
                className="w-full py-3 bg-[#1a202c] text-white font-bold rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Extend Selected ({selectedTokens.size})
              </button>
              <Link 
                to="/"
                className="w-full py-3 bg-white text-slate-700 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-center"
              >
                Cancel
              </Link>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-6">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CalendarCheck className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Loan(s) Extended!</h2>
              <p className="text-slate-600">{message}</p>
            </div>
            
            {results.length > 0 && (
              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 text-left">
                <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest mb-2">Updated Due Dates</p>
                <div className="space-y-2">
                  {results.map((r: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center text-sm">
                      <span className="text-emerald-800 font-medium">Loan #{r.id}</span>
                      <span className="text-emerald-900 font-bold">
                        {r.new_due_date && !isNaN(new Date(r.new_due_date).getTime()) 
                          ? new Date(r.new_due_date).toLocaleDateString() 
                          : 'Invalid Date'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Link 
              to="/"
              className="inline-flex items-center gap-2 text-[#1a202c] font-bold hover:underline"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Catalogue
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-6">
            <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Extension Failed</h2>
              <p className="text-slate-600">{message}</p>
            </div>
            
            <div className="p-4 bg-slate-50 rounded-2xl text-sm text-slate-500">
              {message.includes('Google session expired') ? (
                <>
                  It looks like your Google session has expired. Please go to the <Link to="/admin" className="text-indigo-600 hover:underline">Admin Settings</Link> and disconnect/reconnect your Google account.
                </>
              ) : (
                'If you believe this is an error, please contact the library administrator.'
              )}
            </div>

            <Link 
              to="/"
              className="inline-flex items-center gap-2 text-[#1a202c] font-bold hover:underline"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Catalogue
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
}
