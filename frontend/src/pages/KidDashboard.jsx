import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Star,
  Sword,
  CheckCircle2,
  CheckCheck,
  Skull,
  Camera,
  Loader2,
  AlertTriangle,
  ChevronRight,
  Heart,
  HandHeart,
  Gamepad2,
  ShieldOff,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useSettings } from '../hooks/useSettings';
import { useTheme } from '../hooks/useTheme';
import { themedTitle } from '../utils/questThemeText';
import SpinWheel from '../components/SpinWheel';
import ConfettiAnimation from '../components/ConfettiAnimation';
import RankBadge from '../components/RankBadge';
import PetLevelBadge from '../components/PetLevelBadge';
import { QuestBoardOverlay, QuestBoardPageGlow, QuestBoardParticles, QuestBoardDecorations, QuestBoardTitle, BOARD_THEMES, getTheme } from '../components/QuestBoardTheme';
import { renderPet, renderPetExtras, renderPetAccessory, buildPetColors } from '../components/avatar';
import XPBalanceChart from '../components/XPBalanceChart';
import DashboardStats from '../components/DashboardStats';
import QuestCard from '../components/QuestCard';
import LevelProgress from '../components/LevelProgress';

// ---------- helpers ----------

function getLocalISO(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMondayOfThisWeek() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return getLocalISO(monday);
}

function todayISO() {
  return getLocalISO(new Date());
}

