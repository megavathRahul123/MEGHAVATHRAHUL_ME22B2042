# backend/app.py

from fastapi import FastAPI
import uvicorn
import asyncio
from starlette.middleware.cors import CORSMiddleware 

# --- Import Core Modules and Utilities ---
import backend.storage as storage
from backend.ingestion import ingest_binance_data 
from backend.processing import process_incoming_ticks
from backend.analytics import start_analytics_loop 
from backend.api.websocket import router as websocket_router
from backend.api.rest import router as rest_router
from backend.common import DEFAULT_SYMBOLS 

app = FastAPI(
    title="Real-Time Quant Analytics",
    description="Backend for Binance tick data ingestion and analytics."
)

# --- 1. CORS Middleware Implementation (Security Fix) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Include API Routers
app.include_router(websocket_router)
app.include_router(rest_router)

@app.on_event("startup")
async def startup_event():
    print("Startup: Initializing core systems...")
    
    # 3. Initialize MongoDB 
    await storage.initialize_databases() 
    
    # --- CRITICAL STABILITY CHECK: Pause to allow the global state to stabilize ---
    await asyncio.sleep(0.1) 
    
    # 4. CRITICAL LAUNCH CHECK: Only launch pipelines if DB is connected
    if storage.MONGO_DB is not None:
        print("Startup: Database connection validated. Launching all data pipelines.")
        
        # Launch Ingestion (Coroutine)
        for symbol in DEFAULT_SYMBOLS:
            asyncio.create_task(ingest_binance_data(symbol))
            
        # Launch Processing and Analytics tasks (Coroutines)
        asyncio.create_task(process_incoming_ticks()) 
        asyncio.create_task(start_analytics_loop()) 
        
    else:
        print("Startup: Database connection failed. Pipelines NOT launched. Check MongoDB server.")


    print("Startup: All core systems initialized.")


@app.get("/health")
async def health_check():
    """Simple health check for the server."""
    db_status = "Connected" if storage.MONGO_DB is not None else "Unavailable"
    return {"status": "ok", "db_connection": db_status}

if __name__ == "__main__":
    # The single-command local execution requirement
    uvicorn.run(app, host="0.0.0.0", port=8000)