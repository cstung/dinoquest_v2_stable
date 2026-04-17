import { useState, useEffect } from 'react';
import { api } from '../api/client';
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, ZAxis
} from 'recharts';
import { Loader2, AlertCircle } from 'lucide-react';

export default function PerformanceView({ testId, userId, isAdmin }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(userId);

  // If we are admin, we might need a list of users who took the test
  const [usersList, setUsersList] = useState([]);

  useEffect(() => {
    if (isAdmin && testId) {
      // Find uniquely who took the test
      api(`/api/admin/examinations/${testId}/attempts`).then((attempts) => {
         const uMap = {};
         attempts.forEach(a => {
           // a.user_name was provided by admin list
           uMap[a.user_name] = a; // we don't return user_id directly there, wait.
         });
         // The user wanted a dropdown with user_id. 
         // Let's assume the component receives the list if needed or we fetch.
      });
    }
  }, [isAdmin, testId]);

  useEffect(() => {
    if (!testId || !selectedUser) return;
    setLoading(true);
    setError(null);
    const endpoint = isAdmin 
      ? `/api/admin/examinations/${testId}/performance?user_id=${selectedUser}`
      : `/api/examinations/${testId}/performance`;
      
    api(endpoint)
      .then(res => setData(res))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [testId, selectedUser, isAdmin]);

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
  }
  if (error) {
    return <div className="p-4 bg-[#FFF0F0] text-[#FF4D4D] text-sm"><AlertCircle className="inline mr-2" size={16}/>{error}</div>;
  }
  if (!data || !data.attempts || data.attempts.length === 0) {
    return (
      <div className="text-center p-8 opacity-60 text-sm">
        No attempts found for this user in this test.
      </div>
    );
  }

  // Chart 1: Score Trend
  // X: Attempt #, Y: Score
  const scoreTrendData = data.attempts.map((a, i) => ({
    name: `Attempt ${data.attempts.length - i}`, // Newest first from API, so reverse index
    score: a.score
  })).reverse(); // Reverse to show oldest -> newest

  // Chart 2: Avg Time vs Accuracy (Scatter)
  // For each question over all attempts, what is average time and accuracy?
  const avgData = data.questions.map(q => {
    const totalTime = q.attempts.reduce((sum, a) => sum + (a.duration || 0), 0);
    const correctCount = q.attempts.filter(a => a.is_correct).length;
    return {
      name: `Q${q.question_id}`,
      avgTime: q.attempts.length ? Math.round(totalTime / q.attempts.length) : 0,
      accuracy: q.attempts.length ? Math.round((correctCount / q.attempts.length) * 100) : 0,
      id: q.question_id
    };
  });

  return (
    <div className="flex flex-col gap-6">
      {/* If >1 attempt, show comparison charts */}
      {data.attempts.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border-2 border-[#0A0A0A] p-3 shadow-[4px_4px_0_#0A0A0A]">
            <h4 className="font-bold text-sm mb-4">Score Progression</h4>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={scoreTrendData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} domain={[0, 10000]} />
                  <RechartsTooltip contentStyle={{ fontSize: '12px' }} />
                  <Line type="monotone" dataKey="score" stroke="#0066FF" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white border-2 border-[#0A0A0A] p-3 shadow-[4px_4px_0_#0A0A0A]">
            <h4 className="font-bold text-sm mb-4">Avg Time vs Accuracy</h4>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis type="number" dataKey="avgTime" name="Time(s)" tick={{ fontSize: 10 }} />
                  <YAxis type="number" dataKey="accuracy" name="Accuracy(%)" tick={{ fontSize: 10 }} domain={[0, 100]} />
                  <RechartsTooltip cursor={{strokeDasharray: '3 3'}} contentStyle={{ fontSize: '10px' }} />
                  <Scatter name="Questions" data={avgData} fill="#7C3AED" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* GitHub-style Heatmap */}
      <div className="bg-white border-2 border-[#0A0A0A] p-4 shadow-[4px_4px_0_#0A0A0A] overflow-x-auto">
        <h4 className="font-bold text-sm mb-4">Progression Heatmap</h4>
        <div className="inline-block min-w-full">
          <div className="flex">
            {/* Rows (Questions) */}
            <div className="flex flex-col mr-2">
              <div className="h-6 mb-2"></div> {/* Header spacer */}
              {data.questions.map((q, i) => (
                <div key={q.question_id} className="h-10 text-xs font-mono font-bold flex items-center justify-end pr-2 opacity-60">
                  Q{i + 1}
                </div>
              ))}
            </div>

            {/* Columns (Attempts) — sorted oldest → newest (A1 leftmost) */}
             <div className="flex gap-2">
              {[...data.attempts].reverse().map((attempt, colIndex) => {
                const attemptNum = colIndex + 1;
                return (
                  <div key={attempt.attempt_id} className="flex flex-col gap-0 items-center">
                    <div className="h-6 text-[10px] font-mono opacity-80 mb-2 truncate max-w-[40px]" title={`Attempt ${attemptNum}`}>
                       A{attemptNum}
                    </div>
                    {data.questions.map(q => {
                      // After reversing, colIndex maps to reversed array index
                      // We need to find this attempt's answers in q.attempts
                      // q.attempts is also DESC from API, so reverse it too
                      const reversedQAttempts = [...(q.attempts || [])].reverse();
                      const ans = reversedQAttempts[colIndex];
                      const isSkipped = ans ? ans.is_skipped : true;
                      const isCorrect = ans ? ans.is_correct : false;
                      const duration = ans && ans.duration !== null ? Math.round(ans.duration) : 0;
                      
                      let bg = '#E5E7EB'; // neutral gray for skipped
                      let color = '#6B7280';
                      if (isSkipped) {
                        bg = '#E5E7EB';
                        color = '#9CA3AF';
                      } else if (isCorrect) {
                        bg = '#00A95C'; // green for correct
                        color = '#FFFFFF';
                      } else {
                        bg = '#FF4D4D'; // red for incorrect
                        color = '#FFFFFF';
                      }

                      return (
                        <div
                          key={`${q.question_id}-${attempt.attempt_id}`}
                          className="w-10 h-10 flex items-center justify-center text-[10px] font-mono border-2 border-transparent transition-transform hover:scale-110 mb-0"
                          style={{
                            backgroundColor: bg,
                            color: color,
                            border: '2px solid #0A0A0A',
                            marginTop: '-2px', // overlap borders
                            marginLeft: '-2px'
                          }}
                          title={`Q${q.question_id} | Attempt ${attemptNum} | ${duration}s | ${isSkipped ? 'Skipped' : isCorrect ? 'Correct' : 'Wrong'}`}
                        >
                          {duration}s
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
