import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Shield, Crosshair, Wrench, Play } from 'lucide-react';

const STAGES = [
  { id: 'autopsy', title: 'Autopsy', icon: <Activity size={16} />, desc: 'Reconstructing decision chain from loss data.', status: 'success' },
  { id: 'discover', title: 'Discover', icon: <Crosshair size={16} />, desc: 'Identifying behavioral features and generating candidate rules.', status: 'success' },
  { id: 'attack', title: 'Attack', icon: <Shield size={16} />, desc: 'Adversarial agent found evasion via time_to_escalation.', status: 'warn' },
  { id: 'harden', title: 'Harden', icon: <Wrench size={16} />, desc: 'Policy retrained. Evasion gap closed. 40/40 attempts blocked.', status: 'success' },
];

export default function AITimelineScrubber() {
  const [activeStep, setActiveStep] = useState(3);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlay = () => {
    setIsPlaying(true);
    setActiveStep(0);
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step >= STAGES.length) {
        clearInterval(interval);
        setIsPlaying(false);
      } else {
        setActiveStep(step);
      }
    }, 1500);
  };

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-5 mb-8 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-bold text-neutral-900 flex items-center gap-2">
            AI Audit Trail
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] uppercase tracking-wide">Interactive Replay</span>
          </h3>
          <p className="text-xs text-neutral-500 mt-1">Review exactly how the Autonomous Engineer arrived at this policy.</p>
        </div>
        <button 
          onClick={handlePlay}
          disabled={isPlaying}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
        >
          <Play size={14} /> Replay Analysis
        </button>
      </div>

      <div className="relative">
        <div className="absolute top-4 left-0 w-full h-1 bg-neutral-100 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-blue-500" 
            initial={{ width: 0 }}
            animate={{ width: `${(activeStep / (STAGES.length - 1)) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        <div className="relative flex justify-between">
          {STAGES.map((stage, idx) => {
            const isActive = idx === activeStep;
            const isPast = idx <= activeStep;
            
            let colorClass = 'bg-neutral-200 text-neutral-400';
            if (isPast) {
              if (stage.status === 'warn') colorClass = 'bg-orange-500 text-white';
              else colorClass = 'bg-blue-500 text-white';
            }

            return (
              <div 
                key={stage.id} 
                className="flex flex-col items-center cursor-pointer group"
                onClick={() => !isPlaying && setActiveStep(idx)}
              >
                <motion.div 
                  className={`w-9 h-9 rounded-full flex items-center justify-center z-10 border-4 border-white transition-colors ${colorClass}`}
                  animate={isActive ? { scale: 1.2 } : { scale: 1 }}
                >
                  {stage.icon}
                </motion.div>
                <div className="mt-3 text-center w-32">
                  <div className={`text-xs font-bold ${isActive ? 'text-neutral-900' : 'text-neutral-500'}`}>
                    {stage.title}
                  </div>
                  <AnimatePresence>
                    {isActive && (
                      <motion.div 
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-[10px] text-neutral-500 mt-1 leading-tight"
                      >
                        {stage.desc}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
