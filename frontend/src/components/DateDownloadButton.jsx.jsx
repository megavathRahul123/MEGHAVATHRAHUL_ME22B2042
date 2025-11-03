// frontend/src/components/DataDownloadButton.jsx

import React from 'react';

const DataDownloadButton = ({ symbol, timeframe }) => {
  const handleDownload = async () => {
    // 1. Construct the download URL (e.g., fetching 1000 bars)
    const url = `http://localhost:8000/api/historical-data?symbol=${symbol}&timeframe=${timeframe}&limit=1000`;
    
    try {
      // 2. Fetch the JSON data from the backend
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();

      // 3. Convert JSON data to CSV format
      const headers = Object.keys(data[0]).join(',');
      const rows = data.map(obj => Object.values(obj).join(',')).join('\n');
      const csvContent = headers + '\n' + rows;

      // 4. Trigger the download in the browser
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${symbol}_${timeframe}_data.csv`;
      link.click();
      
    } catch (error) {
      console.error("Download failed:", error);
      alert("Failed to download data. Ensure the backend is running and data exists.");
    }
  };

  return (
    <button 
      onClick={handleDownload}
      style={{
        padding: '8px 15px',
        backgroundColor: '#10b981',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: '600',
      }}
    >
      ⬇️ Download {timeframe.toUpperCase()} Data (CSV)
    </button>
  );
};

export default DataDownloadButton;