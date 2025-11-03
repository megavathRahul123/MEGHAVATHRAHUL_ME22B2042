# backend/ingestion.py

import asyncio
import json
import websockets
# Import shared queue and symbols from the new common file
from .common import RAW_TICK_QUEUE, DEFAULT_SYMBOLS 

# --- Configuration ---
BASE_BINANCE_WS_URL = "wss://fstream.binance.com/ws/"
# Removed: DEFAULT_SYMBOLS 

async def ingest_binance_data(symbol: str):
    """Establishes a WebSocket connection and puts raw ticks into the queue."""
    url = f"{BASE_BINANCE_WS_URL}{symbol.lower()}@trade"
    print(f"Ingestion: Attempting to connect to Binance WS for {symbol}...")

    while True:
        try:
            async with websockets.connect(url, ping_interval=30, ping_timeout=10) as websocket:
                print(f"Ingestion: Connection successful for {symbol}.")
                
                while True:
                    raw_message = await websocket.recv()
                    tick_data = json.loads(raw_message)

                    if tick_data.get('e') == 'trade':
                        
                        normalized_tick = {
                            "symbol": tick_data.get('s'),
                            "timestamp": tick_data.get('E'),
                            "price": float(tick_data.get('p')),
                            "size": float(tick_data.get('q'))
                        }
                        
                        # Pipeline to Queue
                        await RAW_TICK_QUEUE.put(normalized_tick)

        except websockets.exceptions.ConnectionClosedOK:
            print(f"Ingestion: WS for {symbol} closed gracefully. Reconnecting in 5s...")
        except Exception as e:
            print(f"Ingestion: Error for {symbol}: {e}. Reconnecting in 10s...")
            
        await asyncio.sleep(5) 

# Removed the non-async start_ingestion_pipeline wrapper function