import { useState, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer 
} from 'recharts';
import { Loader2, AlertTriangle, TrendingUp } from 'lucide-react';
import { api } from '../api/client';

export default function XPBalanceChart() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await api('/api/stats/xp-balance?days=30');
        
        const formatted = res.map(item => {
          // Adjust parsing for timezone correctness if needed, but local string is usually fine here
          const dt = new Date(`${item.date}T00:00:00`);
          return {
            ...item,
            displayDate: dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          };
        });
        
        setData(formatted);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="game-panel p-6 flex flex-col items-center justify-center h-48 mt-5">
        <Loader2 className="animate-spin text-accent" size={24} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="game-panel p-4 flex items-center justify-center gap-2 border-crimson/30 text-crimson text-sm mt-5">
        <AlertTriangle size={16} />
        <span>Failed to load XP chart: {error}</span>
      </div>
    );
  }

  // Hide chart completely if user has exactly 0 balance for the entire 30-day period
  const isAllZero = data.every(d => d.xp === 0);

  if (isAllZero) {
    return null;
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#FFFBEA] border-2 border-[#0A0A0A] p-2 sm:p-3 shadow-[4px_4px_0_#0A0A0A] z-50 rounded-lg">
          <p className="font-bold text-[#0A0A0A] opacity-70 text-xs pb-1 uppercase">{`${label}`}</p>
          <p className="font-mono text-[#0A0A0A] font-bold text-sm tracking-tight">{`XP: ${payload[0].value.toLocaleString()}`}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="game-panel p-4 sm:p-5 mt-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg border-2 border-[#0A0A0A] flex items-center justify-center bg-[#FFE500] shadow-[2px_2px_0_#0A0A0A]">
          <TrendingUp size={16} className="text-[#0A0A0A]" />
        </div>
        <div>
          <h3 className="text-cream text-base font-bold uppercase tracking-wider leading-none">
            XP Balance
          </h3>
          <p className="text-muted text-[10px] uppercase font-bold mt-1">
            Daily Ending Balance (Last 30 Days)
          </p>
        </div>
      </div>
      
      <div className="w-full h-44 mt-6">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <XAxis 
              dataKey="displayDate" 
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickLine={false} 
              tick={{ fontSize: 10, fill: '#888', fontWeight: 600 }}
              dy={10}
              minTickGap={20}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 10, fill: '#aaa', fontWeight: 600, fontFamily: 'monospace' }} 
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 2 }} />
            <Line 
              type="monotone" 
              dataKey="xp" 
              stroke="#FFE500" 
              strokeWidth={3} 
              isAnimationActive={true}
              animationDuration={800}
              dot={{ r: 0 }}
              activeDot={{ r: 6, fill: '#0A0A0A', stroke: '#FFE500', strokeWidth: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
