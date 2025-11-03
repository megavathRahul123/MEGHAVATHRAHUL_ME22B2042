# backend/api/rest.py

from fastapi import APIRouter, HTTPException, Query
from typing import List
import json
# FIX: Import the entire storage module as an alias
import backend.storage as storage

router = APIRouter()

@router.get("/api/historical-data", response_model=List[dict])
async def get_historical_data(
    symbol: str = Query(..., description="The trading symbol (e.g., BTCUSDT)"),
    timeframe: str = Query(..., description="The bar timeframe (e.g., 1m, 5m)"),
    limit: int = Query(500, description="The maximum number of bars to return")
):
    """
    Fetches the latest resampled historical OHLCV data from MongoDB.
    """
    # CRITICAL: Check the global state through the imported module object
    if storage.MONGO_DB is None:
        raise HTTPException(status_code=503, detail="Database connection not available")

    # Access the MONGO_DB object via the imported module alias
    collection = storage.MONGO_DB['resampled_bars']
    
    cursor = collection.find(
        {"symbol": symbol.upper(), "timeframe": timeframe.lower()},
        {"_id": 0} 
    ).sort("timestamp", -1).limit(limit)
    
    data = await cursor.to_list(length=limit)
    data.reverse()

    if not data:
        return []
        
    return data