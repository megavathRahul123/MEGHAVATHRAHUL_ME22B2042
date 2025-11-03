# backend/analytics.py

import pandas as pd
import numpy as np
from statsmodels.api import OLS, add_constant
import asyncio
import json
# FIX: Import the entire storage module as an alias
import backend.storage as storage
# Import from nested API module
from .api.websocket import broadcast_live_data 

# --- Configuration ---
PAIR_SYMBOLS = ["BTCUSDT", "ETHUSDT"]
TIMEFRAME = "1m" 
ROLLING_WINDOW = 20 # Using 20 for quick testing

async def fetch_historical_bars(symbol: str, timeframe: str, limit: int = ROLLING_WINDOW):
    """Fetches the latest completed bars from MongoDB for analytics."""
    # Check the global state through the imported module object
    if storage.MONGO_DB is None: return pd.DataFrame()

    # Access the MONGO_DB object via the imported module alias
    cursor = storage.MONGO_DB['resampled_bars'].find(
        {"symbol": symbol, "timeframe": timeframe},
        {"_id": 0, "timestamp": 1, "close": 1}
    ).sort("timestamp", -1).limit(limit)
    
    data = await cursor.to_list(length=limit)
    # ... (rest of the function remains the same) ...
    df = pd.DataFrame(data)
    
    if df.empty: return pd.DataFrame()
    
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.set_index('timestamp').sort_index()
    
    return df['close'].rename(symbol) 
# ... (rest of the file remains the same) ...import asyncio
import json
import logging

import numpy as np
import pandas as pd
import statsmodels.api as sm

import backend.storage as storage
from backend.api.websocket import broadcast_live_data

log = logging.getLogger("analytics")
log.setLevel(logging.INFO)


# --- Configuration ---
PAIR_SYMBOLS = ["BTCUSDT", "ETHUSDT"]
TIMEFRAME = "1m"
ROLLING_WINDOW = 20       # number of bars required before analytics runs
SLEEP_SECONDS = 1         # main analytics loop interval
RECONNECT_SLEEP = 5       # wait when not enough data


async def fetch_historical_bars(symbol: str, timeframe: str, limit: int = ROLLING_WINDOW) -> pd.Series:
    """
    Fetch latest completed bars from MongoDB and return a pd.Series of closes indexed by timestamp.
    Returns an empty Series if DB is not ready or no usable data found.
    """
    if storage.MONGO_DB is None:
        log.debug("fetch_historical_bars: storage.MONGO_DB is None")
        return pd.Series(dtype=float, name=symbol)

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
    if "timestamp" not in df.columns or "close" not in df.columns:
        return pd.Series(dtype=float, name=symbol)

    # Try common timestamp formats (ms since epoch or ISO)
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", errors="coerce")
    if df["timestamp"].isna().all():
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")

    df = df.dropna(subset=["timestamp", "close"])
    if df.empty:
        return pd.Series(dtype=float, name=symbol)

    df["close"] = pd.to_numeric(df["close"], errors="coerce")
    df = df.dropna(subset=["close"])
    if df.empty:
        return pd.Series(dtype=float, name=symbol)

    df = df.sort_values("timestamp").set_index("timestamp")
    series = df["close"].rename(symbol)
    return series


def compute_ols(x: pd.Series, y: pd.Series):
    """
    Compute OLS regression y ~ x using statmodels.
    Returns dict with slope, intercept and r2.
    Assumes x and y are aligned by index.
    """
    if x.empty or y.empty:
        return None

    # Align on timestamps, take the overlapping window
    df = pd.concat([x, y], axis=1).dropna()
    if df.shape[0] < 2:
        return None

    X = sm.add_constant(df.iloc[:, 0].values)  # x
    Y = df.iloc[:, 1].values                   # y

    try:
        model = sm.OLS(Y, X).fit()
    except Exception as e:
        log.warning("Analytics: OLS fit failed: %s", e)
        return None

    return {
        "slope": float(model.params[1]),
        "intercept": float(model.params[0]),
        "r2": float(model.rsquared),
        "n": int(model.nobs),
    }


async def start_analytics_loop():
    """Main analytics loop: waits for enough historical 1m bars, computes OLS and broadcasts results."""
    log.info("Analytics: Analytics loop initialized. Waiting for enough data...")
    await asyncio.sleep(0.1)

    while True:
        try:
            # fetch series for each symbol
            series_map = {}
            for s in PAIR_SYMBOLS:
                series_map[s] = await fetch_historical_bars(s, TIMEFRAME, limit=ROLLING_WINDOW)

            # check if all symbols have enough bars
            lengths = {s: len(series_map[s]) for s in series_map}
            if any(v < ROLLING_WINDOW for v in lengths.values()):
                log.info("Analytics: Not enough %s data to run OLS (%s/%d).", TIMEFRAME, lengths, ROLLING_WINDOW)
                await asyncio.sleep(RECONNECT_SLEEP)
                continue

            # example: compute OLS ETH ~ BTC (y ~ x)
            x = series_map[PAIR_SYMBOLS[0]]
            y = series_map[PAIR_SYMBOLS[1]]
            ols_res = compute_ols(x, y)

            payload = {
                "type": "analytics_update",
                "timeframe": TIMEFRAME,
                "window": ROLLING_WINDOW,
                "counts": lengths,
                "ols": ols_res,
            }

            try:
                # broadcast to websocket clients (assumes broadcast_live_data is async)
                await broadcast_live_data(json.dumps(payload))
            except Exception as e:
                log.debug("Analytics: broadcast failed: %s", e)

            await asyncio.sleep(SLEEP_SECONDS)

        except asyncio.CancelledError:
            log.info("Analytics: cancellation requested, stopping analytics loop.")
            break
        except Exception as e:
            log.exception("Analytics: unexpected error in analytics loop: %s", e)
            await asyncio.sleep(RECONNECT_SLEEP)

