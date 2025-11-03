// frontend/src/components/TimeframeSelector.jsx

import React from 'react';

const TimeframeSelector = ({ selected, onSelect }) => {
  const timeframes = ['1m', '5m'];

  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
      <label style={{ fontSize: '14px', color: '#666' }}>Timeframe:</label>
      {timeframes.map((tf) => (
        <button
          key={tf}
          onClick={() => onSelect(tf)}
          style={{
            padding: '8px 12px',
            border: `1px solid ${selected === tf ? '#0ea5e9' : '#ccc'}`,
            backgroundColor: selected === tf ? '#0ea5e9' : '#fff',
            color: selected === tf ? '#fff' : '#333',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          {tf.toUpperCase()}
        </button>
      ))}
    </div>
  );
};

export default TimeframeSelector;