function difficultyLabel(difficulty) {
  switch (difficulty) {
    case 'easy':
      return { text: 'Easy', color: 'text-emerald bg-emerald/10 border-emerald/20' };
    case 'medium':
      return { text: 'Medium', color: 'text-gold bg-gold/10 border-gold/20' };
    case 'hard':
      return { text: 'Hard', color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' };
    case 'expert':
      return { text: 'Expert', color: 'text-crimson bg-crimson/10 border-crimson/20' };
    default:
      return { text: 'Easy', color: 'text-emerald bg-emerald/10 border-emerald/20' };
  }
}

// ---------- card animation variants ----------

const cardVariants = {
  hidden: { opacity: 0 },
  visible: (i) => ({
    opacity: 1,
    transition: { delay: i * 0.04, duration: 0.15 },
  }),
};

// ---------- component ----------

export default function KidDashboard() {
  const { user, updateUser } = useAuth();
  const { spin_wheel_enabled } = useSettings();
  const { colorTheme } = useTheme();
  const navigate = useNavigate();

  // data state
  const [assignments, setAssignments] = useState([]);
  const [chores, setChores] = useState([]);
  const [spinAvailability, setSpinAvailability] = useState(null);
  const [myStats, setMyStats] = useState(null);

  // ui state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);

  // Pet interactions
  const [petInteracting, setPetInteracting] = useState(null);
  const [petAction, setPetAction] = useState(null); // holds last action for animation
  const [petMessage, setPetMessage] = useState('');
  const [interactionsRemaining, setInteractionsRemaining] = useState(3);

  // Board theme — stored in localStorage
  const [boardTheme, setBoardTheme] = useState(() =>
    localStorage.getItem('dinoquest-board-theme') || 'default'
  );
  const changeBoardTheme = (id) => {
    setBoardTheme(id);
    localStorage.setItem('dinoquest-board-theme', id);
    setShowThemePicker(false);
  };

  // ---- data fetching ----

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const monday = getMondayOfThisWeek();
      const today = todayISO();

      const promises = [
        api('/api/chores'),
        api(`/api/calendar?week_start=${monday}`),
      ];
      if (spin_wheel_enabled) {
        promises.push(api('/api/spin/availability'));
      }
      promises.push(api('/api/stats/me'));

      const results = await Promise.all(promises);
      const choresRes = results[0];
      const calendarRes = results[1];
      const spinRes = spin_wheel_enabled ? results[2] : null;
      const statsRes = results[spin_wheel_enabled ? 3 : 2];
      if (statsRes) {
        setMyStats(statsRes);
        if (statsRes.interactions_remaining != null) {
          setInteractionsRemaining(statsRes.interactions_remaining);
        }
      }

      setChores(choresRes);

      // Filter calendar assignments to today and this user only
      const allToday = (calendarRes.days && calendarRes.days[today]) || [];
      const todayAssignments = allToday.filter((a) => a.user_id === user?.id);
      setAssignments(todayAssignments);

      setSpinAvailability(spinRes);
    } catch (err) {
      setError(err.message || 'Failed to load quest data');
    } finally {
      setLoading(false);
    }
  }, [user?.id, spin_wheel_enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---- WebSocket listener ----

  useEffect(() => {
    const handler = () => {
      fetchData();
    };
    window.addEventListener('ws:message', handler);
    return () => window.removeEventListener('ws:message', handler);
  }, [fetchData]);


  // ---- pet interaction ----
  const handlePetInteraction = async (action) => {
    setPetInteracting(action);
    setPetAction(action);
    setPetMessage('');
    try {
      const res = await api('/api/pets/interact', { method: 'POST', body: { action } });
      setInteractionsRemaining(res.interactions_remaining);
      const labels = { feed: 'Fed', pet: 'Petted', play: 'Played with' };
      setPetMessage(`${labels[action]} your pet! +${res.xp_awarded} XP${res.levelup ? ' - LEVEL UP!' : ''}`);
      if (res.levelup) setShowConfetti(true);
      // Update points in header immediately
      if (res.new_balance != null) updateUser({ points_balance: res.new_balance });
      await fetchData();
    } catch (err) {
      setPetMessage(err.message || 'Could not interact with pet');
    } finally {
      setPetInteracting(null);
      setTimeout(() => { setPetAction(null); setPetMessage(''); }, 4000);
    }
  };

  const hasPet = !!myStats?.pet;
  const petType = myStats?.pet?.type || user?.avatar_config?.pet || 'none';
  const petColors = buildPetColors(user?.avatar_config || {});

  // ---- render ----

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-accent" size={24} />
      </div>
    );
  }

  const completedCount = assignments.filter(a => a.status === 'verified' || a.status === 'completed').length;
  const totalCount = assignments.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const activeTheme = getTheme(boardTheme);

  return (
    <div className={`max-w-2xl mx-auto space-y-5 quest-board-${boardTheme}`}>
      {/* ── Page-level ambient glow ── */}
      <QuestBoardPageGlow themeId={boardTheme} />

      {/* ── Confetti overlay ── */}
      <AnimatePresence>
        {showConfetti && (
          <ConfettiAnimation onComplete={() => setShowConfetti(false)} />
        )}
      </AnimatePresence>

      {/* ── Header with stats ── */}
      <div className="relative overflow-hidden">
        <QuestBoardOverlay themeId={boardTheme} />
        <QuestBoardParticles themeId={boardTheme} />
        
        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between gap-2 p-1">
            <h1 className="text-nb-black text-2xl font-black uppercase tracking-tighter italic">
              <QuestBoardTitle themeId={boardTheme}>Quest Board</QuestBoardTitle>
            </h1>
            <div className="flex items-center gap-2">
              <QuestBoardDecorations themeId={boardTheme} />
              <button
                onClick={() => setShowThemePicker((v) => !v)}
                className="game-btn bg-nb-white"
                title="Change board theme"
              >
                {BOARD_THEMES.find((t) => t.id === boardTheme)?.icon || '\u2694\uFE0F'}
              </button>
            </div>
          </div>

          <DashboardStats 
            points={user?.points_balance ?? 0} 
            streak={user?.current_streak ?? 0}
            rank={myStats?.rank}
          />

          <LevelProgress 
            completed={completedCount}
            total={totalCount}
            xp={user?.points_balance ?? 0}
            rank={myStats?.rank}
          />
        </div>
      </div>

      {/* ── Board Theme Picker ── */}
      {showThemePicker && (
        <div className="game-panel p-4">
          <h3 className="text-cream text-xs font-medium mb-3">Choose Board Theme</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {BOARD_THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => changeBoardTheme(t.id)}
                className={`flex items-center gap-2 p-3 rounded-md border transition-all text-left ${
                  boardTheme === t.id
                    ? 'border-accent bg-accent/10'
                    : 'border-border/50 bg-surface-raised/30 hover:border-border-light'
                }`}
              >
                <span className="text-xl">{t.icon}</span>
                <div>
                  <p className="text-cream text-xs font-medium">{t.label}</p>
                  <p className="text-muted text-[10px]">{t.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div className="game-panel p-3 flex items-center gap-2 border-crimson/30 text-crimson text-sm">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* ── Active Quest Section ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 px-1">
          <Sword size={20} className="text-nb-red" />
          <h2 className="text-xl font-black uppercase tracking-tight">Active Quests</h2>
        </div>

        {(() => {
          const pendingAssignments = assignments.filter(
            (a) => a.status === 'pending' || a.status === 'assigned'
          );

          if (pendingAssignments.length === 0 && !loading) {
            return (
              <motion.div
                className="game-panel p-10 flex flex-col items-center gap-3 text-center bg-nb-white/50"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="w-16 h-16 rounded-full bg-nb-cream border-2 border-nb-black flex items-center justify-center">
                  <CheckCheck size={32} className="text-emerald" />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase">Victory!</h3>
                  <p className="text-muted text-xs font-bold uppercase tracking-widest">
                    {assignments.length === 0
                      ? 'No quests for today. Take a break!'
                      : 'All quests complete! Time to spin the wheel!'}
                  </p>
                </div>
              </motion.div>
            );
          }

          return (
            <div className="grid grid-cols-1 gap-3">
              {pendingAssignments.map((assignment, idx) => (
                <QuestCard 
                  key={assignment.id}
                  assignment={assignment}
                  idx={idx}
                  colorTheme={colorTheme}
                  activeTheme={activeTheme}
                  onClick={() => navigate('/chores')}
                />
              ))}
            </div>
          );
        })()}
      </div>

      <XPBalanceChart />

      {/* ── Pet Interactions ── */}
      {hasPet && (() => {
        const config = user?.avatar_config || {};
        const petLevel = myStats?.pet?.level || 1;
        const petAccessory = config.pet_accessory;
        const sc = 1 + (petLevel - 1) * 0.04;
        const glowColor = petLevel >= 7 ? '#f59e0b' : petLevel >= 5 ? '#a855f7' : null;
        const px = 26, py = 20;

        return (
          <div className="space-y-4 pt-4">
            <div className="flex items-center gap-3 px-1">
              <Heart size={20} className="text-nb-red" />
              <h2 className="text-xl font-black uppercase tracking-tight">The Sanctuary</h2>
            </div>
            
            <div className="game-panel p-5 bg-nb-white relative overflow-hidden">
              <div className="flex flex-col sm:flex-row items-center gap-6 relative z-10">
                {/* Pet display */}
                <div className="flex flex-col items-center gap-3">
                  <div className={`pet-interaction-stage p-4 bg-nb-cream border-2 border-nb-black shadow-[4px_4px_0_0_#000] ${petAction ? `pet-action-${petAction}` : ''}`}>
                    <div className="avatar-idle overflow-hidden" style={{ width: 96, height: 96 }}>
                      <svg width={96} height={96} viewBox="19 13 14 14">
                        <circle cx="26" cy="20" r="6.5" fill="rgba(0,0,0,0.03)" />
                        {glowColor && (
                          <circle cx={px} cy={py} r={4} fill={glowColor} opacity="0.1" />
                        )}
                        <g className="avatar-pet">
                          <g transform={sc !== 1 ? `translate(${px},${py}) scale(${sc}) translate(${-px},${-py})` : undefined}>
                            {renderPet(petType, petColors, 'right')}
                            {renderPetExtras(petType, petLevel, petColors, 'right')}
                            {renderPetAccessory(petType, petAccessory, 'right')}
                          </g>
                        </g>
                      </svg>
                    </div>
                    {/* Floating particles */}
                    <AnimatePresence>
                      {petAction === 'feed' && (
                        <motion.span className="absolute -top-1 -right-1 text-2xl" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: -10 }} exit={{ opacity: 0 }}>🍖</motion.span>
                      )}
                      {petAction === 'pet' && (
                        <motion.span className="absolute -top-1 -right-1 text-2xl" initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1.2 }} exit={{ opacity: 0 }}>💖</motion.span>
                      )}
                      {petAction === 'play' && (
                        <motion.span className="absolute -top-1 -right-1 text-2xl" initial={{ opacity: 0, rotate: 0 }} animate={{ opacity: 1, rotate: 360 }} exit={{ opacity: 0 }}>⚽</motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                  <PetLevelBadge pet={myStats?.pet} />
                </div>

                {/* Info and actions */}
                <div className="flex-1 space-y-4 w-full">
                  <div className="flex items-center justify-between border-b-2 border-nb-black pb-2">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Status</span>
                      <span className="text-sm font-black uppercase text-emerald">Happy & Energetic</span>
                    </div>
                    <div className="text-right">
                       <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Daily Care</span>
                       <div className="text-xs font-black uppercase tracking-tighter">
                          {interactionsRemaining} <span className="opacity-60 text-[8px]">Left</span>
                       </div>
                    </div>
                  </div>

                  <AnimatePresence>
                    {petMessage && (
                      <motion.div
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className={`text-xs p-2 border-2 border-nb-black font-black uppercase tracking-tighter text-center ${
                          petMessage.includes('Could not') || petMessage.includes('tired') ? 'bg-nb-red text-nb-white' : 'bg-nb-yellow'
                        }`}
                      >
                        {petMessage}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { action: 'feed', icon: Heart, label: 'Feed', color: 'game-btn-red' },
                      { action: 'pet', icon: HandHeart, label: 'Pet', color: 'game-btn-blue' },
                      { action: 'play', icon: Gamepad2, label: 'Play', color: 'game-btn-purple' },
                    ].map(({ action, icon: Icon, label, color }) => (
                      <button
                        key={action}
                        onClick={() => handlePetInteraction(action)}
                        disabled={!!petInteracting || interactionsRemaining <= 0}
                        className={`game-btn ${color} text-[10px] flex flex-col items-center gap-1 p-2 ${
                          petInteracting === action ? 'bg-opacity-50' : ''
                        }`}
                      >
                        <Icon size={14} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Streak Freeze Indicator ── */}
      {myStats?.streak_freeze_available && (
        <div className="game-panel p-3 flex items-center gap-3">
          <ShieldOff size={16} className="text-accent flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-cream text-xs font-medium">Streak Freeze Available</p>
            <p className="text-muted text-[10px]">Your streak will be saved once if you miss a day this month</p>
          </div>
        </div>
      )}

      {/* ── Spin Wheel Section ── */}
      {spin_wheel_enabled && (
        <div className="pt-2">
          <SpinWheel
            availability={spinAvailability}
            onSpinComplete={() => {
              fetchData();
            }}
          />
        </div>
      )}
    </div>
  );
}
