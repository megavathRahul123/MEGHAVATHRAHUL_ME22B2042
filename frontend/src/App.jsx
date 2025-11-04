import React, { useState, useEffect, useCallback, useRef } from 'react';
import Plot from 'react-plotly.js';

// --- Shared Configuration (Simplified) ---
const WS_URL = 'ws://localhost:8000/ws/live-analytics';
const DEFAULT_SYMBOL = 'BTCUSDT'; 

// WebSocket Ready States (Used internally in the hook)
const ReadyState = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
    UNSENT: 4,
};
const RECONNECT_MS = 5000;

// Function to map ReadyState to a human-readable status
const connectionStatus = (readyState) => {
    switch (readyState) {
        case ReadyState.CONNECTING: return { status: "Connecting", color: "text-yellow-500", dot: "bg-yellow-500" };
        case ReadyState.OPEN: return { status: "Live", color: "text-green-500", dot: "bg-green-500" };
        case ReadyState.CLOSING: return { status: "Closing", color: "text-orange-500", dot: "bg-orange-500" };
        case ReadyState.CLOSED: return { status: "Closed", color: "text-red-500", dot: "bg-red-500" };
        case ReadyState.UNSENT: return { status: "Init", color: "text-gray-500", dot: "bg-gray-500" };
        default: return { status: "Unknown", color: "text-gray-500", dot: "bg-gray-500" };
    }
};

// --- 1. Custom useWebSocket Hook (Integrated) ---

const buildDefaultUrl = () => {
  try {
    if (typeof window !== "undefined") {
      const port = 8000;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.hostname || "localhost";
      return `${proto}//${host}:${port}/ws/live-analytics`;
    }
  } catch (err) {
    console.error("Error building default WS URL:", err);
  }
  return `ws://localhost:8000/ws/live-analytics`;
};

const useWebSocket = (urlOverride) => {
  const [liveData, setLiveData] = useState(null);
  const [readyState, setReadyState] = useState(ReadyState.UNSENT);

  const shouldConnectRef = useRef(true);
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  const getUrl = useCallback(() => {
    if (typeof urlOverride === "string" && urlOverride.length) return urlOverride;
    return buildDefaultUrl();
  }, [urlOverride]);

  const cleanupSocket = useCallback(() => {
    try {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        if (
          wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING
        ) {
          wsRef.current.close(1000, "cleanup");
        }
      }
    } catch (e) {
      console.error("WebSocket cleanup error:", e);
    } finally {
      wsRef.current = null;
    }
  }, []);

  const connectRef = useRef(null); 
  const scheduleReconnect = useCallback(() => {
    if (!shouldConnectRef.current) return;
    if (reconnectTimerRef.current) return;

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (connectRef.current) connectRef.current();
    }, RECONNECT_MS);
  }, []);

  const connect = useCallback(() => {
    if (!shouldConnectRef.current) return;

    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const url = getUrl();
    setReadyState(ReadyState.CONNECTING);
    console.info("WebSocket: connecting to", url);

    try {
      wsRef.current = new WebSocket(url);
    } catch (err) {
      console.error("WebSocket constructor failed:", err);
      scheduleReconnect();
      return;
    }

    wsRef.current.onopen = () => {
      setReadyState(ReadyState.OPEN);
      console.info("WebSocket: connection open", url);
    };

    wsRef.current.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        setLiveData(parsed);
      } catch {
        setLiveData(event.data);
      }
    };

    wsRef.current.onerror = (event) => {
      console.error("WebSocket error:", event);
      setReadyState(ReadyState.CLOSED);
      try {
        wsRef.current.close();
      } catch (e) {
        console.error("WebSocket close error:", e);
      }
    };

    wsRef.current.onclose = (event) => {
      setReadyState(ReadyState.CLOSED);
      console.warn("WebSocket closed:", event);
      scheduleReconnect();
    };
  }, [getUrl, scheduleReconnect]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    shouldConnectRef.current = true;
    connect();

    return () => {
      shouldConnectRef.current = false;
      cleanupSocket();
    };
  }, [connect, cleanupSocket]);

  return { liveData, readyState };
};

// --- 2. Supporting Components (Integrated) ---

