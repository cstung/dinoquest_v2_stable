import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import {
  Clock, ChevronLeft, ChevronRight, CheckCircle, AlertTriangle,
  Send, Loader2, Trophy, Play, Image as ImageIcon,
} from 'lucide-react';

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function extractYouTubeId(url) {
  if (!url) return null;
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

export default function ExaminationTake() {
  const { testId } = useParams();
  const navigate = useNavigate();

  const [phase, setPhase] = useState('loading'); // loading | ready | testing | submitting | result
  const [test, setTest] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [attemptId, setAttemptId] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [questionEntryTime, setQuestionEntryTime] = useState(null);

  const timerRef = useRef(null);

  // Load test info
  useEffect(() => {
    api(`/api/examinations`).then((tests) => {
      const t = tests.find((x) => x.id === Number(testId));
      if (t) {
        setTest(t);
        setPhase('ready');
      } else {
        setError('Test not found');
      }
    }).catch((e) => setError(e.message));
  }, [testId]);

  // Timer
  useEffect(() => {
    if (phase !== 'testing') return;
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  // Track entry time per question
  useEffect(() => {
    if (phase === 'testing') {
      setQuestionEntryTime(new Date().toISOString());
    }
  }, [currentIdx, phase]);

  // Handle abandonment
  useEffect(() => {
    const handleAbandon = () => {
      if (phase === 'testing' && attemptId) {
        const url = `/api/examinations/attempts/${attemptId}/abandon`;
        const token = localStorage.getItem('dinoquest_access_token');
        const headers = {
          'Authorization': token ? `Bearer ${token}` : '',
        };
        fetch(url, { method: 'POST', keepalive: true, headers }).catch(() => {});
      }
    };

    const onBeforeUnload = (e) => {
      if (phase === 'testing') {
        handleAbandon();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      // Also handle SPA navigation
      if (phase === 'testing' && attemptId) {
        api(`/api/examinations/attempts/${attemptId}/abandon`, { method: 'POST' }).catch(() => {});
      }
    };
  }, [phase, attemptId]);

  const startTest = useCallback(async () => {
    try {
      setPhase('loading');
      const data = await api(`/api/examinations/${testId}/start`, {
        method: 'POST',
      });
      setAttemptId(data.attempt_id);
      setQuestions(data.questions);
      setSecondsLeft(data.duration_minutes * 60);
      setCurrentIdx(0);
      setAnswers({});
      setPhase('testing');
    } catch (e) {
      setError(e.message);
      setPhase('ready');
    }
  }, [testId]);

  const saveAnswer = useCallback(
    async (qId, selectedIds) => {
      if (!attemptId) return;
      const now = new Date().toISOString();
      const entryT = questionEntryTime || now;
      const diff =
        (new Date(now).getTime() - new Date(entryT).getTime()) / 1000;
      try {
        await api(`/api/examinations/attempts/${attemptId}/log`, {
          method: 'POST',
          body: {
            question_id: qId,
            selected_option_ids: selectedIds,
            entry_time: entryT,
            exit_time: now,
            time_spent_seconds: Math.round(diff * 10) / 10,
          },
        });
      } catch {
        // ignore auto-save errors
      }
    },
    [attemptId, questionEntryTime],
  );

  const toggleOption = useCallback(
    (questionId, optionId, allowMultiple) => {
      setAnswers((prev) => {
        const current = prev[questionId] || [];
        let next;
        if (allowMultiple) {
          next = current.includes(optionId)
            ? current.filter((id) => id !== optionId)
            : [...current, optionId];
        } else {
          next = current.includes(optionId) ? [] : [optionId];
        }
        // Auto-save
        saveAnswer(questionId, next);
        return { ...prev, [questionId]: next };
      });
    },
    [saveAnswer],
  );

  const handleSubmit = useCallback(async () => {
    if (phase === 'submitting' || phase === 'result') return;
    clearInterval(timerRef.current);
    setPhase('submitting');
    try {
      const data = await api(
        `/api/examinations/attempts/${attemptId}/submit`,
        { method: 'POST' },
      );
      setResult(data);
      setPhase('result');
    } catch (e) {
      setError(e.message);
      setPhase('testing');
    }
  }, [attemptId, phase]);

  const currentQuestion = questions[currentIdx];
  const timerPct = test
    ? (secondsLeft / (test.duration_minutes * 60)) * 100
    : 100;
  const isLowTime = secondsLeft < 60;

  // ── Loading / Error ────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-10">
        <div className="game-panel p-6 text-center">
          <AlertTriangle size={40} className="mx-auto mb-3 text-[#FF4D4D]" />
          <p className="font-bold mb-2">Error</p>
          <p className="text-sm opacity-60 mb-4">{error}</p>
          <button
            className="game-btn game-btn-gold"
            onClick={() => navigate('/examinations')}
          >
            Back to Tests
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  // ── Ready (pre-start) ─────────────────────────────────────────────────
  if (phase === 'ready' && test) {
    return (
      <div className="max-w-lg mx-auto mt-8">
        <div className="game-panel p-6 text-center">
          <div className="w-16 h-16 bg-[#7C3AED] flex items-center justify-center border-2 border-[#0A0A0A] shadow-[4px_4px_0_#0A0A0A] mx-auto mb-4">
            <Play size={28} className="text-white" />
          </div>
          <h1 className="text-xl font-bold mb-2">{test.title}</h1>
          {test.description && (
            <p className="text-sm opacity-60 mb-4">{test.description}</p>
          )}

          <div className="flex justify-center gap-4 mb-6">
            <div className="bg-[#FFF7D1] border-2 border-[#0A0A0A] px-4 py-2 text-center">
              <p className="text-xs font-mono opacity-60">Duration</p>
              <p className="font-bold">{test.duration_minutes} min</p>
            </div>
            <div className="bg-[#FFF7D1] border-2 border-[#0A0A0A] px-4 py-2 text-center">
              <p className="text-xs font-mono opacity-60">Questions</p>
              <p className="font-bold">{test.question_count}</p>
            </div>
            <div className="bg-[#FFF7D1] border-2 border-[#0A0A0A] px-4 py-2 text-center">
              <p className="text-xs font-mono opacity-60">Max XP</p>
              <p className="font-bold">10,000</p>
            </div>
          </div>

          <div className="bg-[#FFF0E6] border-2 border-[#0A0A0A] p-3 mb-6 text-left text-sm">
            <p className="font-bold flex items-center gap-1 mb-1">
              <AlertTriangle size={14} /> Important
            </p>
            <ul className="list-disc pl-5 space-y-0.5 text-xs opacity-80">
              <li>Timer starts immediately when you click Start</li>
              <li>Answers are auto-saved as you go</li>
              <li>Test is submitted automatically when time runs out</li>
              <li>Score is converted to XP (1 point = 1 XP)</li>
            </ul>
          </div>

          <button
            className="game-btn game-btn-purple w-full flex items-center justify-center gap-2"
            onClick={startTest}
            id="btn-start-test"
          >
            <Play size={16} /> Start Test
          </button>
        </div>
      </div>
    );
  }

  // ── Result ─────────────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    return (
      <div className="max-w-lg mx-auto mt-8">
        <div className="game-panel p-6 text-center">
          <div className="w-16 h-16 bg-[#FFE500] flex items-center justify-center border-2 border-[#0A0A0A] shadow-[4px_4px_0_#0A0A0A] mx-auto mb-4">
            <Trophy size={28} />
          </div>
          <h1 className="text-2xl font-bold mb-1">Test Complete!</h1>
          {result.passed !== null && (
            <p
              className={`font-bold text-sm mb-3 ${
                result.passed ? 'text-[#00A95C]' : 'text-[#FF4D4D]'
              }`}
            >
              {result.passed ? '✓ PASSED' : '✗ FAILED'}
            </p>
          )}

          <div className="flex justify-center gap-4 mb-6">
            <div className="bg-[#FFF7D1] border-2 border-[#0A0A0A] px-6 py-3 text-center">
              <p className="text-xs font-mono opacity-60">Your Score</p>
              <p className="font-bold text-2xl">
                {result.score.toLocaleString()}
              </p>
              <p className="text-xs font-mono opacity-60">
                / {result.max_score.toLocaleString()}
              </p>
            </div>
            <div className="bg-[#E0FFE6] border-2 border-[#0A0A0A] px-6 py-3 text-center">
              <p className="text-xs font-mono opacity-60">XP Awarded</p>
              <p className="font-bold text-2xl text-[#00A95C]">
                +{result.xp_awarded.toLocaleString()}
              </p>
            </div>
          </div>

          <button
            className="game-btn game-btn-gold w-full"
            onClick={() => navigate('/examinations')}
            id="btn-back-to-tests"
          >
            Back to Examinations
          </button>
        </div>
      </div>
    );
  }

  // ── Submitting ─────────────────────────────────────────────────────────
  if (phase === 'submitting') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 size={36} className="animate-spin" />
        <p className="font-bold">Submitting your test...</p>
      </div>
    );
  }

  // ── Testing ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto">
      {/* Timer Bar */}
      <div className="sticky top-[52px] z-10 bg-[#FFFBF0] pb-2" id="exam-timer-bar">
        <div className="game-panel p-2 flex items-center gap-3">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Clock size={16} className={isLowTime ? 'text-[#FF4D4D]' : ''} />
            <span
              className={`font-mono font-bold text-base ${
                isLowTime ? 'text-[#FF4D4D]' : ''
              }`}
            >
              {formatTime(secondsLeft)}
            </span>
          </div>
          <div className="flex-1">
            <div className="xp-bar">
              <div
                className="xp-bar-fill"
                style={{
                  width: `${timerPct}%`,
                  background: isLowTime ? '#FF4D4D' : '#0066FF',
                  transition: 'width 1s linear',
                }}
              />
            </div>
          </div>
          <span className="text-xs font-mono flex-shrink-0">
            {currentIdx + 1} / {questions.length}
          </span>
        </div>
      </div>

      {/* Question Card */}
      {currentQuestion && (
        <div className="game-panel p-5 mt-2" id={`question-${currentQuestion.id}`}>
          {/* Question header */}
          <div className="flex items-center gap-2 mb-3">
            <span className="bg-[#0A0A0A] text-[#FFE500] text-xs font-mono px-2 py-0.5">
              Q{currentIdx + 1}
            </span>
            {currentQuestion.allow_multiple && (
              <span className="text-xs font-mono opacity-60">
                (select multiple)
              </span>
            )}
            <span className="text-xs font-mono opacity-40 ml-auto">
              Weight: {currentQuestion.weight}
            </span>
          </div>

          {/* Question text */}
          <p className="font-bold text-base mb-4 leading-relaxed">
            {currentQuestion.question_text}
          </p>

          {/* Media */}
          {currentQuestion.media_type === 'youtube' &&
            currentQuestion.media_url && (
              <div className="mb-4 border-2 border-[#0A0A0A] bg-black overflow-hidden">
                <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${extractYouTubeId(
                      currentQuestion.media_url,
                    )}?modestbranding=1&rel=0&controls=1&fs=0`}
                    className="absolute inset-0 w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                    allowFullScreen={false}
                    title="Question Video"
                    sandbox="allow-scripts allow-same-origin"
                  />
                </div>
              </div>
            )}

          {currentQuestion.media_type === 'image' &&
            currentQuestion.media_url && (
              <div className="mb-4 border-2 border-[#0A0A0A] overflow-hidden">
                <img
                  src={currentQuestion.media_url}
                  alt="Question attachment"
                  className="max-w-full max-h-72 mx-auto object-contain"
                />
              </div>
            )}

          {/* Answer Options */}
          <div className="flex flex-col gap-2">
            {currentQuestion.options.map((opt) => {
              const selected = (
                answers[currentQuestion.id] || []
              ).includes(opt.id);
              return (
                <button
                  key={opt.id}
                  onClick={() =>
                    toggleOption(
                      currentQuestion.id,
                      opt.id,
                      currentQuestion.allow_multiple,
                    )
                  }
                  className={`w-full text-left p-3 border-2 border-[#0A0A0A] flex items-center gap-3 transition-none ${
                    selected
                      ? 'bg-[#7C3AED] text-white shadow-none translate-x-[2px] translate-y-[2px]'
                      : 'bg-white shadow-[4px_4px_0_#0A0A0A] hover:shadow-[2px_2px_0_#0A0A0A] hover:translate-x-[2px] hover:translate-y-[2px]'
                  }`}
                  id={`option-${opt.id}`}
                >
                  <div
                    className={`w-5 h-5 border-2 flex items-center justify-center flex-shrink-0 ${
                      selected
                        ? 'border-white bg-[#7C3AED]'
                        : 'border-[#0A0A0A] bg-white'
                    }`}
                  >
                    {selected && <CheckCircle size={12} className="text-white" />}
                  </div>
                  <span className={`text-sm font-medium ${selected ? '!text-white' : ''}`}>
                    {opt.option_text}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-4 gap-3">
        <button
          className="game-btn game-btn-gold flex items-center gap-1"
          onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
          disabled={currentIdx === 0}
          id="btn-prev-q"
        >
          <ChevronLeft size={16} /> Previous
        </button>

        {currentIdx < questions.length - 1 ? (
          <button
            className="game-btn game-btn-blue flex items-center gap-1"
            onClick={() => setCurrentIdx((i) => i + 1)}
            id="btn-next-q"
          >
            Next <ChevronRight size={16} />
          </button>
        ) : (
          <button
            className="game-btn game-btn-purple flex items-center gap-1"
            onClick={handleSubmit}
            id="btn-submit-test"
          >
            <Send size={14} /> Submit Test
          </button>
        )}
      </div>

      {/* Question Nav Dots */}
      <div className="flex flex-wrap gap-1.5 justify-center mt-4">
        {questions.map((q, i) => {
          const answered = (answers[q.id] || []).length > 0;
          const isCurrent = i === currentIdx;
          return (
            <button
              key={q.id}
              onClick={() => setCurrentIdx(i)}
              className={`w-7 h-7 border-2 border-[#0A0A0A] text-xs font-mono flex items-center justify-center ${
                isCurrent
                  ? 'bg-[#0A0A0A] text-[#FFE500]'
                  : answered
                  ? 'bg-[#00A95C] text-white'
                  : 'bg-white'
              }`}
              title={`Question ${i + 1}`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
