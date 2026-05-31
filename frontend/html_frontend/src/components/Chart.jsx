import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const Chart = ({ data }) => {
  return (
    <div style={{
      backgroundColor: 'var(--card-bg)',
      borderRadius: 'var(--border-radius)',
      padding: '2rem',
      boxShadow: 'var(--shadow-md)',
      height: '400px',
      width: '100%'
    }}>
      <h3 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Mood Trends (PHQ-8 Score)</h3>
      <ResponsiveContainer width="100%" height="80%">
        <LineChart
          data={data}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis 
            dataKey="date" 
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--text-muted)' }}
            dy={10}
          />
          <YAxis 
            domain={[0, 24]} 
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--text-muted)' }}
            dx={-10}
          />
          <Tooltip 
            contentStyle={{ 
              borderRadius: '8px', 
              border: 'none',
              boxShadow: 'var(--shadow-sm)' 
            }} 
          />
          <Line 
            type="monotone" 
            dataKey="score" 
            stroke="var(--primary-color)" 
            strokeWidth={3}
            dot={{ r: 4, strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default Chart;