// Component that handles metric updates and the flash effect
const StatBox = ({ title, value, color, prevValue }) => {
    const [flashClass, setFlashClass] = useState('');
    const prevValueRef = useRef(prevValue);

    useEffect(() => {
        if (prevValueRef.current !== '---' && value !== '---') {
            const numValue = parseFloat(value);
            const numPrevValue = parseFloat(prevValueRef.current);

            // Determine flash color based on value change direction
            if (numValue > numPrevValue) {
                setFlashClass('flash-up');
            } else if (numValue < numPrevValue) {
                setFlashClass('flash-down');
            }

            // Clear the flash class after a short delay
            const timer = setTimeout(() => setFlashClass(''), 400);
            return () => clearTimeout(timer);
        }
        prevValueRef.current = value;
    }, [value]);

    return (
        <div className={`metric-box ${flashClass}`} style={{ 
            flex: 1, 
            border: '1px solid #ddd', 
            padding: '10px', 
            borderRadius: '8px', 
            minHeight: '80px', 
            backgroundColor: '#fff', 
            transition: 'background-color 0.2s ease-in-out',
            overflow: 'hidden',
        }}>
            <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>{title}</p>
            <h2 style={{ margin: '5px 0 0 0', color: color, fontSize: '1.5em', fontWeight: '600' }}>{value}</h2>
        </div>
    );
};

const AlertIndicator = ({ zScore }) => {
    const threshold = 2.0;
    const absZ = Math.abs(parseFloat(zScore));
    
    let status = "NORMAL";
    let color = "#10b981"; // Green (safe zone)

    if (zScore === '---' || isNaN(absZ)) {
        status = "WAITING";
        color = "#9ca3af"; // Gray
    } else if (absZ > threshold) {
        status = "SIGNAL ACTIVE (Z > 2.0)";
        color = "#ef4444"; // Red (alert zone)
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

const DataDownloadButton = () => {
    const handleDownload = () => {
      console.error("Download is currently disabled as the historical REST API is not used in this view.");
    };

    return (
        <button 
          onClick={handleDownload}
          style={{
            padding: '8px 15px',
            backgroundColor: '#0ea5e9', // Blue color for action
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'not-allowed', // Show that it's disabled
            fontWeight: '600',
            opacity: 0.7,
          }}
        >
          ⬇️ Download Data (Disabled)
        </button>
    );
};

// --- Timeframe Selector Component (Restored) ---
const TimeframeSelector = ({ selected, onSelect }) => {
    // These options are now only for UI demonstration, as the fetching is removed
    const timeframes = ['1m', '5m']; 

    return (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <label style={{ fontSize: '14px', color: '#666', fontWeight: 'bold' }}>Timeframe:</label>
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
                    fontWeight: '600',
                    transition: 'all 0.2s'
                  }}
                >
                    {tf.toUpperCase()}
                </button>
            ))}
        </div>
    );
};


// --- 3. Main App Component ---

