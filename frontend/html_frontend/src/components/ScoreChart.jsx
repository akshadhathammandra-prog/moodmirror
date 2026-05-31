import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const ScoreChart = ({ data }) => {
  if (!data || data.length === 0) return null;

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-block-navy/95 backdrop-blur-md p-4 rounded-xl shadow-lg border border-white/10">
          <p className="font-bold text-white mb-1">{label}</p>
          <p className="text-white font-bold text-base">Score: <span className="font-black text-block-pink">{payload[0].value}</span><span className="text-gray-400 text-sm font-medium">/24</span></p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="clean-card p-8 h-[400px] w-full bg-white border border-gray-200">
      <h3 className="mb-6 text-sm font-bold text-gray-400 tracking-wider uppercase">PHQ-8 Score Trend</h3>
      <ResponsiveContainer width="100%" height="85%">
        <LineChart
          data={data}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
          <XAxis 
            dataKey="date" 
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#6b7280', fontSize: 13, fontWeight: 'bold' }}
            dy={10}
          />
          <YAxis 
            domain={[0, 24]} 
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#6b7280', fontSize: 13, fontWeight: 'bold' }}
            dx={-10}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line 
            type="monotone" 
            dataKey="score" 
            stroke="#0A3323" 
            strokeWidth={4}
            dot={{ r: 6, strokeWidth: 3, fill: '#fff', stroke: '#0A3323' }}
            activeDot={{ r: 8, fill: '#D3968C', stroke: '#fff', strokeWidth: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ScoreChart;
