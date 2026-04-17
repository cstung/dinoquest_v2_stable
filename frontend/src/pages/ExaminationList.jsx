import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import {
  BookOpen, Clock, CheckCircle, ArrowRight,
  Trophy, AlertCircle, Loader2, FileText, X, BarChart2, Unlock
} from 'lucide-react';
import ExpandableText from '../components/ExpandableText';
import PerformanceView from '../components/PerformanceView';

export default function ExaminationList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tests, setTests] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showLogs, setShowLogs] = useState(false);
  const [attemptLogs, setAttemptLogs] = useState(null);
  
  const [showPerformance, setShowPerformance] = useState(false);
  const [selectedPerformanceTest, setSelectedPerformanceTest] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [t, a] = await Promise.all([
        api('/api/examinations'),
        api('/api/examinations/attempts'),
      ]);
      setTests(t);
      setAttempts(a);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadLogs(attemptId) {
    try {
      const data = await api(`/api/examinations/attempts/${attemptId}/logs`);
      setAttemptLogs(data);
      setShowLogs(true);
    } catch (e) {
      setError(e.message);
    }
  }

  function bestScore(testId) {
    const done = attempts.filter(
      (a) => a.test_id === testId && a.score !== null,
    );
    if (!done.length) return null;
    return Math.max(...done.map((a) => a.score));
  }

  function getRetryState(testId) {
    const past = attempts.filter(a => a.test_id === testId && (a.status === 'submitted' || a.status === 'timed_out')).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    if (!past.length) return { hasPast: false, requested: false, approved: false };
    const last = past[0]; // most recent
    return { hasPast: true, requested: last.retry_requested, approved: last.retry_approved };
  }

  function hasActiveAttempt(testId) {
    return attempts.some(
      (a) => a.test_id === testId && a.status === 'in_progress',
    );
  }

  async function requestRetry(testId) {
    try {
      await api(`/api/examinations/${testId}/request-retry`, { method: 'POST' });
      await loadData();
    } catch (e) {
      alert(e.message);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-[#7C3AED] flex items-center justify-center border-2 border-[#0A0A0A] shadow-[4px_4px_0_#0A0A0A]">
          <BookOpen size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Examinations</h1>
          <p className="text-sm text-[#0A0A0A] opacity-60">
            Take tests to earn XP rewards
          </p>
        </div>
      </div>

      {error && (
        <div className="game-panel p-4 mb-4 flex items-center gap-2 bg-[#FFF0F0]">
          <AlertCircle size={16} className="text-[#FF4D4D]" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {tests.length === 0 ? (
        <div className="game-panel p-8 text-center">
          <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">No tests available</p>
          <p className="text-sm opacity-60 mt-1">
            Check back later — your admin will post examinations here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tests.map((test) => {
            const best = bestScore(test.id);
            const active = hasActiveAttempt(test.id);
            const retryState = getRetryState(test.id);
            return (
              <div
                key={test.id}
                className="game-panel p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 cursor-pointer"
                onClick={() => navigate(`/examinations/${test.id}/take`)}
                id={`exam-card-${test.id}`}
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-base truncate">{test.title}</h3>
                  {test.description && (
                    <ExpandableText
                      text={test.description}
                      lines={2}
                      className="mt-0.5"
                    />
                  )}

                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className="flex items-center gap-1 text-xs font-mono bg-[#FFF7D1] border-2 border-[#0A0A0A] px-2 py-0.5">
                      <Clock size={12} /> {test.duration_minutes} min
                    </span>
                    <span className="flex items-center gap-1 text-xs font-mono bg-[#FFF7D1] border-2 border-[#0A0A0A] px-2 py-0.5">
                      <BookOpen size={12} /> {test.question_count} Q
                    </span>
                    {best !== null && (
                      <span className="flex items-center gap-1 text-xs font-mono bg-[#E0FFE6] border-2 border-[#0A0A0A] px-2 py-0.5">
                        <Trophy size={12} /> Best: {best.toLocaleString()} XP
                      </span>
                    )}
                    {active && (
                      <span className="flex items-center gap-1 text-xs font-mono bg-[#FFE500] border-2 border-[#0A0A0A] px-2 py-0.5">
                        <Loader2 size={12} className="animate-spin" /> In Progress
                      </span>
                    )}
                  </div>
                </div>

                {test.thumbnail_url && (
                  <div className="flex-shrink-0 ml-4 hidden sm:block">
                    <img
                      src={test.thumbnail_url}
                      alt="thumbnail"
                      className="w-16 h-16 object-cover border-2 border-[#0A0A0A] shadow-[2px_2px_0_#0A0A0A]"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-2 flex-shrink-0">
                  {(!active && retryState.hasPast && !retryState.requested) ? (
                    <button
                      className="game-btn bg-[#FFF0F0] border-2 border-[#0A0A0A] flex items-center justify-center gap-2 !py-2 !px-4 hover:bg-[#FF4D4D] hover:text-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        requestRetry(test.id);
                      }}
                    >
                      Request Retry
                    </button>
                  ) : (!active && retryState.hasPast && retryState.requested && !retryState.approved) ? (
                    <button
                      className="game-btn bg-[#FFF7D1] border-2 border-[#0A0A0A] opacity-70 cursor-not-allowed flex items-center justify-center gap-2 !py-2 !px-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Loader2 size={14} className="animate-spin" /> Waiting...
                    </button>
                  ) : (
                    <button
                      className="game-btn game-btn-purple flex items-center justify-center gap-2 !py-2 !px-4"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/examinations/${test.id}/take`);
                      }}
                      id={`start-exam-${test.id}`}
                    >
                      {active ? 'Continue' : 'Start Test'}
                      <ArrowRight size={14} />
                    </button>
                  )}
                  {best !== null && (
                    <button
                      className="game-btn bg-white border-2 border-[#0A0A0A] flex items-center justify-center gap-2 !py-2 !px-4 hover:bg-[#7C3AED] hover:text-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPerformanceTest(test);
                        setShowPerformance(true);
                      }}
                    >
                      <BarChart2 size={14} /> Progression
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Past Attempts Summary */}
      {attempts.filter((a) => a.score !== null).length > 0 && (
        <div className="mt-8">
          <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
            <CheckCircle size={18} /> Past Results
          </h2>
          <div className="flex flex-col gap-2">
            {attempts
              .filter((a) => a.score !== null)
              .slice(0, 10)
              .map((a) => {
                const testTitle =
                  tests.find((t) => t.id === a.test_id)?.title || 'Unknown Test';
                return (
                  <div
                    key={a.id}
                    className="game-panel p-3 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium text-sm">{testTitle}</p>
                      <p className="text-xs font-mono opacity-60">
                        {new Date(a.finished_at).toLocaleDateString()} ·{' '}
                        {a.status === 'timed_out' ? 'Timed Out' : 'Submitted'}
                      </p>
                    </div>
                    <div className="text-right flex items-center justify-end gap-3">
                      <div>
                        <p className="font-bold text-base">
                          {a.score.toLocaleString()}
                        </p>
                        <p className="text-xs font-mono opacity-60">/ 10,000 XP</p>
                      </div>
                      <button
                        className="p-1.5 border-2 border-[#0A0A0A] bg-white hover:bg-[#7C3AED] hover:text-white"
                        title="View Detailed Log"
                        onClick={() => loadLogs(a.id)}
                      >
                        <FileText size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ── Attempt Log Detail Modal ─────────────────────────────── */}
      {showLogs && attemptLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="game-panel w-full max-w-lg max-h-[85vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">My Time Log</h3>
              <button
                onClick={() => {
                  setShowLogs(false);
                  setAttemptLogs(null);
                }}
                className="p-1.5 border-2 border-[#0A0A0A] bg-white hover:bg-[#7C3AED] hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-[#FFF7D1] border-2 border-[#0A0A0A] p-2 text-center">
                <p className="text-xs font-mono opacity-60">Score</p>
                <p className="font-bold text-lg">{attemptLogs.score}</p>
              </div>
              <div className="bg-[#FFF7D1] border-2 border-[#0A0A0A] p-2 text-center">
                <p className="text-xs font-mono opacity-60">Status</p>
                <p className="font-bold text-lg capitalize">{attemptLogs.status}</p>
              </div>
            </div>

            <div className="max-h-[50vh] overflow-y-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0A0A0A] text-[#FFE500] sticky top-0">
                    <th className="p-1.5 text-left border border-[#0A0A0A]">#</th>
                    <th className="p-1.5 text-left border border-[#0A0A0A]">Question</th>
                    <th className="p-1.5 text-right border border-[#0A0A0A]">Time</th>
                    <th className="p-1.5 text-center border border-[#0A0A0A]">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {attemptLogs.questions.map((log) => (
                    <tr key={log.question_id} className={`border-b border-[#0A0A0A] ${log.is_correct ? '' : 'bg-[#FFF0F0]'}`}>
                      <td className="p-1.5 font-mono border border-[#0A0A0A]">Q{log.order}</td>
                      <td className="p-1.5 border border-[#0A0A0A] max-w-[150px] truncate" title={log.question_text}>
                        {log.question_text}
                      </td>
                      <td className="p-1.5 text-right font-mono border border-[#0A0A0A]">
                        {log.duration != null ? `${Math.round(log.duration)}s` : '—'}
                      </td>
                      <td className="p-1.5 text-center border border-[#0A0A0A]">
                        {log.is_skipped ? (
                          <span className="text-[10px] font-mono opacity-40">skip</span>
                        ) : log.is_correct ? (
                          <span className="text-[10px] font-mono bg-[#00A95C] text-white px-1.5 py-0.5 border border-[#0A0A0A]">✓</span>
                        ) : (
                          <span className="text-[10px] font-mono bg-[#FF4D4D] text-white px-1.5 py-0.5 border border-[#0A0A0A]">✗</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {/* ── Progression Modal ─────────────────────────────── */}
      {showPerformance && selectedPerformanceTest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="game-panel w-full max-w-4xl max-h-[90vh] overflow-y-auto p-5 relative">
            <button
              onClick={() => {
                setShowPerformance(false);
                setSelectedPerformanceTest(null);
              }}
              className="absolute top-4 right-4 p-1.5 border-2 border-[#0A0A0A] bg-white hover:bg-[#7C3AED] hover:text-white"
            >
              <X size={16} />
            </button>
            <div className="mb-4 pr-8">
              <h3 className="font-bold text-xl">{selectedPerformanceTest.title} - My Progression</h3>
              <p className="text-sm opacity-60">Review your past attempts and performance metrics.</p>
            </div>
            
            <PerformanceView testId={selectedPerformanceTest.id} userId={user.id} isAdmin={false} />
          </div>
        </div>
      )}
    </div>
  );
}
