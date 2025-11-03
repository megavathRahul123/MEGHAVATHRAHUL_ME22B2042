# backend/api/websocket.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List

# List to hold all active WebSocket connections (clients)
active_connections: List[WebSocket] = []

router = APIRouter()

@router.websocket("/ws/live-analytics")
async def websocket_endpoint(websocket: WebSocket):
    """
    Handles WebSocket connections from the React frontend.
    """
    # 1. Accept the connection immediately (Crucial for successful handshake)
    await websocket.accept() 
    
    active_connections.append(websocket)
    print(f"WebSocket: New client connected. Total clients: {len(active_connections)}")
    
    try:
        # 2. Keep the connection open by continuously listening
        # We don't expect the client to send data, but this loop prevents the function from ending.
        while True:
            # We listen for any incoming message (pings, control commands, etc.)
            await websocket.receive_text() 
            
    except WebSocketDisconnect:
        # 3. Handle disconnection gracefully
        active_connections.remove(websocket)
        print(f"WebSocket: Client disconnected. Total clients: {len(active_connections)}")
    except Exception as e:
        print(f"WebSocket Error (Client-side issue): {e}")
        # Clean up connection list if an unexpected error occurs
        if websocket in active_connections:
            active_connections.remove(websocket)
            
async def broadcast_live_data(message: str):
    """
    Pushes data (JSON string of analytics results) to all connected clients.
    This function is called by the analytics calculation loop in backend/analytics.py.
    """
    disconnected_clients = []
    
    for connection in active_connections:
        try:
            # Send the message string
            await connection.send_text(message)
        except Exception:
            # Mark clients that failed to send for removal
            disconnected_clients.append(connection)

    # Remove disconnected clients after the loop finishes
    for client in disconnected_clients:
        if client in active_connections:
            active_connections.remove(client)