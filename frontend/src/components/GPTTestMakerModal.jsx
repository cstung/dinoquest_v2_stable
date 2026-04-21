import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Sparkles, Youtube, ChevronRight, ChevronLeft, 
  Trash2, Plus, Save, Loader2, AlertCircle, 
  Settings2, HelpCircle, Check, Info, ArrowLeft
} from 'lucide-react';
import Modal from './Modal';
import { api } from '../api/client';

const LOADING_STAGES = [
  { delay: 0,    message: "Fetching video info..." },
  { delay: 3000, message: "Downloading subtitles..." },
  { delay: 8000, message: "Sending to AI..." },
  { delay: 15000, message: "Generating questions (this can take up to 30s)..." },
];

const USER_ERRORS = {
  "Invalid YouTube URL format": "Please paste a valid YouTube link.",
  "This video has no subtitles.": "This video has no subtitles. Try a video that has auto-generated captions enabled.",
  "Daily limit": "You've reached today's generation limit. Try again tomorrow.",
};

function friendlyError(detail) {
  if (typeof detail !== 'string') return "Something went wrong. Please try again.";
  for (const [key, msg] of Object.entries(USER_ERRORS)) {
    if (detail.includes(key)) return msg;
  }
  return detail || "Something went wrong. Please try again.";
}

