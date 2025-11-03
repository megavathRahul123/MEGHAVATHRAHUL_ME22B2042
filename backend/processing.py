# backend/processing.py

import pandas as pd
import asyncio
from .storage import store_resampled_bar
from .common import RAW_TICK_QUEUE, DEFAULT_SYMBOLS
# --- REMOVED: from .analytics import start_analytics_loop (Fixes the ImportError) ---


# --- Global In-Memory Store for Aggregation (Buffer) ---
TICK_BUFFER = {sym.upper(): [] for sym in DEFAULT_SYMBOLS}
LAST_BAR_TIMESTAMP = {sym.upper(): pd.Timestamp(0) for sym in DEFAULT_SYMBOLS}


async def process_incoming_ticks():
    """The core coroutine that continuously reads from the queue, aggregates ticks, and resamples bars."""
    while True:
        # 1. Get the next raw tick (this blocks until a tick is available)
        tick = await RAW_TICK_QUEUE.get()
        symbol = tick['symbol'].upper()

        # 2. Add the tick to the in-memory buffer
        TICK_BUFFER[symbol].append(tick)

        # 3. Check if we have enough data to attempt resampling (e.g., every 50 ticks)
        if len(TICK_BUFFER[symbol]) >= 50:
            # We create a new task so the main processor doesn't block
            asyncio.create_task(resample_buffer(symbol))


async def resample_buffer(symbol: str):
    """Performs the actual Pandas resampling and saves completed bars."""
    if not TICK_BUFFER[symbol]: return

    current_buffer = TICK_BUFFER[symbol].copy()
    TICK_BUFFER[symbol] = [] # Clear buffer

    df = pd.DataFrame(current_buffer)
    df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
    df = df.set_index('timestamp').sort_index()

    # --- Resample for all required timeframes (FIXED PANDAS WARNINGS) ---
    for timeframe in ["1s", "1min", "5min"]: # Use modern Pandas aliases
        
        # OHLCV aggregation
        resampled_prices = df['price'].resample(timeframe).ohlc().dropna()
        resampled_volume = df['size'].resample(timeframe).sum().fillna(0)
        bars_df = resampled_prices.join(resampled_volume.rename('volume')).dropna()

        # Check for new, completed bars to save
        for index, row in bars_df.iterrows():
            if index > LAST_BAR_TIMESTAMP[symbol]:
                
                bar_to_save = {
                    "symbol": symbol,
                    "timestamp": index.isoformat(),
                    "timeframe": timeframe.replace('min', 'm').replace('s', 's'), 
                    "open": row['open'],
                    "high": row['high'],
                    "low": row['low'],
                    "close": row['close'],
                    "volume": row['volume']
                }
                
                await store_resampled_bar(bar_to_save)
                LAST_BAR_TIMESTAMP[symbol] = index
                
                if timeframe in ["1min", "5min"]:
                    print(f"Processing: Saved {symbol} {timeframe} bar @ {index.time()} | Close: {row['close']:.2f}")