function App() {
    const [analytics, setAnalytics] = useState({ 
        z_score: '---', 
        hedge_ratio: '---', 
        latest_spread: '---',
        symbol_pair: `${DEFAULT_SYMBOL} / ETHUSDT`,
        pie_summary: { long: 0.1, short: 0.1, neutral: 0.8 } 
    });
    // State to track historical data points for small chart visualization
    const [history, setHistory] = useState({
        hedgeRatio: Array(10).fill(null),
        spreadVelocity: Array(10).fill(0),
        timestamps: Array(10).fill('')
    });
    
    // State to track the selected timeframe (even if not currently used by backend)
    const [timeframe, setTimeframe] = useState('1m'); 

    // State to hold previous values for the flash effect
    const [prevAnalytics, setPrevAnalytics] = useState(analytics);

    // Hook into the live WebSocket stream (using integrated hook)
    const { liveData, readyState } = useWebSocket(WS_URL);
    const wsStatus = connectionStatus(readyState);
    
    // Helper function to update the history state for small charts
    const updateHistory = useCallback((currentData) => {
        const now = new Date().toLocaleTimeString('en-US', { hour12: false });
        
        setHistory(prev => {
            // Update Hedge Ratio History (simple shift)
            const newHedge = [...prev.hedgeRatio.slice(1), currentData.hedge_ratio];
            
            // Calculate Spread Velocity (difference between current and previous spread)
            const currentSpread = currentData.latest_spread;
            const prevSpread = parseFloat(prevAnalytics.latest_spread) || currentSpread;
            const velocity = currentSpread - prevSpread;
            const newVelocity = [...prev.spreadVelocity.slice(1), velocity];
            
            // Update Timestamps
            const newTimestamps = [...prev.timestamps.slice(1), now];

            return {
                hedgeRatio: newHedge,
                spreadVelocity: newVelocity,
                timestamps: newTimestamps,
            };
        });
    }, [prevAnalytics]);

    // Update live analytics and history when new data is pushed from the backend
    useEffect(() => {
        if (liveData && liveData.z_score !== undefined) {
            setPrevAnalytics(analytics); // Save current state before updating
            
            const newAnalytics = {
                z_score: liveData.z_score !== undefined ? liveData.z_score.toFixed(2) : analytics.z_score,
                hedge_ratio: liveData.hedge_ratio !== undefined ? liveData.hedge_ratio.toFixed(4) : analytics.hedge_ratio,
                latest_spread: liveData.latest_spread !== undefined ? liveData.latest_spread.toFixed(3) : analytics.latest_spread,
                symbol_pair: liveData.symbol_pair || analytics.symbol_pair,
                pie_summary: liveData.pie_summary || analytics.pie_summary
            };

            setAnalytics(newAnalytics);
            updateHistory(newAnalytics);
        }
    }, [liveData, analytics, updateHistory]); // Added 'analytics' and 'updateHistory' to dependencies for the updateHistory logic

    // --- Visualization: Pie Chart Rendering (Left Column) ---
    const renderPieChart = () => {
        const pieData = analytics.pie_summary;

        if (!pieData) {
            return (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                    Waiting for Z-Score calculation to prime Pie Summary...
                </div>
            );
        }
        
        const data = [{
            values: [pieData.long, pieData.short, pieData.neutral].map(v => (v * 100).toFixed(1)),
            labels: ['Long Bias', 'Short Bias', 'Neutral'],
            type: 'pie',
            hole: .4,
            marker: {
                colors: ['#10b981', '#ef4444', '#9ca3af'] // Green, Red, Gray
            },
            name: 'Sentiment Distribution',
            hoverinfo: 'label+percent',
        }];

        const layout = {
            title: 'Current Sentiment Distribution (Z-Score Bias)',
            height: null, 
            autosize: true,
            showlegend: true,
            margin: { t: 50, b: 20, l: 20, r: 20 },
            plot_bgcolor: '#fff',
            paper_bgcolor: '#fff',
        };

        return (
            <Plot
                data={data}
                layout={layout}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: '100%', height: '100%' }} // Plot container fill
            />
        );
    };

    // --- Visualization: Supplementary Charts (Right Column) ---
    
    // 1. Hedge Ratio Time Series (Top Right)
    const renderHedgeRatioChart = () => {
        const data = [{
            x: history.timestamps.filter(t => t),
            y: history.hedgeRatio.filter(r => r !== null),
            type: 'scatter',
            mode: 'lines',
            line: { color: '#0ea5e9', width: 2 },
            fill: 'tozeroy',
            fillcolor: 'rgba(14, 165, 233, 0.1)',
        }];

        const layout = {
            title: 'Hedge Ratio (Beta) Stability',
            height: 300,
            autosize: true,
            margin: { t: 40, b: 30, l: 30, r: 20 },
            xaxis: { showticklabels: false, zeroline: false },
            yaxis: { title: 'Beta', fixedrange: true },
            plot_bgcolor: '#fff',
            paper_bgcolor: '#fff',
        };

        return (
            <Plot
                data={data}
                layout={layout}
                config={{ displayModeBar: false }}
                style={{ width: '100%', height: '100%' }}
            />
        );
    };

    // 2. Spread Velocity Bar Chart (Bottom Right)
    const renderSpreadVelocityChart = () => {
        const data = [{
            x: history.timestamps.filter(t => t),
            y: history.spreadVelocity,
            type: 'bar',
            marker: { 
                color: history.spreadVelocity.map(v => v >= 0 ? '#10b981' : '#ef4444') 
            },
        }];

        const layout = {
            title: 'Spread Velocity (Tick-to-Tick Change)',
            height: 300,
            autosize: true,
            margin: { t: 40, b: 30, l: 30, r: 20 },
            xaxis: { showticklabels: false, zeroline: false },
            yaxis: { title: 'Change', fixedrange: true, tickformat: '.4f' },
            plot_bgcolor: '#fff',
            paper_bgcolor: '#fff',
        };

        return (
            <Plot
                data={data}
                layout={layout}
                config={{ displayModeBar: false }}
                style={{ width: '100%', height: '100%' }}
            />
        );
    };


    return (
        <div style={{ padding: '20px', maxWidth: '100%', margin: 'auto', fontFamily: 'system-ui, sans-serif', backgroundColor: '#f4f7f9', minHeight: '100vh' }}>
            
            <style>
                {`
                .metric-box {
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                }
                .flash-up {
                    background-color: #e6ffed !important; /* Light Green */
                }
                .flash-down {
                    background-color: #ffe6e6 !important; /* Light Red */
                }
                /* This ensures the Plotly containers use the full height of the parent grid item */
                .js-plotly-plot, .plot-container {
                    height: 100% !important;
                    width: 100% !important;
                }
                `}
            </style>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: '15px 20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                <h1 style={{ margin: 0, fontSize: '2em', fontWeight: '700', color: '#333' }}>Quant Trader Analytics Dashboard</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1em', fontWeight: '600', color: '#333' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: wsStatus.dot.split('-')[1] }}></span>
                    WS Status: <span style={{ color: wsStatus.color.split('-')[1] }}>{wsStatus.status}</span>
                </div>
            </div>
            
            <hr style={{ borderTop: '1px solid #eee', marginTop: '10px', marginBottom: '30px' }}/>
            
            {/* --- HEADER BAR WITH WIDGETS --- */}
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', borderRadius: '8px', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                {/* 1. Alert Status */}
                <AlertIndicator zScore={analytics.z_score} />
                
                {/* 2. Timeframe Selector (Restored) */}
                <TimeframeSelector selected={timeframe} onSelect={setTimeframe} />
                
                {/* 3. Data Export Widget */}
                <DataDownloadButton />
            </div>


            {/* --- LIVE METRICS CARDS --- */}
            <div className="stats-card" style={{ 
                display: 'flex', 
                gap: '20px', 
                marginBottom: '40px', 
                padding: '15px', 
                border: '1px solid #ddd', 
                borderRadius: '8px',
                backgroundColor: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}>
                <StatBox title="Pair" value={analytics.symbol_pair} prevValue={prevAnalytics.symbol_pair} />
                <StatBox title="Hedge Ratio (β)" value={analytics.hedge_ratio} prevValue={prevAnalytics.hedge_ratio} />
                <StatBox title="Latest Spread" value={analytics.latest_spread} prevValue={prevAnalytics.latest_spread} />
                <StatBox 
                  title="Live Z-Score" 
                  value={analytics.z_score} 
                  color={Math.abs(parseFloat(analytics.z_score)) > 2 ? '#ef4444' : '#10b981'} 
                  prevValue={prevAnalytics.z_score}
                />
            </div>

            {/* --- MAIN VISUALIZATION AREA: PIE CHART + HISTOGRAM --- */}
            {/* Height set using calc(100vh - header/metrics area) for full vertical usage */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '20px', 
                marginBottom: '40px',
                height: 'calc(100vh - 360px)', /* Adjusted height for full vertical fill */
              }}>
                {/* LEFT COLUMN: PIE CHART */}
                <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '20px', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', height: '100%' }}>
                    {renderPieChart()}
                </div>

                {/* RIGHT COLUMN: SUPPLEMENTARY CHARTS (BETA STABILITY + VELOCITY) */}
                <div style={{ 
                    display: 'grid', 
                    gridTemplateRows: '1fr 1fr', 
                    gap: '20px', 
                    height: '100%',
                }}>
                    <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '10px', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', height: '100%' }}>
                        {renderHedgeRatioChart()}
                    </div>
                    <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '10px', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', height: '100%' }}>
                        {renderSpreadVelocityChart()}
                    </div>
                </div>
            </div>
            
            <footer style={{ marginTop: '40px', textAlign: 'center', fontSize: '0.8em', color: '#999' }}>
                <p>Data Source: Binance Futures WebSocket | Analytics: Real-Time OLS Z-Score Model</p>
            </footer>

        </div>
    );
}

export default App;
