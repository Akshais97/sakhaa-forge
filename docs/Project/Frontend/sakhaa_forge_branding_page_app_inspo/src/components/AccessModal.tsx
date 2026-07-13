import { useState, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Sparkles, Check, ChevronRight, ShieldCheck, Ticket } from 'lucide-react';
import { BrandData } from '../types';

interface AccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeBrand: BrandData;
}

export default function AccessModal({ isOpen, onClose, activeBrand }: AccessModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [volume, setVolume] = useState('10-50');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name || !email || !company) return;
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
    }, 1500);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-xl"
            id="modal-backdrop"
          />

          {/* Premium Glass Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 180 }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/90 p-8 shadow-2xl backdrop-blur-2xl"
            id="modal-container"
          >
            {/* Ambient gold glow matching the selected brand */}
            <div
              className="absolute -right-20 -top-20 h-60 w-60 rounded-full blur-[80px]"
              style={{
                background: `radial-gradient(circle, ${activeBrand.primaryColor}22 0%, transparent 70%)`
              }}
            />

            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute right-4 top-4 rounded-full border border-white/5 bg-white/5 p-2 text-zinc-400 hover:bg-white/10 hover:text-white transition-all duration-200"
              id="close-modal-btn"
            >
              <X className="h-4 w-4" />
            </button>

            {!isSuccess ? (
              <form onSubmit={handleSubmit} className="relative z-10 space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="px-2.5 py-0.5 text-[10px] font-mono tracking-widest uppercase rounded border"
                      style={{
                        borderColor: `${activeBrand.primaryColor}33`,
                        color: activeBrand.primaryColor,
                        backgroundColor: `${activeBrand.primaryColor}0a`
                      }}
                    >
                      Exclusive Access
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-zinc-500 font-mono">
                      <ShieldCheck className="h-3 w-3 text-emerald-500" /> Human Approved
                    </span>
                  </div>
                  <h3 className="text-2xl font-display font-medium tracking-tight text-white">
                    Enter the Forge
                  </h3>
                  <p className="text-sm text-zinc-400 mt-1">
                    Connect your brand guidelines to our structural synthesis engine. Live validation & zero boilerplate.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Name field */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Rohan Malhotra"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-white/20 focus:bg-white/10 transition-all duration-200 font-sans"
                    />
                  </div>

                  {/* Email field */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">
                      Corporate Email
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g., rohan@auraestates.in"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-white/20 focus:bg-white/10 transition-all duration-200 font-sans"
                    />
                  </div>

                  {/* Company field */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">
                      Company Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Aura Luxury India"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-white/20 focus:bg-white/10 transition-all duration-200 font-sans"
                    />
                  </div>

                  {/* Video Volume Selector */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-2">
                      Monthly Short-form Video Budget
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: '< 10 Reels', value: 'under-10' },
                        { label: '10–50 Reels', value: '10-50' },
                        { label: '50+ Reels', value: '50-plus' }
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setVolume(opt.value)}
                          className={`rounded-lg border px-3 py-2 text-xs font-mono text-center transition-all duration-200 ${
                            volume === opt.value
                              ? 'bg-white/10 text-white border-white/30 shadow'
                              : 'bg-white/2 border-white/5 text-zinc-400 hover:bg-white/5'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="relative w-full overflow-hidden rounded-xl py-3 text-xs font-mono tracking-widest uppercase transition-all duration-200 active:scale-95 disabled:opacity-50 text-black font-semibold"
                  style={{ backgroundColor: activeBrand.primaryColor }}
                  id="submit-access-form-btn"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {isSubmitting ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-black" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Verifying Brand...
                      </>
                    ) : (
                      <>
                        Request Priority Access <ChevronRight className="h-4 w-4" />
                      </>
                    )}
                  </span>
                </button>

                <div className="text-center">
                  <p className="text-[10px] text-zinc-500 font-mono uppercase">
                    By submitting, you agree to secure consent verification.
                  </p>
                </div>
              </form>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative z-10 text-center py-12 space-y-6"
              >
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Check className="h-8 w-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-display font-medium text-white">
                    Access Requested Successfully
                  </h3>
                  <p className="text-sm text-zinc-400 max-w-sm mx-auto">
                    A provisional workspace is being provisioned for <strong className="text-white">{company}</strong> matching the <strong style={{ color: activeBrand.primaryColor }}>{activeBrand.name}</strong> blueprint parameters.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-white/5 bg-white/2 max-w-sm mx-auto flex items-center gap-3">
                  <Ticket className="h-5 w-5 flex-shrink-0" style={{ color: activeBrand.primaryColor }} />
                  <div className="text-left">
                    <p className="text-xs text-white font-mono">WORKSPACE_PROV_INIT</p>
                    <p className="text-[10px] text-zinc-400 font-mono">LE-HASH: {activeBrand.reviewItem.hash.substring(7, 23)}</p>
                  </div>
                </div>

                <button
                  onClick={onClose}
                  className="rounded-lg border border-white/10 bg-white/5 px-6 py-2.5 text-xs font-mono uppercase tracking-wider text-white hover:bg-white/10 transition-all duration-200"
                  id="close-success-modal-btn"
                >
                  Return to Command Center
                </button>
              </motion.div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
