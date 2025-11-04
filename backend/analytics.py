# backend/analytics.py

import asyncio
import json
import logging
import numpy as np
import pandas as pd
import statsmodels.api as sm

import backend.storage as storage
from backend.common import LATEST_PRICE_QUEUE 
from backend.api.websocket import broadcast_live_data 

log = logging.getLogger("analytics")
log.setLevel(logging.INFO)

# --- Configuration ---
PAIR_SYMBOLS = ["BTCUSDT", "ETHUSDT"]
TIMEFRAME = "1m"
ROLLING_WINDOW = 5       
RECONNECT_SLEEP = 5      
PRICE_CACHE = {sym: None for sym in PAIR_SYMBOLS} 

# --- MOCK VALUES FOR INSTANT START ---
# These are used for the first ~5 minutes until real OLS stats are calculated.
MOCK_BASE_STATS = {
    "slope": 16.5,          # Mock Hedge Ratio (beta)
    "intercept": -140000.0, # Mock Intercept (alpha)
    "spread_mean": 0.0,     # Assume zero mean spread for simplicity
    "spread_std": 500.0,    # Mock Standard Deviation (required to avoid division by zero)
}


async def fetch_historical_bars(symbol: str, timeframe: str, limit: int = ROLLING_WINDOW) -> pd.Series:
    """Fetches the latest completed bars from MongoDB."""
    if storage.MONGO_DB is None:
        log.debug("fetch_historical_bars: storage.MONGO_DB is None")
        return pd.Series(dtype=float, name=symbol)
    # ... (Database fetching and pandas conversion logic remains the same) ...

    try:
        cursor = storage.MONGO_DB["resampled_bars"].find(
            {"symbol": symbol, "timeframe": timeframe},
            {"_id": 0, "timestamp": 1, "close": 1},
        ).sort("timestamp", -1).limit(limit)

        data = await cursor.to_list(length=limit)
    except Exception as e:
        log.warning("Analytics: DB read error for %s %s: %s", symbol, timeframe, e)
        return pd.Series(dtype=float, name=symbol)

    if not data:
        return pd.Series(dtype=float, name=symbol)

    df = pd.DataFrame(data)
    
    # Robust Timestamp and Data Conversion
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df = df.dropna(subset=["timestamp", "close"])
    df["close"] = pd.to_numeric(df["close"], errors="coerce")
    df = df.dropna(subset=["close"])
    
    if df.empty:
        return pd.Series(dtype=float, name=symbol)

    df = df.sort_values("timestamp").set_index("timestamp")
    series = df["close"].rename(symbol)
    return series


def compute_ols(x: pd.Series, y: pd.Series):
    """
    Compute OLS regression y ~ x (ETH ~ BTC) to find the hedge ratio (beta) 
    and historical spread statistics (mean and std dev).
    """
    if x.empty or y.empty: return None

    df = pd.concat([x, y], axis=1).dropna()
    if df.shape[0] < 2: return None

    X_train = sm.add_constant(df.iloc[:, 0].values)
    Y_train = df.iloc[:, 1].values

    try:
        model = sm.OLS(Y_train, X_train).fit()
    except Exception as e:
        log.warning("Analytics: OLS fit failed: %s", e)
        return None

    alpha = model.params[0]
    beta = model.params[1]
    
    # Calculate the historical spread: Spread = Y - (Alpha + Beta * X)
    spread = df.iloc[:, 1] - (alpha + beta * df.iloc[:, 0]) 
    
    # Spread statistics
    spread_mean = spread.mean()
    spread_std = spread.std()
    
    return {
        "slope": float(beta),
        "intercept": float(alpha),
        "spread_mean": float(spread_mean),
        "spread_std": float(spread_std),
    }


async def start_analytics_loop():
    """
    Main analytics loop. Uses MOCK data instantly, then switches to real OLS stats
    once enough historical data is collected.
    """
    log.info("Analytics: Real-time loop initialized. Waiting for prices...")
    
    # --- PHASE 1: PRIMING or USING MOCK STATS ---
    base_stats = MOCK_BASE_STATS
    
    # Run the initial OLS calculation once to get real stats
    x_hist = await fetch_historical_bars(PAIR_SYMBOLS[0], TIMEFRAME, limit=ROLLING_WINDOW)
    y_hist = await fetch_historical_bars(PAIR_SYMBOLS[1], TIMEFRAME, limit=ROLLING_WINDOW)
    real_stats = compute_ols(x_hist, y_hist)
    
    # If real stats are available on startup (e.g., if you already had data in DB), use them
    if real_stats:
        base_stats = real_stats
        log.info("Analytics: Found historical data on startup. Using real OLS stats.")
    else:
        log.warning("Analytics: Not enough historical data. Using MOCK stats for instant display.")

    # --- PHASE 2: REAL-TIME TICK PROCESSING ---
    while True:
        # Check if we need to update our base stats (after initial mock period)
        if base_stats == MOCK_BASE_STATS:
            x_hist = await fetch_historical_bars(PAIR_SYMBOLS[0], TIMEFRAME, limit=ROLLING_WINDOW)
            y_hist = await fetch_historical_bars(PAIR_SYMBOLS[1], TIMEFRAME, limit=ROLLING_WINDOW)
            real_stats_check = compute_ols(x_hist, y_hist)
            if real_stats_check:
                base_stats = real_stats_check
                log.info("Analytics: Priming complete. Switched from MOCK to REAL OLS stats!")
        
        
        # 1. Collect the latest price tick(s)
        ticks = []
        try:
            # Drain the queue to ensure we only get the latest price available
            while True:
                ticks.append(LATEST_PRICE_QUEUE.get_nowait())
        except asyncio.QueueEmpty:
            pass
            
        # 2. Update the price cache
        if ticks:
            last_tick = ticks[-1]
            PRICE_CACHE[last_tick['symbol'].upper()] = last_tick['price']

        # 3. Check for prices on both assets
        price_x = PRICE_CACHE[PAIR_SYMBOLS[0]]
        price_y = PRICE_CACHE[PAIR_SYMBOLS[1]]
        
        if price_x is None or price_y is None:
            await asyncio.sleep(0.1)
            continue

        # --- Real-Time Z-Score Calculation ---
        alpha = base_stats['intercept']
        beta = base_stats['slope']
        spread_mean = base_stats['spread_mean']
        spread_std = base_stats['spread_std']
        
        # Calculate latest spread using the real-time prices
        latest_spread = price_y - (alpha + beta * price_x)
        
        # Calculate real-time Z-score: Z = (Spread - Mean) / StdDev
        z_score = (latest_spread - spread_mean) / spread_std if spread_std != 0 else 0.0
        
        # 4. Prepare and Broadcast Payload (Matching Frontend Fields)
        payload = {
            "type": "analytics_update",
            "z_score": float(z_score),           
            "hedge_ratio": float(beta),         
            "latest_spread": float(latest_spread), 
            "symbol_pair": f"{PAIR_SYMBOLS[1]} / {PAIR_SYMBOLS[0]}", 
            "timestamp": pd.Timestamp.now().isoformat(),
        }

        # Broadcast instantly
        try:
            await broadcast_live_data(json.dumps(payload))
        except Exception:
            pass 
        
        # Small sleep to prevent tight loop burning CPU
        await asyncio.sleep(0.01)
