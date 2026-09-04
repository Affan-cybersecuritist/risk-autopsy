import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, AlertCircle, Building2, User } from 'lucide-react';

export default function VIPFalloutSandbox() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-6 border-t border-neutral-200 pt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="font-bold text-neutral-900 flex items-center gap-2">
            VIP Fallout Sandbox
            <span className="bg-purple-100 text-purple-700 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">Illustrative, not real records</span>
          </h4>
          <p className="text-xs text-neutral-500 mt-0.5">
            Two fictional personas illustrating the kind of complaint a false-positive block can generate — not drawn
            from this dataset, which has no names or free-text complaints.
          </p>
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="btn-secondary text-xs px-3 py-1.5 rounded-lg flex items-center gap-2"
        >
          <Mail size={14} /> {isOpen ? 'Hide examples' : 'Show illustrative examples'}
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }} 
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              
              {/* VIP 1 */}
              <div className="bg-white border border-[#B23A48]/20 shadow-sm rounded-xl p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-12 h-12 bg-[#B23A48]/5 rounded-bl-full z-0" />
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <div className="bg-blue-100 p-1.5 rounded-md text-blue-700"><Building2 size={16} /></div>
                      <div>
                        <div className="text-sm font-bold text-neutral-900">Acme Corp Ltd.</div>
                        <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Enterprise Tier • LTV: ₹4,500,000</div>
                      </div>
                    </div>
                    <span className="text-[10px] text-[#B23A48] font-bold bg-[#B23A48]/10 px-2 py-1 rounded">HIGH RISK</span>
                  </div>
                  <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-100 font-serif text-sm text-neutral-700 italic">
                    "Our procurement team has been blocked from making our monthly hardware purchase. We spend ₹5L a month with you. Please unblock this immediately or we will switch payment gateways today."
                  </div>
                </div>
              </div>

              {/* VIP 2 */}
              <div className="bg-white border border-neutral-200 shadow-sm rounded-xl p-4 relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <div className="bg-emerald-100 p-1.5 rounded-md text-emerald-700"><User size={16} /></div>
                      <div>
                        <div className="text-sm font-bold text-neutral-900">Dr. S. Raman</div>
                        <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Premium • LTV: ₹350,000</div>
                      </div>
                    </div>
                    <span className="text-[10px] text-orange-600 font-bold bg-orange-100 px-2 py-1 rounded">MED RISK</span>
                  </div>
                  <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-100 font-serif text-sm text-neutral-700 italic">
                    "I am trying to buy a flight ticket for a conference and my transaction is repeatedly failing. Why is my account flagged? This is very frustrating."
                  </div>
                </div>
              </div>

            </div>
            
            <div className="mt-4 flex items-start gap-2 bg-neutral-100 p-3 rounded-lg text-xs text-neutral-600">
              <AlertCircle size={16} className="text-neutral-400 flex-none mt-0.5" />
              <div>
                <strong>Risk Manager Note:</strong> Blocking these users saves ₹40,000 in potential fraud, but risks ₹4,850,000 in Lifetime Value. Ensure step-up verification (e.g. OTP) is enabled rather than a hard block.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
