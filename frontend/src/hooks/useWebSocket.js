import { useState, useEffect, useRef, useCallback } from "react";

/**
 * A robust reconnecting WebSocket React hook.
 * - Returns latest parsed JSON data (or raw string if parsing fails)
 * - Auto reconnects every RECONNECT_MS on close/error
 * - Supports optional URL override
 */

const DEFAULT_BACKEND_PORT = "8000";
const DEFAULT_PATH = "/ws/live-analytics";
const RECONNECT_MS = 5000;

const buildDefaultUrl = () => {
  try {
    if (typeof window !== "undefined") {
      if (window.__WS_URL__) return window.__WS_URL__;
      const port = window.__WS_PORT__ || DEFAULT_BACKEND_PORT;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.hostname || "localhost";
      return `${proto}//${host}:${port}${DEFAULT_PATH}`;
    }
  } catch (err) {
    console.error("Error building default WS URL:", err);
  }
  return `ws://localhost:${DEFAULT_BACKEND_PORT}${DEFAULT_PATH}`;
};

export const useWebSocket = (urlOverride) => {
  const [liveData, setLiveData] = useState(null);

  const shouldConnectRef = useRef(true);
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  // --- Get final URL ---
  const getUrl = useCallback(() => {
    if (typeof urlOverride === "string" && urlOverride.length) return urlOverride;
    return buildDefaultUrl();
  }, [urlOverride]);

  // --- Cleanup existing socket ---
  const cleanupSocket = useCallback(() => {
    try {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;

        if (
          wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING
        ) {
          wsRef.current.close(1000, "cleanup");
        }
      }
    } catch (e) {
      console.error("WebSocket cleanup error:", e);
    } finally {
      wsRef.current = null;
    }
  }, []);

  // --- Reconnect scheduler (defined before use) ---
  const connectRef = useRef(null); // to avoid circular closure
  const scheduleReconnect = useCallback(() => {
    if (!shouldConnectRef.current) return;
    if (reconnectTimerRef.current) return;

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (connectRef.current) connectRef.current(); // safe call
    }, RECONNECT_MS);
  }, []);

  // --- Connect function ---
  const connect = useCallback(() => {
    if (!shouldConnectRef.current) return;

    // avoid duplicate connection
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const url = getUrl();
    console.info("WebSocket: connecting to", url);

    try {
      wsRef.current = new WebSocket(url);
    } catch (err) {
      console.error("WebSocket constructor failed:", err);
      scheduleReconnect();
      return;
    }

    wsRef.current.onopen = () => {
      console.info("WebSocket: connection open", url);
    };

    wsRef.current.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        setLiveData(parsed);
      } catch {
        setLiveData(event.data);
      }
    };

    wsRef.current.onerror = (event) => {
      console.error("WebSocket error:", event);
      try {
        wsRef.current.close();
      } catch (e) {
        console.error("WebSocket close error:", e);
      }
    };

    wsRef.current.onclose = (event) => {
      console.warn("WebSocket closed:", event);
      scheduleReconnect();
    };
  }, [getUrl, scheduleReconnect]);

  // store latest connect reference to avoid circular callback
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // --- Lifecycle management ---
  useEffect(() => {
    shouldConnectRef.current = true;
    connect();

    return () => {
      shouldConnectRef.current = false;
      cleanupSocket();
    };
  }, [connect, cleanupSocket]);

  return liveData;
};

export default useWebSocket;