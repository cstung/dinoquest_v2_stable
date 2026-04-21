import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import {
  BookOpen, Plus, Trash2, Edit3, Eye, Upload,
  ChevronDown, ChevronUp, Save, X, Loader2,
  AlertCircle, BarChart2, Check, Clock, Settings2,
  Users, FileText, ArrowLeft, Unlock
} from 'lucide-react';
import PerformanceView from '../components/PerformanceView';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell
} from 'recharts';

const PENALTY_MODES = [
  { value: 'none', label: 'No penalty (wrong = 0 pts)' },
  { value: 'absolute', label: 'Absolute deduction' },
];

const ORDER_MODES = [
  { value: 'fixed', label: 'Fixed order' },
  { value: 'random', label: 'Randomized' },
];

export default function AdminExaminations() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Create/Edit modal
  const [showForm, setShowForm] = useState(false);
  const [editingTest, setEditingTest] = useState(null);
  const [form, setForm] = useState(defaultForm());

  // Detail view
  const [selectedTest, setSelectedTest] = useState(null);
  const [testDetail, setTestDetail] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Question form
  const [showQForm, setShowQForm] = useState(false);
  const [qForm, setQForm] = useState(defaultQForm());

  // Import
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState('');

  // Attempts & Time Logs
  const [attempts, setAttempts] = useState([]);
  const [showAttempts, setShowAttempts] = useState(false);
  const [attemptLogs, setAttemptLogs] = useState(null);
  const [showLogs, setShowLogs] = useState(false);

  // Retry requests
  const [retryRequests, setRetryRequests] = useState([]);
  const [showRetryRequests, setShowRetryRequests] = useState(false);

  function defaultForm() {
    return {
      title: '',
      description: '',
      duration_minutes: 30,
      passing_score: null,
      question_order: 'fixed',
      penalty_mode: 'none',
      penalty_value: 0,
      thumbnail_url: '',
      is_published: true,
    };
  }

  function defaultQForm() {
    return {
      question_text: '',
      media_type: 'none',
      media_url: '',
      explanation: '',
      weight: 1,
      sort_order: 0,
      allow_multiple: false,
      options: [
        { option_text: '', is_correct: false, sort_order: 0 },
        { option_text: '', is_correct: false, sort_order: 1 },
      ],
    };
  }

  const loadTests = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/api/admin/examinations');
      setTests(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTests();
  }, [loadTests]);

  const loadDetail = useCallback(async (id) => {
    try {
      const data = await api(`/api/admin/examinations/${id}`);
      setTestDetail(data);
      setSelectedTest(id);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const loadAnalytics = useCallback(async (id) => {
    try {
      const data = await api(`/api/admin/examinations/${id}/analytics`);
      setAnalytics(data);
      setShowAnalytics(true);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  async function handleUnlockAttempt(attemptId) {
    if (!window.confirm("Are you sure you want to unlock this attempt so the user can retake the test?")) return;
    try {
      await api(`/api/admin/examinations/attempts/${attemptId}/unlock`, { method: 'POST' });
      const updatedAttempts = attempts.map(a => a.id === attemptId ? { ...a, status: 'unlocked' } : a);
      setAttempts(updatedAttempts);
      setRetryRequests(prev => prev.filter(r => r.attempt_id !== attemptId));
      alert('Attempt unlocked successfully.');
    } catch (e) {
      alert(e.message);
    }
  }

  const handleThumbnailUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate 1:1 specifically here on frontend as requested
    const img = new Image();
    img.onload = async () => {
      if (img.width !== img.height) {
        alert("Thumbnail must be square (1:1)");
        return;
      }
      // If valid square, upload it
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await api('/api/uploads', {
          method: 'POST',
          body: formData,
        });
        setForm((prev) => ({
          ...prev,
          thumbnail_url: res.path,
        }));
      } catch (err) {
        alert(err.message);
      }
    };
    img.src = URL.createObjectURL(file);
  };

  const loadRetryRequests = useCallback(async () => {
    try {
      const data = await api(`/api/admin/examinations/retry-requests`);
      setRetryRequests(data);
      setShowRetryRequests(true);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const loadAttempts = useCallback(async (testId) => {
    try {
      const data = await api(`/api/admin/examinations/${testId}/attempts`);
      setAttempts(data);
      setShowAttempts(true);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const loadAttemptLogs = useCallback(async (testId, attemptId) => {
    try {
      const data = await api(
        `/api/admin/examinations/${testId}/attempts/${attemptId}/logs`,
      );
      setAttemptLogs(data);
      setShowLogs(true);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // ── CRUD handlers ─────────────────────────────────────────────────────
  const handleSaveTest = async () => {
    const body = {
      ...form,
      passing_score: form.passing_score || null,
    };
    try {
      if (editingTest) {
        await api(`/api/admin/examinations/${editingTest}`, {
          method: 'PUT',
          body,
        });
      } else {
        await api('/api/admin/examinations', { method: 'POST', body });
      }
      setShowForm(false);
      setEditingTest(null);
      setForm(defaultForm());
      loadTests();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDeleteTest = async (id) => {
    if (!confirm('Deactivate this test?')) return;
    try {
      await api(`/api/admin/examinations/${id}`, { method: 'DELETE' });
      loadTests();
      if (selectedTest === id) {
        setSelectedTest(null);
        setTestDetail(null);
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const handleAddQuestion = async () => {
    try {
      await api(`/api/admin/examinations/${selectedTest}/questions`, {
        method: 'POST',
        body: {
          ...qForm,
          media_url: qForm.media_url || null,
          explanation: qForm.explanation || null,
        },
      });
      setShowQForm(false);
      setQForm(defaultQForm());
      loadDetail(selectedTest);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDeleteQuestion = async (qId) => {
    if (!confirm('Delete this question?')) return;
    try {
      await api(
        `/api/admin/examinations/${selectedTest}/questions/${qId}`,
        { method: 'DELETE' },
      );
      loadDetail(selectedTest);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleImport = async () => {
    try {
      const parsed = JSON.parse(importJson);
      const body = Array.isArray(parsed)
        ? { questions: parsed }
        : parsed;
      const res = await api(`/api/admin/examinations/${selectedTest}/import`, {
        method: 'POST',
        body,
      });
      setShowImport(false);
      setImportJson('');
      loadDetail(selectedTest);
      alert(`Imported ${res.imported} questions`);
    } catch (e) {
      setError(e.message || 'Invalid JSON');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#7C3AED] flex items-center justify-center border-2 border-[#0A0A0A] shadow-[4px_4px_0_#0A0A0A]">
            <Settings2 size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Manage Examinations</h1>
            <p className="text-sm opacity-60">Create and configure tests</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="game-btn game-btn-blue flex items-center gap-1"
            onClick={loadRetryRequests}
          >
            <AlertCircle size={14} /> Retry Requests
          </button>
          <button
            className="game-btn game-btn-purple flex items-center gap-1"
            onClick={() => {
              setEditingTest(null);
              setForm(defaultForm());
              setShowForm(true);
            }}
            id="btn-create-test"
          >
            <Plus size={14} /> New Test
          </button>
        </div>
      </div>

      {error && (
        <div className="game-panel p-3 mb-4 flex items-center gap-2 bg-[#FFF0F0]">
          <AlertCircle size={16} className="text-[#FF4D4D]" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Test List ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 mb-6">
        {tests.length === 0 && (
          <div className="game-panel p-6 text-center opacity-60">
            No tests yet. Create one to get started.
          </div>
        )}
        {tests.map((t) => (
          <div
            key={t.id}
            className={`game-panel p-3 flex items-center gap-3 cursor-pointer ${
              selectedTest === t.id ? 'bg-[#FFF7D1]' : ''
            }`}
            onClick={() => loadDetail(t.id)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm truncate">{t.title}</h3>
                {!t.is_active && (
                  <span className="text-[10px] font-mono bg-[#FF4D4D] text-white px-1.5 py-0.5 border border-[#0A0A0A]">
                    INACTIVE
                  </span>
                )}
                {!t.is_published && (
                  <span className="text-[10px] font-mono bg-[#FFF7D1] px-1.5 py-0.5 border border-[#0A0A0A]">
                    DRAFT
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs font-mono opacity-60">
                  <Clock size={10} className="inline mr-0.5" />
                  {t.duration_minutes}m
                </span>
                <span className="text-xs font-mono opacity-60">
                  {t.question_count} Q
                </span>
                <span className="text-xs font-mono opacity-60 capitalize">
                  Penalty: {t.penalty_mode}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                className="p-1.5 border-2 border-[#0A0A0A] bg-white shadow-[2px_2px_0_#0A0A0A] hover:bg-[#7C3AED] hover:text-white"
                title="Edit"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingTest(t.id);
                  setForm({
                    title: t.title,
                    description: t.description || '',
                    duration_minutes: t.duration_minutes,
                    passing_score: t.passing_score || '',
                    question_order: t.question_order,
                    penalty_mode: t.penalty_mode,
                    penalty_value: t.penalty_value,
                    thumbnail_url: t.thumbnail_url || '',
                    is_published: t.is_published,
                  });
                  setShowForm(true);
                }}
              >
                <Edit3 size={14} />
              </button>
              <button
                className="p-1.5 border-2 border-[#0A0A0A] bg-white shadow-[2px_2px_0_#0A0A0A] hover:bg-[#FF4D4D] hover:text-white"
                title="Deactivate"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteTest(t.id);
                }}
              >
                <Trash2 size={14} />
              </button>
              <button
                className="p-1.5 border-2 border-[#0A0A0A] bg-white shadow-[2px_2px_0_#0A0A0A] hover:bg-[#0066FF] hover:text-white"
                title="Analytics"
                onClick={(e) => {
                  e.stopPropagation();
                  loadAnalytics(t.id);
                }}
              >
                <BarChart2 size={14} />
              </button>
              <button
                className="p-1.5 border-2 border-[#0A0A0A] bg-white shadow-[2px_2px_0_#0A0A0A] hover:bg-[#7C3AED] hover:text-white"
                title="Time Logs"
                onClick={(e) => {
                  e.stopPropagation();
                  loadAttempts(t.id);
                }}
              >
                <FileText size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Test Detail (Questions) ──────────────────────────────────── */}
      {testDetail && selectedTest && (
        <div className="game-panel p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">
              Questions — {testDetail.title}
            </h2>
            <div className="flex items-center gap-2">
              <button
                className="game-btn game-btn-blue flex items-center gap-1 !py-1.5 !px-3 !text-xs"
                onClick={() => setShowImport(true)}
              >
                <Upload size={12} /> Import JSON
              </button>
              <button
                className="game-btn game-btn-purple flex items-center gap-1 !py-1.5 !px-3 !text-xs"
                onClick={() => {
                  setQForm(defaultQForm());
                  setShowQForm(true);
                }}
              >
                <Plus size={12} /> Add Question
              </button>
            </div>
          </div>

          {testDetail.questions.length === 0 ? (
            <p className="text-sm opacity-60 text-center py-4">
              No questions yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {testDetail.questions.map((q, qi) => (
                <div key={q.id} className="border-2 border-[#0A0A0A] p-3 bg-white">
                  <div className="flex items-start gap-2">
                    <span className="bg-[#0A0A0A] text-[#FFE500] text-xs font-mono px-1.5 py-0.5 flex-shrink-0">
                      {qi + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{q.question_text}</p>
                      {q.media_url && (
                        <p className="text-xs font-mono opacity-60 mt-0.5 truncate">
                          📎 {q.media_type}: {q.media_url}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {q.options.map((o) => (
                          <span
                            key={o.id}
                            className={`text-xs px-2 py-0.5 border-2 border-[#0A0A0A] ${
                              o.is_correct
                                ? 'bg-[#00A95C] text-white'
                                : 'bg-[#FFF7D1]'
                            }`}
                          >
                            {o.is_correct && <Check size={10} className="inline mr-0.5" />}
                            {o.option_text}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs font-mono opacity-40 mt-1">
                        Weight: {q.weight} · {q.allow_multiple ? 'Multi' : 'Single'} select
                      </p>
                    </div>
                    <button
                      className="p-1 border-2 border-[#0A0A0A] bg-white hover:bg-[#FF4D4D] hover:text-white flex-shrink-0"
                      onClick={() => handleDeleteQuestion(q.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Create/Edit Test Modal ───────────────────────────────────── */}
      {showForm && (
        <Modal
          title={editingTest ? 'Edit Test' : 'New Test'}
          onClose={() => {
            setShowForm(false);
            setEditingTest(null);
          }}
        >
          <div className="space-y-3">
            <Field label="Title">
              <input
                className="field-input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Test title"
              />
            </Field>
            <Field label="Description (optional)">
              <textarea
                className="field-input"
                rows={2}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Duration (min)">
                <input
                  type="number"
                  className="field-input"
                  value={form.duration_minutes}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      duration_minutes: Number(e.target.value),
                    })
                  }
                  min={1}
                />
              </Field>
              <Field label="Passing score (0-10000)">
                <input
                  type="number"
                  className="field-input"
                  value={form.passing_score ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      passing_score: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  placeholder="Optional"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Question order">
                <select
                  className="field-input"
                  value={form.question_order}
                  onChange={(e) =>
                    setForm({ ...form, question_order: e.target.value })
                  }
                >
                  {ORDER_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Penalty mode">
                <select
                  className="field-input"
                  value={form.penalty_mode}
                  onChange={(e) =>
                    setForm({ ...form, penalty_mode: e.target.value })
                  }
                >
                  {PENALTY_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {form.penalty_mode === 'absolute' && (
              <Field label="Penalty value (per wrong answer)">
                <input
                  type="number"
                  className="field-input"
                  value={form.penalty_value}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      penalty_value: Number(e.target.value),
                    })
                  }
                  min={0}
                />
              </Field>
            )}
            <Field label="Thumbnail Image (Square 1:1)">
              <div className="flex items-center gap-4">
                {form.thumbnail_url && (
                  <img
                    src={form.thumbnail_url}
                    alt="thumbnail preview"
                    className="w-16 h-16 object-cover border-2 border-[#0A0A0A]"
                  />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleThumbnailUpload}
                  className="field-input p-1 max-w-[200px]"
                />
              </div>
            </Field>
            <Field label="Published">
              <label className="flex items-center gap-2 mt-1">
                <input
                  type="checkbox"
                  checked={form.is_published}
                  onChange={(e) =>
                    setForm({ ...form, is_published: e.target.checked })
                  }
                  className="w-4 h-4"
                />
                <span className="text-sm">Make this test visible to users</span>
              </label>
            </Field>
            <button
              className="game-btn game-btn-purple w-full flex items-center justify-center gap-2"
              onClick={handleSaveTest}
            >
              <Save size={14} /> {editingTest ? 'Update Test' : 'Create Test'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Add Question Modal ───────────────────────────────────────── */}
      {showQForm && (
        <Modal
          title="Add Question"
          onClose={() => setShowQForm(false)}
        >
          <div className="space-y-3">
            <Field label="Question text">
              <textarea
                className="field-input"
                rows={2}
                value={qForm.question_text}
                onChange={(e) =>
                  setQForm({ ...qForm, question_text: e.target.value })
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Media type">
                <select
                  className="field-input"
                  value={qForm.media_type}
                  onChange={(e) =>
                    setQForm({ ...qForm, media_type: e.target.value })
                  }
                >
                  <option value="none">None</option>
                  <option value="image">Image</option>
                  <option value="youtube">YouTube</option>
                </select>
              </Field>
              {qForm.media_type !== 'none' && (
                <Field label="Media URL">
                  <input
                    className="field-input"
                    value={qForm.media_url}
                    onChange={(e) =>
                      setQForm({ ...qForm, media_url: e.target.value })
                    }
                    placeholder="https://..."
                  />
                </Field>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Weight">
                <input
                  type="number"
                  className="field-input"
                  value={qForm.weight}
                  onChange={(e) =>
                    setQForm({ ...qForm, weight: Number(e.target.value) })
                  }
                  min={1}
                />
              </Field>
              <Field label="Sort order">
                <input
                  type="number"
                  className="field-input"
                  value={qForm.sort_order}
                  onChange={(e) =>
                    setQForm({ ...qForm, sort_order: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Multi-select">
                <label className="flex items-center gap-2 mt-1">
                  <input
                    type="checkbox"
                    checked={qForm.allow_multiple}
                    onChange={(e) =>
                      setQForm({
                        ...qForm,
                        allow_multiple: e.target.checked,
                      })
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Yes</span>
                </label>
              </Field>
            </div>
            <Field label="Answer options">
              {qForm.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <input
                    className="field-input flex-1"
                    value={opt.option_text}
                    onChange={(e) => {
                      const newOpts = [...qForm.options];
                      newOpts[i] = {
                        ...newOpts[i],
                        option_text: e.target.value,
                      };
                      setQForm({ ...qForm, options: newOpts });
                    }}
                    placeholder={`Option ${i + 1}`}
                  />
                  <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={opt.is_correct}
                      onChange={(e) => {
                        const newOpts = [...qForm.options];
                        newOpts[i] = {
                          ...newOpts[i],
                          is_correct: e.target.checked,
                        };
                        setQForm({ ...qForm, options: newOpts });
                      }}
                      className="w-3.5 h-3.5"
                    />
                    Correct
                  </label>
                  {qForm.options.length > 2 && (
                    <button
                      className="text-[#FF4D4D]"
                      onClick={() => {
                        const newOpts = qForm.options.filter(
                          (_, j) => j !== i,
                        );
                        setQForm({ ...qForm, options: newOpts });
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button
                className="text-xs font-bold flex items-center gap-1 mt-1"
                onClick={() =>
                  setQForm({
                    ...qForm,
                    options: [
                      ...qForm.options,
                      {
                        option_text: '',
                        is_correct: false,
                        sort_order: qForm.options.length,
                      },
                    ],
                  })
                }
              >
                <Plus size={12} /> Add Option
              </button>
            </Field>
            <Field label="Explanation (optional)">
              <textarea
                className="field-input"
                rows={2}
                value={qForm.explanation}
                onChange={(e) =>
                  setQForm({ ...qForm, explanation: e.target.value })
                }
              />
            </Field>
            <button
              className="game-btn game-btn-purple w-full flex items-center justify-center gap-2"
              onClick={handleAddQuestion}
            >
              <Save size={14} /> Add Question
            </button>
          </div>
        </Modal>
      )}

      {/* ── Import Modal ─────────────────────────────────────────────── */}
      {showImport && (
        <Modal title="Import Questions (JSON)" onClose={() => setShowImport(false)}>
          <p className="text-xs opacity-60 mb-2">
            Paste a JSON array of questions. Each item should have: question_text,
            options (array with option_text &amp; is_correct), and optionally
            media_type, media_url, weight, explanation.
          </p>
          <textarea
            className="field-input font-mono text-xs"
            rows={10}
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            placeholder='[{"question_text":"...","options":[{"option_text":"A","is_correct":true},...]}]'
          />
          <button
            className="game-btn game-btn-blue w-full mt-3 flex items-center justify-center gap-2"
            onClick={handleImport}
          >
            <Upload size={14} /> Import
          </button>
        </Modal>
      )}

      {/* ── Analytics Modal ──────────────────────────────────────────── */}
      {showAnalytics && analytics && (
        <Modal title="Analytics" onClose={() => setShowAnalytics(false)}>
          <div className="max-h-[70vh] overflow-y-auto pr-2 pb-10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Stat label="Total Attempts" value={analytics.total_attempts} />
              <Stat label="Avg Score" value={Math.round(analytics.avg_score)} />
              <Stat label="Max Score" value={analytics.max_score} />
              <Stat label="Avg Duration" value={`${Math.round(analytics.avg_duration_seconds / 60)}m`} />
            </div>

            {analytics.total_attempts > 0 && (
              <div className="mb-6 p-4 border-2 border-[#0A0A0A] bg-[#FFF7D1]">
                <h3 className="font-bold mb-2">User Progression Analysis</h3>
                <div className="flex items-center gap-2 mb-4">
                  <label className="text-sm font-bold">Select User:</label>
                  <input
                    type="number"
                    className="p-1.5 border-2 border-[#0A0A0A] text-sm w-24"
                    placeholder="User ID"
                    onChange={(e) => {
                      const val = e.target.value;
                      setAnalytics(prev => ({ ...prev, selectedUserId: val ? Number(val) : null }));
                    }}
                  />
                  <p className="text-xs opacity-60">(Enter numeric User ID)</p>
                </div>
                {analytics.selectedUserId && (
                  <PerformanceView testId={selectedTest} userId={analytics.selectedUserId} isAdmin={true} />
                )}
              </div>
            )}

            <h3 className="font-bold text-lg mb-4">Question Stats</h3>
            <div className="max-h-60 overflow-y-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0A0A0A] text-[#FFE500]">
                    <th className="p-1.5 text-left border border-[#0A0A0A]">#</th>
                    <th className="p-1.5 text-left border border-[#0A0A0A]">Question</th>
                    <th className="p-1.5 text-right border border-[#0A0A0A]">Avg Time</th>
                    <th className="p-1.5 text-right border border-[#0A0A0A]">Correct %</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.questions.map((q, i) => (
                    <tr key={q.question_id} className="border-b border-[#0A0A0A]">
                      <td className="p-1.5 font-mono border border-[#0A0A0A]">{i + 1}</td>
                      <td className="p-1.5 border border-[#0A0A0A] truncate max-w-[120px]">
                        {q.question_text}
                      </td>
                      <td className="p-1.5 text-right font-mono border border-[#0A0A0A]">
                        {q.avg_time_seconds}s
                      </td>
                      <td className="p-1.5 text-right font-mono border border-[#0A0A0A]">
                        {Math.round(q.correct_rate * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Attempts List Modal ───────────────────────────────────────── */}
      {showAttempts && (
        <Modal
          title="Test Attempts"
          onClose={() => {
            setShowAttempts(false);
            setAttempts([]);
          }}
        >
          {attempts.length === 0 ? (
            <p className="text-xs opacity-60 text-center py-4">
              No attempts yet.
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0A0A0A] text-[#FFE500]">
                    <th className="p-1.5 text-left border border-[#0A0A0A]">User</th>
                    <th className="p-1.5 text-left border border-[#0A0A0A]">Status</th>
                    <th className="p-1.5 text-right border border-[#0A0A0A]">Score</th>
                    <th className="p-1.5 text-left border border-[#0A0A0A]">Started</th>
                    <th className="p-1.5 text-center border border-[#0A0A0A]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((a) => (
                    <tr key={a.id} className="border-b border-[#0A0A0A]">
                      <td className="p-1.5 font-bold border border-[#0A0A0A]">
                        {a.user_name}
                      </td>
                      <td className="p-1.5 border border-[#0A0A0A]">
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-mono border border-[#0A0A0A] ${
                            a.status === 'submitted'
                              ? 'bg-[#00A95C] text-white'
                              : a.status === 'timed_out'
                              ? 'bg-[#FF4D4D] text-white'
                              : 'bg-[#FFE500]'
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="p-1.5 text-right font-mono border border-[#0A0A0A]">
                        {a.score != null ? a.score.toLocaleString() : '—'}
                      </td>
                      <td className="p-1.5 font-mono border border-[#0A0A0A]">
                        {a.started_at
                          ? new Date(a.started_at).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="p-1.5 text-center border border-[#0A0A0A]">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            className="p-1 border-2 border-[#0A0A0A] bg-white hover:bg-[#7C3AED] hover:text-white"
                            title="View Time Log"
                            onClick={() => loadAttemptLogs(a.test_id, a.id)}
                          >
                            <Clock size={12} />
                          </button>
                          {(a.status === 'submitted' || a.status === 'timed_out' || a.status === 'in_progress') && (
                            <button
                              className="p-1 border-2 border-[#0A0A0A] bg-white hover:bg-[#00A95C] hover:text-white"
                              title="Unlock Attempt for Retake"
                              onClick={() => handleUnlockAttempt(a.id)}
                            >
                              <Unlock size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {/* ── Attempt Time Log Detail Modal ─────────────────────────────── */}
      {showLogs && attemptLogs && (
        <Modal
          title={`Time Log — ${attemptLogs.user_name}`}
          onClose={() => {
            setShowLogs(false);
            setAttemptLogs(null);
          }}
        >
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <Stat label="Score" value={attemptLogs.score != null ? attemptLogs.score.toLocaleString() : '—'} />
            <Stat label="Status" value={attemptLogs.status} />
            <Stat
              label="Total Time"
              value={
                attemptLogs.total_time != null
                  ? `${Math.floor(attemptLogs.total_time / 60)}m ${attemptLogs.total_time % 60}s`
                  : '—'
              }
            />
            <Stat label="Questions" value={attemptLogs.questions.length} />
          </div>

          {attemptLogs.questions.length === 0 ? (
            <p className="text-xs opacity-60 text-center py-4">
              No question logs recorded for this attempt.
            </p>
          ) : (
            <>
              {/* Analytics Charts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-white border-2 border-[#0A0A0A] p-2">
                  <h4 className="text-xs font-bold mb-2">Time per Question (s)</h4>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={attemptLogs.questions} margin={{ top: 5, right: 5, bottom: 5, left: -25 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                        <XAxis dataKey="order" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <RechartsTooltip contentStyle={{ fontSize: '10px' }} />
                        <Line type="monotone" dataKey="duration" stroke="#7C3AED" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white border-2 border-[#0A0A0A] p-2">
                  <h4 className="text-xs font-bold mb-2">Accuracy per Question</h4>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={attemptLogs.questions.map(q => ({...q, correctValue: q.is_correct ? 1 : 0}))} margin={{ top: 5, right: 5, bottom: 5, left: -25 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                        <XAxis dataKey="order" tick={{ fontSize: 10 }} />
                        <YAxis ticks={[0, 1]} tick={{ fontSize: 10 }} domain={[0, 1]} />
                        <RechartsTooltip contentStyle={{ fontSize: '10px' }} />
                        <Bar dataKey="correctValue">
                          {
                            attemptLogs.questions.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.is_correct ? '#00A95C' : '#FF4D4D'} />
                            ))
                          }
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Per-Question Table */}
              <div className="max-h-[40vh] overflow-y-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#0A0A0A] text-[#FFE500] sticky top-0">
                      <th className="p-1.5 text-left border border-[#0A0A0A]">#</th>
                      <th className="p-1.5 text-right border border-[#0A0A0A]">Time (s)</th>
                      <th className="p-1.5 text-center border border-[#0A0A0A]">Result</th>
                      <th className="p-1.5 text-left border border-[#0A0A0A]">Answer</th>
                      <th className="p-1.5 text-center border border-[#0A0A0A]">Behavior</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attemptLogs.questions.map((log) => (
                      <tr
                        key={log.question_id}
                        className="border-b border-[#0A0A0A] hover:bg-[#f9f9f9]"
                      >
                        <td className="p-1.5 font-mono border border-[#0A0A0A]">
                          Q{log.order}
                        </td>
                        <td className="p-1.5 text-right font-mono border border-[#0A0A0A]">
                          {log.duration != null ? `${log.duration}s` : '—'}
                        </td>
                        <td className="p-1.5 text-center border border-[#0A0A0A] font-bold">
                          {log.is_skipped ? (
                            <span className="text-gray-400">Skipped</span>
                          ) : log.is_correct ? (
                            <span className="text-[#00A95C]">✓ Correct</span>
                          ) : (
                            <span className="text-[#FF4D4D]">✗ Wrong</span>
                          )}
                        </td>
                        <td className="p-1.5 border border-[#0A0A0A] truncate max-w-[150px]">
                          {log.selected_answer || '—'}
                        </td>
                        <td className="p-1.5 text-center border border-[#0A0A0A]">
                          <span className="bg-[#FFF7D1] px-1 border border-[#0A0A0A] text-[10px]">
                            {log.behavior_label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Entry/Exit timestamps footer */}
          <div className="mt-4 pt-3 border-t-2 border-[#0A0A0A] flex justify-between text-xs font-mono opacity-60">
            <p>Start: {attemptLogs.start_time ? new Date(attemptLogs.start_time).toLocaleString() : '—'}</p>
            <p>End: {attemptLogs.end_time ? new Date(attemptLogs.end_time).toLocaleString() : '—'}</p>
          </div>
        </Modal>
      )}

      {/* ── Retry Requests Modal ───────────────────────────────────────── */}
      {showRetryRequests && (
        <Modal
          title="Retry Requests"
          onClose={() => setShowRetryRequests(false)}
        >
          {retryRequests.length === 0 ? (
            <p className="text-xs opacity-60 text-center py-4">
              No pending retry requests.
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0A0A0A] text-[#FFE500]">
                    <th className="p-1.5 text-left border border-[#0A0A0A]">User</th>
                    <th className="p-1.5 text-left border border-[#0A0A0A]">Test</th>
                    <th className="p-1.5 text-left border border-[#0A0A0A]">Req. Date</th>
                    <th className="p-1.5 text-center border border-[#0A0A0A]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {retryRequests.map((r) => (
                    <tr key={r.attempt_id} className="border-b border-[#0A0A0A]">
                      <td className="p-1.5 font-bold border border-[#0A0A0A]">
                        {r.user_name}
                      </td>
                      <td className="p-1.5 font-mono border border-[#0A0A0A]">
                        {r.test_name}
                      </td>
                      <td className="p-1.5 font-mono border border-[#0A0A0A]">
                        {r.start_time
                          ? new Date(r.start_time).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="p-1.5 text-center border border-[#0A0A0A]">
                        <button
                          className="p-1 border-2 border-[#0A0A0A] bg-white hover:bg-[#00A95C] hover:text-white"
                          title="Approve Retry"
                          onClick={() => handleUnlockAttempt(r.attempt_id)}
                        >
                          <Unlock size={12} className="inline mr-1" /> Approve
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ── Helper components ───────────────────────────────────────────────────

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="game-panel w-full max-w-lg max-h-[85vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 border-2 border-[#0A0A0A] bg-white hover:bg-[#7C3AED] hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-bold mb-1">{label}</label>
      {children}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-[#FFF7D1] border-2 border-[#0A0A0A] p-2 text-center">
      <p className="text-xs font-mono opacity-60">{label}</p>
      <p className="font-bold text-lg">{value}</p>
    </div>
  );
}
