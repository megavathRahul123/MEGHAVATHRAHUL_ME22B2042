import React, { useState, useEffect, useCallback } from 'react';
import Plot from 'react-plotly.js';
import { useWebSocket } from './hooks/useWebSocket'; 
import TimeframeSelector from './components/TimeFrameSelector'; // Interactive Widget
import DataDownloadButton from './components/DateDownloadButton.jsx'; // Download Widget
import AlertIndicator from './components/AlertIndicator'; // Alert Status Widget
import './App.css'; 

const BASE_API_URL = 'http://localhost:8000';
const DEFAULT_SYMBOL = 'BTCUSDT';
const DEFAULT_ROLLING_WINDOW = 500; 

// Simple component for displaying stats
const StatBox = ({ title, value, color }) => (
    <div style={{ flex: 1, border: '1px solid #ddd', padding: '10px', borderRadius: '8px', minHeight: '80px' }}>
        <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>{title}</p>
        <h2 style={{ margin: '5px 0 0 0', color: color }}>{value}</h2>
    </div>
);


function App() {
  const [historicalData, setHistoricalData] = useState([]);
  const [analytics, setAnalytics] = useState({ 
      z_score: '---', 
      hedge_ratio: '---', 
      latest_spread: '---',
      symbol_pair: `${DEFAULT_SYMBOL} / ETHUSDT`
  });
  const [loading, setLoading] = useState(true); // State is used to track API fetch status
  const [timeframe, setTimeframe] = useState('1m'); 

  // 1. Hook into the live WebSocket stream
  const liveData = useWebSocket();

  // 2. Update live analytics when new data is pushed from the backend
  useEffect(() => {
    if (liveData && liveData.z_score !== undefined) {
      setAnalytics({
        z_score: liveData.z_score.toFixed(2),
        hedge_ratio: liveData.hedge_ratio.toFixed(4),
        latest_spread: liveData.latest_spread.toFixed(3),
        symbol_pair: liveData.symbol_pair,
        timestamp: liveData.timestamp
      });
    }
  }, [liveData]);


  // 3. Function to fetch Historical Data (REST API)
  const fetchHistoricalData = useCallback(async () => {
    setLoading(true);
    try {
      const url = `${BASE_API_URL}/api/historical-data?symbol=${DEFAULT_SYMBOL}&timeframe=${timeframe}&limit=${DEFAULT_ROLLING_WINDOW}`;
      const response = await fetch(url);
      
      if (response.status === 503) {
          throw new Error("Database connection not available. Check Python backend.");
      }
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      // Map data for Plotly Candlestick chart
      const plotData = data.map(bar => ({
        x: new Date(bar.timestamp),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      }));
      setHistoricalData(plotData);

    } catch (error) {
      console.error("Error fetching historical data:", error);
      setHistoricalData([]); 
    } finally {
      setLoading(false);
    }
  }, [timeframe]); 

  // Fetch data on component mount AND whenever the timeframe state changes
  useEffect(() => {
    fetchHistoricalData();
  }, [fetchHistoricalData]);


  // --- Visualization: Plotly Configuration ---
  const candlestickTrace = {
    x: historicalData.map(d => d.x),
    open: historicalData.map(d => d.open),
    high: historicalData.map(d => d.high),
    low: historicalData.map(d => d.low),
    close: historicalData.map(d => d.close),
    type: 'candlestick',
    name: DEFAULT_SYMBOL,
    xaxis: 'x',
    yaxis: 'y',
  };

  const layout = {
    title: `${DEFAULT_SYMBOL} Price (${timeframe.toUpperCase()}) & Live Z-Score`,
    dragmode: 'zoom', 
    responsive: true,
    height: 600,
    xaxis: {
      type: 'date',
      rangeslider: { visible: false },
      title: 'Time',
    },
    yaxis: {
      title: 'Price (USD)',
    },
    // Visual Alert: Highlight chart area if Z-score is outside trading bounds (|Z| > 2)
    shapes: analytics.z_score !== '---' && Math.abs(parseFloat(analytics.z_score)) > 2 ? [{
        type: 'rect',
        xref: 'paper',
        yref: 'paper',
        x0: 0,
        y0: 0,
        x1: 1,
        y1: 1,
        fillcolor: 'rgba(255, 0, 0, 0.1)', 
        line: { width: 0 }
    }] : []
  };

  return (
    <div className="dashboard-container" style={{ padding: '20px', maxWidth: '1200px', margin: 'auto' }}>
      <h1>Quant Trader Analytics Dashboard</h1>
      
      {/* --- HEADER BAR WITH ALL WIDGETS --- */}
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* 1. System Status / Live Alert (Uses Z-score for status) */}
          <AlertIndicator zScore={analytics.z_score} />

          {/* 2. Interactive Timeframe Selector */}
          <TimeframeSelector selected={timeframe} onSelect={setTimeframe} />
          
          {/* 3. Data Export Widget */}
          <DataDownloadButton symbol={DEFAULT_SYMBOL} timeframe={timeframe} /> 
      </div>
      <hr style={{ borderTop: '1px solid #ccc' }}/>

      {/* --- LIVE METRICS CARDS --- */}
      <div className="stats-card" style={{ 
          display: 'flex', 
          gap: '20px', 
          marginBottom: '20px', 
          padding: '15px', 
          border: '1px solid #ccc', 
          borderRadius: '8px'
        }}>
        
        <StatBox title="Pair" value={analytics.symbol_pair} />
        <StatBox title="Hedge Ratio (β)" value={analytics.hedge_ratio} />
        <StatBox title="Latest Spread" value={analytics.latest_spread} />
        <StatBox 
          title="Live Z-Score" 
          value={analytics.z_score} 
          color={Math.abs(parseFloat(analytics.z_score)) > 2 ? '#ef4444' : '#10b981'} 
        />
      </div>

      {/* --- INTERACTIVE CHART --- */}
      {/* FIX: Use loading state to conditionally render chart or loading message */}
      {loading ? (
        <div style={{ height: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2em' }}>
            <p>Loading chart data from backend. Please wait...</p>
        </div>
      ) : (
        <Plot
          data={[candlestickTrace]}
          layout={layout}
          config={{ displayModeBar: true, scrollZoom: true }} 
          style={{ width: '100%', height: '100%' }}
        />
      )}
    </div>
  );
}

export default App;
