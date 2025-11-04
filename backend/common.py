import asyncio

# --- Shared Configuration (Used by ingestion, processing, and analytics) ---
DEFAULT_SYMBOLS = ["btcusdt", "ethusdt"] 

# Queue for raw ticks (Ingestion -> Processing)
RAW_TICK_QUEUE = asyncio.Queue()

# NEW: Queue for latest prices (Processing -> Analytics)
LATEST_PRICE_QUEUE = asyncio.Queue()
