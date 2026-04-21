import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import Modal from './Modal';
import { api } from '../api/client';

const LOADING_STAGES = [
  { delay: 0, message: 'Fetching video info...' },
  { delay: 3000, message: 'Checking subtitles...' },
  { delay: 8000, message: 'Sending transcript to AI...' },
  { delay: 15000, message: 'Generating questions (this can take up to 30s)...' },
];

const USER_ERRORS = {
  'Invalid YouTube URL format': 'Please paste a valid YouTube link.',
  'This video has no subtitles.': 'This video has no subtitles. Try a video that has auto-generated captions enabled.',
  'Daily limit': "You've reached today's generation limit. Try again tomorrow.",
  'YouTube transcript fetch timeout': 'The request timed out while contacting YouTube. Try again, or use a shorter video.',
  timeout: 'The request timed out. The video might be too long or the AI service is busy. Try again with fewer questions.',
  '502': 'The AI service is temporarily unavailable. Please try again in a moment.',
  '504': 'The server took too long to respond. Try a shorter video.',
};

const DEFAULT_EXAM_CONFIG = {
  title: '',
  passing_score: 5000,
  duration_minutes: 15,
  is_randomized: true,
  penalty_value: 0,
};

const YOUTUBE_URL_RE =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?[^#\s]*v=|embed\/|shorts\/)|youtu\.be\/)[A-Za-z0-9_-]{11}([?&][^\s]*)?$/i;

function friendlyError(detail) {
  if (typeof detail !== 'string') return 'Something went wrong. Please try again.';
  const lowerDetail = detail.toLowerCase();
  for (const [key, message] of Object.entries(USER_ERRORS)) {
    if (lowerDetail.includes(key.toLowerCase())) return message;
  }
  return detail || 'An unexpected error occurred. Please try again.';
}

function normalizeSingleSelectOptions(options) {
  let firstCorrectSeen = false;
  return options.map((option, index) => {
    const isCorrect = Boolean(option.is_correct) && !firstCorrectSeen;
    if (isCorrect) {
      firstCorrectSeen = true;
    }
    return {
      ...option,
      is_correct: isCorrect,
      sort_order: index,
    };
  });
}

function isQuestionValid(question) {
  if (!question?.question_text?.trim()) return false;
  if (!Array.isArray(question.options) || question.options.length !== 4) return false;
  if (question.options.some((option) => !option.option_text?.trim())) return false;
  const correctCount = question.options.filter((option) => option.is_correct).length;
  if (correctCount === 0) return false;
  if (!question.allow_multiple && correctCount !== 1) return false;
  return true;
}

function createManualQuestion(thumbnailUrl) {
  return {
    question_text: 'New Question',
    media_type: thumbnailUrl ? 'image' : 'none',
    media_url: thumbnailUrl || '',
    weight: 1,
    allow_multiple: false,
    options: [
      { option_text: 'Option 1', is_correct: true, sort_order: 0 },
      { option_text: 'Option 2', is_correct: false, sort_order: 1 },
      { option_text: 'Option 3', is_correct: false, sort_order: 2 },
      { option_text: 'Option 4', is_correct: false, sort_order: 3 },
    ],
  };
}

export default function GPTTestMakerModal({ isOpen, onClose, onSaved }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState(null);

  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [nQuestions, setNQuestions] = useState(10);
  const [difficulty, setDifficulty] = useState('medium');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [examConfig, setExamConfig] = useState(() => ({ ...DEFAULT_EXAM_CONFIG }));

  const [generatedData, setGeneratedData] = useState(null);
  const [editableQuestions, setEditableQuestions] = useState([]);
  const [expandedIdx, setExpandedIdx] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setLoading(false);
      setLoadingMessage('');
      setError(null);
      setYoutubeUrl('');
      setNQuestions(10);
      setDifficulty('medium');
      setShowAdvanced(false);
      setExamConfig({ ...DEFAULT_EXAM_CONFIG });
      setGeneratedData(null);
      setEditableQuestions([]);
      setExpandedIdx(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!loading) return undefined;

    const timers = LOADING_STAGES.map((stage) =>
      setTimeout(() => {
        setLoadingMessage(stage.message);
      }, stage.delay),
    );

    return () => timers.forEach(clearTimeout);
  }, [loading]);

  const totalXP = useMemo(
    () => editableQuestions.reduce((sum, question) => sum + (question.weight || 1), 0) * 100,
    [editableQuestions],
  );

  const isValidUrl = useMemo(() => YOUTUBE_URL_RE.test(youtubeUrl.trim()), [youtubeUrl]);
  const hasInvalidQuestions = useMemo(
    () => editableQuestions.some((question) => !isQuestionValid(question)),
    [editableQuestions],
  );

  const handleGenerate = async () => {
    setError(null);
    setLoadingMessage(LOADING_STAGES[0].message);
    setLoading(true);
    try {
      const res = await api('/api/admin/examinations/generate-from-youtube', {
        method: 'POST',
        body: {
          youtube_url: youtubeUrl.trim(),
          n_questions: nQuestions,
          difficulty,
          exam_config: examConfig,
        },
      });
      setGeneratedData(res);
      setEditableQuestions(res.questions);
      setExpandedIdx(0);
      setStep(2);
    } catch (e) {
      setError(friendlyError(e.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (hasInvalidQuestions) {
      setError('Each question needs text, 4 filled options, and the right number of correct answers.');
      return;
    }

    setError(null);
    setLoading(true);
    setLoadingMessage('Saving to DinoQuest...');

    try {
      const res = await api('/api/admin/examinations/save-generated', {
        method: 'POST',
        body: {
          exam_config: {
            ...examConfig,
            title: examConfig.title || generatedData.video_title,
            thumbnail_url: generatedData.thumbnail_url,
          },
          questions: editableQuestions,
        },
      });
      onSaved(res.exam_id);
    } catch (e) {
      setError(friendlyError(e.message));
    } finally {
      setLoading(false);
    }
  };

  const updateQuestion = (questionIndex, field, value) => {
    setEditableQuestions((current) =>
      current.map((question, index) => {
        if (index !== questionIndex) return question;
        if (field === 'allow_multiple') {
          return {
            ...question,
            allow_multiple: value,
            options: value ? question.options : normalizeSingleSelectOptions(question.options),
          };
        }
        return { ...question, [field]: value };
      }),
    );
  };

  const updateOption = (questionIndex, optionIndex, field, value) => {
    setEditableQuestions((current) =>
      current.map((question, qIndex) => {
        if (qIndex !== questionIndex) return question;

        let options = question.options.map((option, index) => {
          if (index !== optionIndex) return { ...option, sort_order: index };
          return { ...option, [field]: value, sort_order: index };
        });

        if (field === 'is_correct' && !question.allow_multiple) {
          options = options.map((option, index) => ({
            ...option,
            is_correct: index === optionIndex,
            sort_order: index,
          }));
        }

        return { ...question, options };
      }),
    );
  };

  const addManualQuestion = () => {
    setEditableQuestions((current) => [
      ...current,
      createManualQuestion(generatedData?.thumbnail_url),
    ]);
    setExpandedIdx(editableQuestions.length);
  };

  const removeQuestion = (questionIndex) => {
    setEditableQuestions((current) => current.filter((_, index) => index !== questionIndex));
    setExpandedIdx((current) => {
      if (current == null) return current;
      if (current === questionIndex) return null;
      return current > questionIndex ? current - 1 : current;
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={step === 1 ? 'GPT Test Maker' : step === 2 ? 'Review Questions' : 'Confirm Test'}
    >
      <div className="space-y-4 min-h-[400px]">
        {error && (
          <div className="bg-[#FF4D4D]/10 border-2 border-[#FF4D4D] p-3 flex gap-2 text-[#FF4D4D] text-sm">
            <AlertCircle size={18} className="shrink-0" />
            <p className="font-bold">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 size={48} className="animate-spin text-[#0066FF]" />
            <p className="text-lg font-bold animate-pulse text-[#0A0A0A]">{loadingMessage}</p>
          </div>
        ) : (
          <>
            {step === 1 && (
              <div className="space-y-5">
                <div className="bg-[#0066FF]/10 border-2 border-[#0066FF]/30 p-3">
                  <p className="text-xs font-medium text-[#0A0A0A]/80">
                    Paste a YouTube link below and DinoQuest AI will analyze the video and generate an educational test for you automatically.
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] font-bold mb-1 uppercase tracking-wider text-[#0A0A0A]/60">
                    YouTube Video URL
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      className="field-input"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold mb-1 uppercase tracking-wider text-[#0A0A0A]/60">
                      Number of Questions
                    </label>
                    <select
                      className="field-input"
                      value={nQuestions}
                      onChange={(e) => setNQuestions(Number(e.target.value))}
                    >
                      {[5, 10, 15, 20, 30].map((n) => (
                        <option key={n} value={n}>
                          {n} Questions
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold mb-1 uppercase tracking-wider text-[#0A0A0A]/60">
                      Difficulty
                    </label>
                    <select
                      className="field-input"
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>

                <div className="border-t-2 border-[#0A0A0A]/10 pt-2">
                  <button
                    onClick={() => setShowAdvanced((value) => !value)}
                    className="flex items-center gap-2 text-xs font-bold text-[#0A0A0A]/40 hover:text-[#7C3AED] uppercase transition-colors"
                  >
                    <Settings2 size={14} />
                    {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
                  </button>

                  {showAdvanced && (
                    <div className="grid grid-cols-2 gap-4 mt-4 animate-in fade-in slide-in-from-top-1">
                      <div className="col-span-2">
                        <label className="block text-xs font-bold mb-1 text-[#0A0A0A]/70">
                          Custom Title (Optional)
                        </label>
                        <input
                          type="text"
                          className="field-input"
                          placeholder="Video title will be used if blank"
                          value={examConfig.title}
                          onChange={(e) => setExamConfig({ ...examConfig, title: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1 text-[#0A0A0A]/70">
                          Passing Score (0-10000)
                        </label>
                        <input
                          type="number"
                          className="field-input"
                          value={examConfig.passing_score}
                          onChange={(e) =>
                            setExamConfig({ ...examConfig, passing_score: Number(e.target.value) })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1 text-[#0A0A0A]/70">
                          Duration (Min)
                        </label>
                        <input
                          type="number"
                          className="field-input"
                          value={examConfig.duration_minutes}
                          onChange={(e) =>
                            setExamConfig({ ...examConfig, duration_minutes: Number(e.target.value) })
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4">
                  <button
                    onClick={handleGenerate}
                    disabled={!isValidUrl || loading}
                    className="w-full game-btn game-btn-blue flex items-center justify-center gap-2 py-4 disabled:opacity-50"
                  >
                    <Sparkles size={20} />
                    Generate Questions
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-[#FFF7D1] p-2 border-2 border-[#0A0A0A] shadow-[4px_4px_0_#0A0A0A]">
                  <img
                    src={generatedData?.thumbnail_url}
                    alt="thumbnail"
                    className="w-[120px] h-[68px] object-cover border-2 border-[#0A0A0A]"
                  />
                  <div className="overflow-hidden">
                    <h3 className="font-bold truncate text-[#0A0A0A]">{generatedData?.video_title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 bg-[#0066FF] text-[10px] uppercase font-bold text-white border border-[#0A0A0A]">
                        {editableQuestions.length} Questions
                      </span>
                    </div>
                  </div>
                </div>

                <div className="max-h-[350px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {editableQuestions.map((question, questionIndex) => (
                    <div key={questionIndex} className="game-panel !bg-[#FFFFFF] !shadow-none !border-2 border-[#0A0A0A]">
                      <button
                        onClick={() =>
                          setExpandedIdx(expandedIdx === questionIndex ? null : questionIndex)
                        }
                        className="w-full flex items-center justify-between p-3 text-left"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <span className="shrink-0 w-6 h-6 flex items-center justify-center bg-[#FFE500] text-[#0A0A0A] font-bold text-xs border-2 border-[#0A0A0A]">
                            {questionIndex + 1}
                          </span>
                          <span className="truncate text-sm text-[#0A0A0A] font-bold">
                            {question.question_text}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-mono font-bold text-[#0A0A0A]/40 uppercase">
                            XP {(question.weight || 1) * 100}
                          </span>
                          <ChevronDown
                            className={`transition-transform ${expandedIdx === questionIndex ? 'rotate-180' : ''}`}
                            size={16}
                          />
                        </div>
                      </button>

                      {expandedIdx === questionIndex && (
                        <div className="p-3 pt-0 border-t-2 border-[#0A0A0A]/10 animate-in fade-in slide-in-from-top-1">
                          <div className="space-y-3 mt-3">
                            <div>
                              <label className="text-[10px] font-bold text-[#0A0A0A]/40 uppercase block mb-1">
                                Question Text
                              </label>
                              <textarea
                                className="field-input"
                                value={question.question_text}
                                onChange={(e) =>
                                  updateQuestion(questionIndex, 'question_text', e.target.value)
                                }
                                rows={2}
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] font-bold text-[#0A0A0A]/40 uppercase block mb-1">
                                  Difficulty Weight (1-5)
                                </label>
                                <input
                                  type="range"
                                  min="1"
                                  max="5"
                                  step="1"
                                  className="w-full h-2 bg-[#F0F0F0] rounded-lg appearance-none cursor-pointer accent-[#7C3AED]"
                                  value={question.weight}
                                  onChange={(e) =>
                                    updateQuestion(questionIndex, 'weight', Number(e.target.value))
                                  }
                                />
                                <div className="flex justify-between text-[10px] text-[#0A0A0A]/30 px-1 mt-1 font-bold">
                                  <span>EASY</span>
                                  <span>BOSS</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 pt-4">
                                <input
                                  type="checkbox"
                                  id={`mult-${questionIndex}`}
                                  checked={question.allow_multiple}
                                  onChange={(e) =>
                                    updateQuestion(questionIndex, 'allow_multiple', e.target.checked)
                                  }
                                  className="w-4 h-4 accent-[#0066FF] border-2 border-[#0A0A0A]"
                                />
                                <label
                                  htmlFor={`mult-${questionIndex}`}
                                  className="text-xs font-bold text-[#0A0A0A]/70 uppercase"
                                >
                                  Allow Multiple
                                </label>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-[#0A0A0A]/40 uppercase block">
                                Options
                              </label>
                              {question.options.map((option, optionIndex) => (
                                <div key={optionIndex} className="flex items-center gap-2">
                                  <input
                                    type={question.allow_multiple ? 'checkbox' : 'radio'}
                                    name={`correct-${questionIndex}`}
                                    checked={option.is_correct}
                                    onChange={(e) =>
                                      updateOption(questionIndex, optionIndex, 'is_correct', e.target.checked)
                                    }
                                    className="w-4 h-4 accent-[#00A95C] shrink-0"
                                  />
                                  <input
                                    type="text"
                                    className={`field-input !py-1.5 !text-xs ${option.is_correct ? 'bg-[#00A95C]/10 border-[#00A95C]' : ''}`}
                                    value={option.option_text}
                                    onChange={(e) =>
                                      updateOption(questionIndex, optionIndex, 'option_text', e.target.value)
                                    }
                                  />
                                </div>
                              ))}
                            </div>

                            {!isQuestionValid(question) && (
                              <p className="text-[11px] font-bold text-[#FF4D4D]">
                                This question must have text, 4 filled options, and the correct number of right answers.
                              </p>
                            )}

                            <div className="pt-2">
                              <button
                                onClick={() => removeQuestion(questionIndex)}
                                className="text-[10px] font-bold text-[#FF4D4D] flex items-center gap-1 hover:underline"
                              >
                                <Trash2 size={12} /> REMOVE QUESTION
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  <button
                    onClick={addManualQuestion}
                    className="w-full border-2 border-dashed border-[#0A0A0A]/20 p-3 flex items-center justify-center gap-2 text-[#0A0A0A]/40 hover:text-[#0A0A0A] hover:border-[#0A0A0A]/40 transition-colors text-sm font-bold mt-2"
                  >
                    <Plus size={16} /> ADD QUESTION MANUALLY
                  </button>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 game-btn !bg-[#FFFFFF] py-4 flex items-center justify-center gap-2"
                  >
                    <ArrowLeft size={18} /> BACK
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={editableQuestions.length === 0 || hasInvalidQuestions}
                    className="flex-[2] game-btn game-btn-blue py-4 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    NEXT: CONFIRM <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div className="game-panel p-5 bg-[#FFFFFF] relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#7C3AED]/5 -mr-16 -mt-16 rounded-full blur-3xl" />

                  <div className="flex gap-4 relative z-10">
                    <img
                      src={generatedData?.thumbnail_url}
                      alt="thumbnail"
                      className="w-[140px] h-[80px] object-cover border-2 border-[#0A0A0A]"
                    />
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-[#0A0A0A]/40 uppercase block mb-1">
                        Test Title
                      </label>
                      <input
                        type="text"
                        className="w-full bg-transparent border-b-2 border-[#7C3AED] p-2 text-[#0A0A0A] font-bold focus:bg-[#0A0A0A]/5 outline-none"
                        value={examConfig.title || generatedData?.video_title}
                        onChange={(e) => setExamConfig({ ...examConfig, title: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="mt-8 grid grid-cols-3 gap-2">
                    <div className="text-center p-3 bg-[#FFFBF0] border-2 border-[#0A0A0A]">
                      <p className="text-[10px] font-bold text-[#0A0A0A]/40 uppercase">Questions</p>
                      <p className="text-xl font-bold text-[#0A0A0A]">{editableQuestions.length}</p>
                    </div>
                    <div className="text-center p-3 bg-[#FFFBF0] border-2 border-[#0A0A0A]">
                      <p className="text-[10px] font-bold text-[#0A0A0A]/40 uppercase">Duration</p>
                      <p className="text-xl font-bold text-[#0A0A0A]">{examConfig.duration_minutes}m</p>
                    </div>
                    <div className="text-center p-3 bg-[#00A95C]/10 border-2 border-[#00A95C]">
                      <p className="text-[10px] font-bold text-[#00A95C] uppercase">Est. XP</p>
                      <p className="text-xl font-bold text-[#00A95C]">+{totalXP}</p>
                    </div>
                  </div>
                </div>

                {hasInvalidQuestions && (
                  <p className="text-sm font-bold text-[#FF4D4D]">
                    Fix the invalid questions before saving.
                  </p>
                )}

                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleSave}
                    disabled={hasInvalidQuestions}
                    className="w-full game-btn game-btn-blue py-5 flex items-center justify-center gap-2 text-lg disabled:opacity-50"
                  >
                    <Check size={24} /> SAVE TO DINOQUEST
                  </button>
                  <button
                    onClick={() => setStep(2)}
                    className="w-full game-btn !bg-white py-4 flex items-center justify-center gap-2 font-bold opacity-60 hover:opacity-100 transition-opacity"
                  >
                    <ArrowLeft size={18} /> BACK TO QUESTIONS
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
