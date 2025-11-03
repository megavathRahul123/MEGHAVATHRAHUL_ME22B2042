// frontend/src/components/AlertIndicator.jsx

import React from 'react';

const AlertIndicator = ({ zScore }) => {
  const threshold = 2.0;
  const absZ = Math.abs(parseFloat(zScore));
  
  let status = "NORMAL";
  let color = "#10b981"; // Green

  if (zScore === '---' || isNaN(absZ)) {
    status = "WAITING";
    color = "#9ca3af"; // Gray
  } else if (absZ > threshold) {
    status = "SIGNAL ACTIVE (Z > 2.0)";
    color = "#ef4444"; // Red
  }

  return (
    <div 
      style={{
        backgroundColor: color,
        color: 'white',
        padding: '10px 15px',
        borderRadius: '5px',
        fontWeight: 'bold',
        textAlign: 'center',
        minWidth: '200px'
      }}
    >
      ALERT STATUS: {status}
    </div>
  );
};

export default AlertIndicator;