import { motion } from 'framer-motion';
import { Star, ChevronRight, Camera, Timer, ShieldAlert } from 'lucide-react';
import { themedTitle } from '../utils/questThemeText';

export default function QuestCard({ assignment, idx, colorTheme, activeTheme, onClick }) {
  const chore = assignment.chore;
  if (!chore) return null;

  const difficultyColors = {
    easy: 'bg-emerald/10 text-emerald border-emerald/20',
    medium: 'bg-nb-yellow/10 text-nb-black border-nb-black/10',
    hard: 'bg-nb-red/10 text-nb-red border-nb-red/20',
    expert: 'bg-nb-black text-nb-white border-nb-black',
  };

  const status = assignment.status;
  const isPending = status === 'pending' || status === 'assigned';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.05 }}
      whileHover={{ scale: 1.01, x: 4 }}
      onClick={onClick}
      className={`game-panel p-4 cursor-pointer relative overflow-hidden group ${
        isPending ? 'border-nb-black' : 'opacity-60 grayscale-[0.5]'
      }`}
      style={activeTheme?.cardAccent ? {
        borderColor: `${activeTheme.cardAccent}`,
        boxShadow: `4px 4px 0 0 ${activeTheme.cardAccent}`,
      } : undefined}
    >
      {/* Category Accent */}
      <div 
        className="absolute top-0 left-0 w-2 h-full" 
        style={{ backgroundColor: chore.category?.colour || '#FFE500' }}
      />

      <div className="pl-3 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
             <h3 className="text-base font-black uppercase tracking-tight truncate">
              {themedTitle(chore.title, colorTheme)}
            </h3>
            {chore.requires_photo && <Camera size={14} className="text-muted" />}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 bg-nb-black text-nb-yellow px-2 py-0.5 text-[10px] font-black uppercase tracking-tighter">
              <Star size={10} fill="currentColor" />
              {chore.points} XP
            </span>

            <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-tighter border ${difficultyColors[chore.difficulty]}`}>
              {chore.difficulty}
            </span>

            {chore.category?.name && (
              <span className="text-[10px] font-bold uppercase text-muted tracking-widest">
                {chore.category.name}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end justify-between self-stretch">
          <div className="bg-nb-white border-2 border-nb-black p-1 shadow-[2px_2px_0_0_#000] group-hover:bg-nb-yellow transition-colors">
            <ChevronRight size={16} />
          </div>
          
          {isPending && (
            <motion.div 
               animate={{ opacity: [0.4, 1, 0.4] }}
               transition={{ duration: 2, repeat: Infinity }}
               className="text-[9px] font-black text-nb-red uppercase tracking-tighter mt-4"
            >
              Active Quest
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
