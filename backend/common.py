# backend/common.py

import asyncio

# --- Shared Configuration (Used by ingestion, processing, and analytics) ---
DEFAULT_SYMBOLS = ["btcusdt", "ethusdt"] 

# --- Shared Resources (The In-Memory Queue) ---
RAW_TICK_QUEUE = asyncio.Queue()