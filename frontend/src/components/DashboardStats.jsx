import { motion } from 'framer-motion';
import { Star, Flame, Trophy } from 'lucide-react';

export default function DashboardStats({ points, streak, rank }) {
  return (
    <div className="grid grid-cols-2 gap-3 mb-2">
      <motion.div 
        className="game-panel p-3 bg-nb-yellow flex items-center justify-between"
        whileHover={{ scale: 1.02 }}
      >
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-wider opacity-60">Total XP</span>
          <span className="text-xl font-black">{points}</span>
        </div>
        <Star className="text-nb-black" size={24} fill="currentColor" />
      </motion.div>

      <motion.div 
        className="game-panel p-3 bg-nb-white flex items-center justify-between"
        whileHover={{ scale: 1.02 }}
      >
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-wider opacity-60">Streak</span>
          <span className="text-xl font-black">{streak} Days</span>
        </div>
        <Flame className={streak > 0 ? "text-nb-red" : "text-muted"} size={24} fill={streak > 0 ? "currentColor" : "none"} />
      </motion.div>

      {rank && (
        <motion.div 
          className="game-panel col-span-2 p-3 bg-nb-black text-nb-yellow flex items-center gap-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Trophy size={20} />
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-wider opacity-60 text-nb-yellow/60">Current Rank</span>
            <span className="text-sm font-black uppercase">{rank.title || rank}</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