import asyncio
import json
import logging

import numpy as np
import pandas as pd
import statsmodels.api as sm

import backend.storage as storage
from backend.api.websocket import broadcast_live_data

log = logging.getLogger("analytics")
log.setLevel(logging.INFO)


# --- Configuration ---
PAIR_SYMBOLS = ["BTCUSDT", "ETHUSDT"]
TIMEFRAME = "1m"
ROLLING_WINDOW = 20       # number of bars required before analytics runs
SLEEP_SECONDS = 1         # main analytics loop interval
RECONNECT_SLEEP = 5       # wait when not enough data


async def fetch_historical_bars(symbol: str, timeframe: str, limit: int = ROLLING_WINDOW) -> pd.Series:
    """
    Fetch latest completed bars from MongoDB and return a pd.Series of closes indexed by timestamp.
    Returns an empty Series if DB is not ready or no usable data found.
    """
    if storage.MONGO_DB is None:
        log.debug("fetch_historical_bars: storage.MONGO_DB is None")
        return pd.Series(dtype=float, name=symbol)

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
    if "timestamp" not in df.columns or "close" not in df.columns:
        return pd.Series(dtype=float, name=symbol)

    # Try common timestamp formats (ms since epoch or ISO)
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", errors="coerce")
    if df["timestamp"].isna().all():
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")

    df = df.dropna(subset=["timestamp", "close"])
    if df.empty:
        return pd.Series(dtype=float, name=symbol)

    df["close"] = pd.to_numeric(df["close"], errors="coerce")
    df = df.dropna(subset=["close"])
    if df.empty:
        return pd.Series(dtype=float, name=symbol)

    df = df.sort_values("timestamp").set_index("timestamp")
    series = df["close"].rename(symbol)
    return series


def compute_ols(x: pd.Series, y: pd.Series):
    """
    Compute OLS regression y ~ x using statmodels.
    Returns dict with slope, intercept and r2.
    Assumes x and y are aligned by index.
    """
    if x.empty or y.empty:
        return None

    # Align on timestamps, take the overlapping window
    df = pd.concat([x, y], axis=1).dropna()
    if df.shape[0] < 2:
        return None

    X = sm.add_constant(df.iloc[:, 0].values)  # x
    Y = df.iloc[:, 1].values                   # y

    try:
        model = sm.OLS(Y, X).fit()
    except Exception as e:
        log.warning("Analytics: OLS fit failed: %s", e)
        return None

    return {
        "slope": float(model.params[1]),
        "intercept": float(model.params[0]),
        "r2": float(model.rsquared),
        "n": int(model.nobs),
    }


async def start_analytics_loop():
    """Main analytics loop: waits for enough historical 1m bars, computes OLS and broadcasts results."""
    log.info("Analytics: Analytics loop initialized. Waiting for enough data...")
    await asyncio.sleep(0.1)

    while True:
        try:
            # fetch series for each symbol
            series_map = {}
            for s in PAIR_SYMBOLS:
                series_map[s] = await fetch_historical_bars(s, TIMEFRAME, limit=ROLLING_WINDOW)

            # check if all symbols have enough bars
            lengths = {s: len(series_map[s]) for s in series_map}
            if any(v < ROLLING_WINDOW for v in lengths.values()):
                log.info("Analytics: Not enough %s data to run OLS (%s/%d).", TIMEFRAME, lengths, ROLLING_WINDOW)
                await asyncio.sleep(RECONNECT_SLEEP)
                continue

            # example: compute OLS ETH ~ BTC (y ~ x)
            x = series_map[PAIR_SYMBOLS[0]]
            y = series_map[PAIR_SYMBOLS[1]]
            ols_res = compute_ols(x, y)

            payload = {
                "type": "analytics_update",
                "timeframe": TIMEFRAME,
                "window": ROLLING_WINDOW,
                "counts": lengths,
                "ols": ols_res,
            }

            try:
                # broadcast to websocket clients (assumes broadcast_live_data is async)
                await broadcast_live_data(json.dumps(payload))
            except Exception as e:
                log.debug("Analytics: broadcast failed: %s", e)

            await asyncio.sleep(SLEEP_SECONDS)

        except asyncio.CancelledError:
            log.info("Analytics: cancellation requested, stopping analytics loop.")
            break
        except Exception as e:
            log.exception("Analytics: unexpected error in analytics loop: %s", e)
            await asyncio.sleep(RECONNECT_SLEEP)