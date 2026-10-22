import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';

export type ConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'disconnected';

export interface WebSocketEventMessage {
  event: string;
  channel: string;
  timestamp: string;
  data: any;
}

interface WebSocketContextType {
  status: ConnectionStatus;
  subscribe: (channel: string) => void;
  unsubscribe: (channel: string) => void;
  addListener: (eventType: string, callback: (data: any) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, user } = useAuth();
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const listenersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());
  const subscribedChannelsRef = useRef<Set<string>>(new Set());

  const addListener = useCallback((eventType: string, callback: (data: any) => void) => {
    if (!listenersRef.current.has(eventType)) {
      listenersRef.current.set(eventType, new Set());
    }
    listenersRef.current.get(eventType)!.add(callback);

    return () => {
      listenersRef.current.get(eventType)?.delete(callback);
    };
  }, []);

  const subscribe = useCallback((channel: string) => {
    subscribedChannelsRef.current.add(channel);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'subscribe', channel }));
    }
  }, []);

  const unsubscribe = useCallback((channel: string) => {
    subscribedChannelsRef.current.delete(channel);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'unsubscribe', channel }));
    }
  }, []);

  const connect = useCallback(() => {
    if (!token) return;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const host = window.location.host;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use relative path if proxied, or point to backend
    const wsUrl = import.meta.env.VITE_API_BASE_URL
      ? `${import.meta.env.VITE_API_BASE_URL.replace(/^http/, 'ws')}/ws?token=${token}`
      : `${protocol}//${host}/ws?token=${token}`;

    setStatus('connecting');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      // Resubscribe to all active channels
      subscribedChannelsRef.current.forEach((ch) => {
        ws.send(JSON.stringify({ action: 'subscribe', channel: ch }));
      });
    };

    ws.onmessage = (event) => {
      try {
        const msg: WebSocketEventMessage = JSON.parse(event.data);
        if (msg.event && listenersRef.current.has(msg.event)) {
          listenersRef.current.get(msg.event)?.forEach((cb) => cb(msg.data));
        }
        // Also wildcard listeners
        if (listenersRef.current.has('*')) {
          listenersRef.current.get('*')?.forEach((cb) => cb(msg));
        }
      } catch (err) {
        console.warn('Failed to parse WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      setStatus('reconnecting');
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = (err) => {
      console.warn('WebSocket connection error:', err);
      ws.close();
    };
  }, [token]);

  useEffect(() => {
    if (token && user) {
      connect();
    } else {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setStatus('disconnected');
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [token, user, connect]);

  return (
    <WebSocketContext.Provider value={{ status, subscribe, unsubscribe, addListener }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};
