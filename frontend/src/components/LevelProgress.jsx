import { motion } from 'framer-motion';

export default function LevelProgress({ completed, total, xp, rank }) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  // XP to next level logic (simulated for UI)
  const nextLevelXP = 1000; // Placeholder logic
  const xpProgress = (xp % nextLevelXP) / nextLevelXP * 100;

  return (
    <div className="game-panel p-4 bg-nb-black text-nb-white relative overflow-hidden">
      <div className="relative z-10">
        <div className="flex justify-between items-end mb-2">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-nb-yellow opacity-80">Daily Progress</span>
            <div className="text-xl font-black">{completed} / {total} <span className="text-xs opacity-60">Quests</span></div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-black uppercase tracking-widest text-nb-yellow opacity-80">Efficiency</span>
            <div className="text-xl font-black">{percentage}%</div>
          </div>
        </div>

        <div className="xp-bar h-4 border-nb-yellow bg-nb-white/10">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="xp-bar-fill bg-nb-yellow h-full relative"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-nb-white/30 animate-pulse" />
          </motion.div>
        </div>
        
        <div className="mt-3 pt-3 border-t border-nb-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-nb-yellow text-nb-black flex items-center justify-center font-black text-xs">
                    {rank?.level || 1}
                </div>
                <div className="flex flex-col">
                    <span className="text-[8px] font-black uppercase tracking-tighter text-muted-foreground">Current Level</span>
                    <span className="text-[10px] font-black uppercase text-nb-yellow">{rank?.title || 'Hatchling'}</span>
                </div>
            </div>
            <div className="text-right">
                <span className="text-[8px] font-black uppercase tracking-tighter text-muted-foreground">Next Rank In</span>
                <div className="text-[10px] font-black uppercase">{Math.max(0, 500 - (xp % 500))} XP</div>
            </div>
        </div>
      </div>
      
      {/* Background decoration */}
      <div className="absolute -right-4 -bottom-4 opacity-5 rotate-12 pointer-events-none">
        <div className="text-8xl font-black">QUEST</div>
      </div>
    </div>
  );
}