export default function GPTTestMakerModal({ isOpen, onClose, onSaved }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState(null);

  // Step 1: Input
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [nQuestions, setNQuestions] = useState(10);
  const [difficulty, setDifficulty] = useState("medium");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [examConfig, setExamConfig] = useState({
    title: "", passing_score: 5000, duration_minutes: 15,
    is_randomized: true, penalty_value: 0
  });

  // Step 2: Review (from API)
  const [generatedData, setGeneratedData] = useState(null);
  const [editableQuestions, setEditableQuestions] = useState([]);
  const [expandedIdx, setExpandedIdx] = useState(0);

  // Loading indicator stage management
  useEffect(() => {
    if (!loading) return;

    const timers = LOADING_STAGES.map(stage => {
      return setTimeout(() => {
        setLoadingMessage(stage.message);
      }, stage.delay);
    });

    return () => timers.forEach(clearTimeout);
  }, [loading]);

  const handleGenerate = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api('/api/admin/examinations/generate-from-youtube', {
        method: 'POST',
        body: {
          youtube_url: youtubeUrl,
          n_questions: nQuestions,
          difficulty,
          exam_config: examConfig
        }
      });
      setGeneratedData(res);
      setEditableQuestions(res.questions);
      setStep(2);
    } catch (e) {
      setError(friendlyError(e.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    setLoading(true);
    setLoadingMessage("Saving to DinoQuest...");
    try {
      const res = await api('/api/admin/examinations/save-generated', {
        method: 'POST',
        body: {
          exam_config: { 
            ...examConfig, 
            title: examConfig.title || generatedData.video_title,
            thumbnail_url: generatedData.thumbnail_url 
          },
          questions: editableQuestions
        }
      });
      onSaved(res.exam_id);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const updateQuestion = (idx, field, value) => {
    const updated = [...editableQuestions];
    updated[idx] = { ...updated[idx], [field]: value };
    setEditableQuestions(updated);
  };

  const updateOption = (qIdx, oIdx, field, value) => {
    const updated = [...editableQuestions];
    const updatedOptions = [...updated[qIdx].options];
    
    if (field === 'is_correct' && !updated[qIdx].allow_multiple) {
      // Unmark others if not allow_multiple
      updatedOptions.forEach((opt, i) => {
        opt.is_correct = i === oIdx;
      });
    } else {
      updatedOptions[oIdx] = { ...updatedOptions[oIdx], [field]: value };
    }
    
    updated[qIdx].options = updatedOptions;
    setEditableQuestions(updated);
  };

  const addManualQuestion = () => {
    const newQ = {
      question_text: "New Question",
      media_type: "image",
      media_url: generatedData?.thumbnail_url || "",
      weight: 1,
      allow_multiple: false,
      options: [
        { option_text: "Option 1", is_correct: true, sort_order: 0 },
        { option_text: "Option 2", is_correct: false, sort_order: 1 },
        { option_text: "Option 3", is_correct: false, sort_order: 2 },
        { option_text: "Option 4", is_correct: false, sort_order: 3 },
      ]
    };
    setEditableQuestions([...editableQuestions, newQ]);
    setExpandedIdx(editableQuestions.length);
  };

  const totalXP = useMemo(() => {
    return editableQuestions.reduce((sum, q) => sum + (q.weight || 1), 0) * 100;
  }, [editableQuestions]);

  const isValidUrl = useMemo(() => {
    return youtubeUrl.match(/https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/);
  }, [youtubeUrl]);

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={step === 1 ? "✨ GPT Test Maker" : step === 2 ? "Review Questions" : "Confirm Test"}
    >
      <div className="space-y-4 min-h-[400px]">
        {error && (
          <div className="bg-red-500/10 border-2 border-red-500 p-3 flex gap-2 text-red-500 text-sm">
            <AlertCircle size={18} className="shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 size={48} className="animate-spin text-blue-500" />
            <p className="text-lg font-bold animate-pulse text-cream">{loadingMessage}</p>
          </div>
        ) : (
          <>
            {step === 1 && (
              <div className="space-y-5">
                <div className="bg-blue-500/10 border-2 border-blue-500/30 p-3 rounded-sm">
                  <p className="text-xs text-cream/80">
                    Paste a YouTube link below and DinoQuest AI will analyze the video and generate an educational test for you automatically.
                  </p>
                </div>
                
                <div>
                  <label className="block text-xs font-bold mb-1 uppercase tracking-wider text-cream/70">YouTube Video URL</label>
                  <div className="relative">
                    <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 text-cream/40" size={18} />
                    <input 
                      type="text" 
                      className="w-full bg-[#0A0A0A] border-2 border-border p-3 pl-10 text-cream focus:border-blue-500 outline-none"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold mb-1 uppercase tracking-wider text-cream/70">Number of Questions</label>
                    <select 
                      className="w-full bg-[#0A0A0A] border-2 border-border p-3 text-cream focus:border-blue-500 outline-none"
                      value={nQuestions}
                      onChange={(e) => setNQuestions(Number(e.target.value))}
                    >
                      {[5, 10, 15, 20, 30].map(n => <option key={n} value={n}>{n} Questions</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1 uppercase tracking-wider text-cream/70">Difficulty</label>
                    <select 
                      className="w-full bg-[#0A0A0A] border-2 border-border p-3 text-cream focus:border-blue-500 outline-none"
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>

                <div className="border-t border-border pt-2">
                  <button 
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-2 text-xs font-bold text-cream/50 hover:text-blue-500 uppercase"
                  >
                    <Settings2 size={14} />
                    {showAdvanced ? "Hide" : "Show"} Advanced Settings
                  </button>
                  
                  {showAdvanced && (
                    <div className="grid grid-cols-2 gap-4 mt-4 animate-in fade-in slide-in-from-top-1">
                      <div className="col-span-2">
                        <label className="block text-xs font-bold mb-1 text-cream/70">Custom Title (Optional)</label>
                        <input 
                          type="text"
                          className="w-full bg-[#0A0A0A] border-2 border-border p-2 text-cream outline-none"
                          placeholder="Video Title will be used if blank"
                          value={examConfig.title}
                          onChange={(e) => setExamConfig({...examConfig, title: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1 text-cream/70">Passing Score (0-10000)</label>
                        <input 
                          type="number"
                          className="w-full bg-[#0A0A0A] border-2 border-border p-2 text-cream outline-none"
                          value={examConfig.passing_score}
                          onChange={(e) => setExamConfig({...examConfig, passing_score: Number(e.target.value)})}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1 text-cream/70">Duration (Min)</label>
                        <input 
                          type="number"
                          className="w-full bg-[#0A0A0A] border-2 border-border p-2 text-cream outline-none"
                          value={examConfig.duration_minutes}
                          onChange={(e) => setExamConfig({...examConfig, duration_minutes: Number(e.target.value)})}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4">
                  <button 
                    onClick={handleGenerate}
                    disabled={!isValidUrl || loading}
                    className="w-full game-btn game-btn-blue flex items-center justify-center gap-2 py-4"
                  >
                    <Sparkles size={20} />
                    ✨ Generate Questions
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-white/5 p-2 border-2 border-border">
                  <img src={generatedData?.thumbnail_url} alt="thumbnail" className="w-[120px] h-[68px] object-cover border-2 border-[#0A0A0A]" />
                  <div className="overflow-hidden">
                    <h3 className="font-bold truncate text-cream">{generatedData?.video_title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 bg-blue-600 text-[10px] uppercase font-bold text-white rounded-full">
                        {editableQuestions.length} Questions
                      </span>
                    </div>
                  </div>
                </div>

                <div className="max-h-[350px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {editableQuestions.map((q, qIdx) => (
                    <div key={qIdx} className="border-2 border-border bg-[#111111]">
                      <button 
                        onClick={() => setExpandedIdx(expandedIdx === qIdx ? null : qIdx)}
                        className="w-full flex items-center justify-between p-3 text-left"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <span className="shrink-0 w-6 h-6 flex items-center justify-center bg-blue-500 text-white font-bold text-xs ring-2 ring-[#0A0A0A]">
                            {qIdx + 1}
                          </span>
                          <span className="truncate text-sm text-cream font-medium">{q.question_text}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                           <span className="text-[10px] font-bold text-cream/40 uppercase">XP {q.weight * 100}</span>
                           <ChevronDown className={`transition-transform ${expandedIdx === qIdx ? 'rotate-180' : ''}`} size={16} />
                        </div>
                      </button>

                      {expandedIdx === qIdx && (
                        <div className="p-3 pt-0 border-t-2 border-border/50 animate-in fade-in slide-in-from-top-1">
                          <div className="space-y-3 mt-3">
                            <div>
                              <label className="text-[10px] font-bold text-cream/40 uppercase block mb-1">Question Text</label>
                              <textarea 
                                className="w-full bg-[#0A0A0A] border-2 border-border p-2 text-sm text-cream"
                                value={q.question_text}
                                onChange={(e) => updateQuestion(qIdx, 'question_text', e.target.value)}
                                rows={2}
                              />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] font-bold text-cream/40 uppercase block mb-1">Difficulty Weight (1-5)</label>
                                <input 
                                  type="range" min="1" max="5" step="1"
                                  className="w-full h-2 bg-border rounded-lg appearance-none cursor-pointer accent-blue-500"
                                  value={q.weight}
                                  onChange={(e) => updateQuestion(qIdx, 'weight', Number(e.target.value))}
                                />
                                <div className="flex justify-between text-[10px] text-cream/30 px-1 mt-1 font-bold">
                                  <span>EASY</span>
                                  <span>BOSS</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 pt-4">
                                <input 
                                  type="checkbox" id={`mult-${qIdx}`}
                                  checked={q.allow_multiple}
                                  onChange={(e) => updateQuestion(qIdx, 'allow_multiple', e.target.checked)}
                                  className="w-4 h-4 accent-blue-600"
                                />
                                <label htmlFor={`mult-${qIdx}`} className="text-xs font-bold text-cream/70 uppercase">Allow Multiple</label>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <label className="text-[10px] font-bold text-cream/40 uppercase block">Options</label>
                              {q.options.map((opt, oIdx) => (
                                <div key={oIdx} className="flex items-center gap-2">
                                  <input 
                                    type={q.allow_multiple ? "checkbox" : "radio"}
                                    name={`correct-${qIdx}`}
                                    checked={opt.is_correct}
                                    onChange={(e) => updateOption(qIdx, oIdx, 'is_correct', e.target.checked)}
                                    className="w-4 h-4 accent-green-500 shrink-0"
                                  />
                                  <input 
                                    type="text" 
                                    className={`w-full bg-[#0A0A0A] border-2 p-2 text-xs text-cream outline-none ${opt.is_correct ? 'border-green-500/50' : 'border-border'}`}
                                    value={opt.option_text}
                                    onChange={(e) => updateOption(qIdx, oIdx, 'option_text', e.target.value)}
                                  />
                                </div>
                              ))}
                            </div>

                            <div className="pt-2">
                               <button 
                                 onClick={() => {
                                   const filtered = editableQuestions.filter((_, i) => i !== qIdx);
                                   setEditableQuestions(filtered);
                                 }}
                                 className="text-[10px] font-bold text-red-500 flex items-center gap-1 hover:underline"
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
                    className="w-full border-2 border-dashed border-border p-3 flex items-center justify-center gap-2 text-cream/40 hover:text-cream hover:border-cream/40 transition-colors text-sm font-bold mt-2"
                  >
                    <Plus size={16} /> ADD QUESTION MANUALLY
                  </button>
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setStep(1)} className="flex-1 game-btn game-btn-gray py-4 flex items-center justify-center gap-2">
                    <ArrowLeft size={18} /> BACK
                  </button>
                  <button 
                    onClick={() => setStep(3)} 
                    disabled={editableQuestions.length === 0}
                    className="flex-[2] game-btn game-btn-blue py-4 flex items-center justify-center gap-2"
                  >
                    NEXT: CONFIRM <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div className="game-panel p-5 bg-[#111111] relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 -mr-16 -mt-16 rounded-full blur-3xl"></div>
                  
                  <div className="flex gap-4 relative z-10">
                    <img src={generatedData?.thumbnail_url} alt="thumbnail" className="w-[140px] h-[80px] object-cover ring-2 ring-[#0A0A0A]" />
                    <div className="flex-1">
                       <label className="text-[10px] font-bold text-cream/40 uppercase block mb-1">Test Title</label>
                       <input 
                         type="text" 
                         className="w-full bg-[#0A0A0A] border-b-2 border-blue-500 p-2 text-cream font-bold focus:bg-white/5 outline-none"
                         value={examConfig.title || generatedData?.video_title}
                         onChange={(e) => setExamConfig({...examConfig, title: e.target.value})}
                       />
                    </div>
                  </div>

                  <div className="mt-8 grid grid-cols-3 gap-2">
                    <div className="text-center p-3 bg-[#0A0A0A] border-2 border-border">
                       <p className="text-[10px] font-bold text-cream/40 uppercase">Questions</p>
                       <p className="text-xl font-bold text-cream">{editableQuestions.length}</p>
                    </div>
                    <div className="text-center p-3 bg-[#0A0A0A] border-2 border-border">
                       <p className="text-[10px] font-bold text-cream/40 uppercase">Duration</p>
                       <p className="text-xl font-bold text-cream">{examConfig.duration_minutes}m</p>
                    </div>
                    <div className="text-center p-3 bg-green-500/10 border-2 border-green-500/30">
                       <p className="text-[10px] font-bold text-green-500 uppercase">Est. XP</p>
                       <p className="text-xl font-bold text-green-500">+{totalXP}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <button onClick={handleSave} className="w-full game-btn game-btn-blue py-5 flex items-center justify-center gap-2 text-lg shadow-xl shadow-blue-500/20">
                    <Check size={24} /> SAVE TO DINOQUEST
                  </button>
                  <button onClick={() => setStep(2)} className="w-full game-btn game-btn-gray py-4 flex items-center justify-center gap-2 font-bold opacity-60 hover:opacity-100 transition-opacity">
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
