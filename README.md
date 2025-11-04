
 # Real-Time Quant Analytics Dashboard

# part 1:Project Overview and Objective
This application implements a Real-Time Statistical Arbitrage Dashboard designed to meet the requirements of the Quant Developer Evaluation Assignment. It demonstrates an end-to-end full-stack system capable of ingesting live market data, processing it, computing advanced statistical signals (Hedge Ratio, Z-Score), and visualizing them through an interactive interface.


# part 2 :Technical Architecture & Data Flow 🏗️
 
.The system uses a stable, modular, asynchronous Python core to handle all data logic.

.Platform Stack: FastAPI (Python) Backend, MongoDB for persistence, and React.js + Plotly for the Frontend.

.Data Ingestion (Source): The backend maintains a persistent WebSocket connection to Binance Futures to stream raw tick data (price/volume).

.Data Buffering (In-Memory): The application uses an asyncio.Queue to buffer and synchronize high-volume incoming ticks between ingestion and processing tasks, ensuring stability.

.Data Processing: Ticks are continuously aggregated using Pandas into structured 1-minute (1m) and 5-minute (5m) OHLC bars, which are then saved to MongoDB.

.Real-Time API: The FastAPI WebSockets are used to instantly push live calculated metrics to the React dashboard (Port 5173).



# part 3. Quantitative Analytics and Signals 📈
The core logic focuses on generating mean-reversion signals for the BTC/ETH pair:Hedge Ratio ($\beta$): Calculated via OLS Regression on the rolling price history. This is the risk-neutral sizing ratio required to eliminate general market exposure and isolate the risk solely to the spread.Live Z-Score: The primary trading signal. It measures how many standard deviations the current spread is away from its historical mean.Signal Rule: A value outside of $\pm 2.0$ indicates the spread is statistically overstretched and signals a high-probability mean-reversion trade entry.Visualization: Plotly charts offer required interactivity (zoom, pan, hover) for detailed analysis.

4. Setup and Local Execution Guide (Runnable App)
The entire system is launched using two synchronized commands.

Prerequisites: MongoDB Server must be running on localhost:27017.

Execution:

Start Backend (FastAPI): (Keep this running in one terminal)

Bash

(venv) python -m uvicorn backend.app:app --host 0.0.0.0 --port 8000

Start Frontend (React): (Run this in a separate terminal in the frontend folder)

Bash

npm run dev
View App: Navigate to http://localhost:5173/.


# step 5 AI Usage Transparency 🤖

AI assistance (Gemini) was used to establish the modular Python package structure, confirm asynchronous concurrency patterns, and comprehensively troubleshoot final environment and structural errors (including resolving the circular import logic and the FastAPI/React CORS configuration).


# step 6 1. conclusion ⏳ 
<img width="1029" height="484" alt="result1" src="https://github.com/user-attachments/assets/6bde7f64-0d07-436f-9e82-6f95154f4a38" />

<img width="1023" height="896" alt="result2" src="https://github.com/user-attachments/assets/d1bef842-decd-4202-ae9d-9932af609b6f" />



7
⚙️ Technology Stack and DependenciesYour application uses a robust, full-stack architecture built on two separate language environments:A. Python Backend (Compute & Data Engine)This layer runs the analysis and data streams (MANDATORY).PackagePurpose in the ProjectFastAPI/UvicornThe Python framework and ASGI server that hosts the REST API and manages all asynchronous tasks (WebSockets, ingestion, processing).websocketsUsed by the ingestion pipeline to maintain the live connection to the Binance Futures market data feed.pandas / numpyThe core libraries used in processing.py to aggregate raw ticks into 1m/5m OHLC bars and in analytics.py for all data manipulation.statsmodelsUsed in analytics.py to perform the heavy lifting: OLS Regression (to find the Hedge Ratio) and statistical measures (Z-Score, standard deviation).motorThe asynchronous Python driver necessary for the FastAPI application to efficiently communicate with MongoDB without blocking the main event loop.B. React Frontend (Visualization & Display)This layer handles the user experience.PackagePurpose in the ProjectReact / ViteThe framework used to build the responsive, single-page dashboard application.react-plotly.jsThe core library for visualization, rendering complex candlestick charts and fulfilling the requirement for zoom, pan, and hover interactivity.use-websocketThe custom hook logic that maintains the continuous, low-latency WebSocket connection to the FastAPI server on port 8000 to receive live Z-Score updates.

# 8 flow cahrt & achitecture diagram
flowchart TD

A[Market Data Source (Binance Futures)] -->|Live Tick Stream (Price/Volume)| B[Backend Ingestion Layer (FastAPI + WebSocket)]
B -->|Async Queue Buffer| C[Data Buffering (asyncio.Queue)]
C -->|Tick Aggregation| D[Data Processing (Pandas)]
D -->|1m & 5m OHLC Bars| E[MongoDB Storage]

E -->|Historical Data Access| F[Analytics Engine (statsmodels + numpy + pandas)]
F -->|Calculates Hedge Ratio (β) & Z-Score| G[Signal Generator]

G -->|Live Signal Data (Z-Score, Ratio)| H[FastAPI WebSocket Stream]
H -->|Push Updates| I[React Frontend (Plotly Dashboard)]

I -->|User Interaction| J[Visualization (Zoom, Pan, Hover)]

subgraph Backend
B
C
D
E
F
G
H
end

subgraph Frontend
I
J
end
# Note: This diagram illustrates the end-to-end data flow from live market data ingestion to real-time visualization on the dashboard, highlighting the modular components and their interactions.
