# backend/storage.py

from motor.motor_asyncio import AsyncIOMotorClient 

# Global connection instances
MONGO_DB = None

# --- Configuration ---
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "quant_data"

async def initialize_databases():
    """Initializes ONLY the MongoDB connection."""
    global MONGO_DB

    try:
        mongo_client = AsyncIOMotorClient(MONGO_URL)
        await mongo_client.admin.command('ping') 
        MONGO_DB = mongo_client[DB_NAME]
        print("Storage: Successfully connected to MongoDB database: quant_data.")
        
        await MONGO_DB['resampled_bars'].create_index([("symbol", 1), ("timestamp", 1), ("timeframe", 1)], unique=True)
    
    except Exception as e:
        # Crucial: If connection fails, MONGO_DB remains None, and an error is logged.
        print(f"Storage: ERROR - Could not connect to MongoDB: {e}.")


async def store_resampled_bar(bar_data: dict):
    """Saves a fully resampled bar (e.g., 1-minute OHLCV) to MongoDB."""
    # Access the global object directly
    if MONGO_DB is None: return
    collection = MONGO_DB['resampled_bars']
    await collection.update_one(
        {
            "symbol": bar_data['symbol'],
            "timestamp": bar_data['timestamp'],
            "timeframe": bar_data['timeframe']
        },
        {"$set": bar_data},
        upsert=True
    )