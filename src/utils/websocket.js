import { useState, useEffect, useRef, useCallback } from 'react';

export function useWebSocket() {
  const [ws, setWs] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0); // Track reconnections for data refresh
  const reconnectTimeoutRef = useRef(null);
  const hasConnectedOnceRef = useRef(false); // Track if we've connected at least once

  const connect = useCallback(async () => {
    try {
      const isPlatform = import.meta.env.VITE_IS_PLATFORM === 'true';

      // Construct WebSocket URL
      let wsUrl;

      if (isPlatform) {
        // Platform mode: Use same domain as the page (goes through proxy)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/ws`;
      } else {
        // OSS mode: Connect to same host:port that served the page
        const token = localStorage.getItem('auth-token');
        if (!token) {
          console.warn('No authentication token found for WebSocket connection');
          return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
      }

      const websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        console.log('[WebSocket] Connected');
        setIsConnected(true);
        setWs(websocket);

        // If this is a reconnection (not the initial connection), increment counter
        // This signals to consuming components that data should be refreshed
        if (hasConnectedOnceRef.current) {
          console.log('[WebSocket] Reconnected - triggering data refresh');
          setReconnectCount(prev => prev + 1);
        }
        hasConnectedOnceRef.current = true;
      };

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setMessages(prev => [...prev, data]);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      websocket.onclose = (event) => {
        console.log('[WebSocket] Disconnected, code:', event.code);
        setIsConnected(false);
        setWs(null);

        // Attempt to reconnect after 3 seconds (unless it was a clean close)
        if (event.code !== 1000) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[WebSocket] Attempting to reconnect...');
            connect();
          }, 3000);
        }
      };

      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  const sendMessage = useCallback((message) => {
    if (ws && isConnected) {
      ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected');
    }
  }, [ws, isConnected]);

  return {
    ws,
    sendMessage,
    messages,
    isConnected,
    reconnectCount // Exposed for components to trigger data refresh on reconnection
  };
}
