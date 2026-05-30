'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { WSMessage } from '@/lib/constants';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

interface UseWebSocketOptions {
  url: string;
  token: string;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  onMessage?: (msg: WSMessage) => void;
  onAgentStatus?: (online: boolean) => void;
}

export function useWebSocket({
  url,
  token,
  autoReconnect = true,
  maxReconnectAttempts = 10,
  onMessage,
  onAgentStatus,
}: UseWebSocketOptions) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [latency, setLatency] = useState(0);
  const [agentOnline, setAgentOnline] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const onMessageRef = useRef(onMessage);
  const onAgentStatusRef = useRef(onAgentStatus);

  useEffect(() => {
    onMessageRef.current = onMessage;
    onAgentStatusRef.current = onAgentStatus;
  }, [onMessage, onAgentStatus]);

  const cleanup = useCallback(() => {
    if (pingTimer.current) {
      clearInterval(pingTimer.current);
      pingTimer.current = null;
    }
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    cleanup();
    if (!url || !token) return;

    setStatus(reconnectAttempt.current > 0 ? 'reconnecting' : 'connecting');

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', role: 'client', token }));
    };

    ws.onmessage = (event) => {
      let msg: WSMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === 'auth_ok') {
        reconnectAttempt.current = 0;
        setStatus('connected');
        pingTimer.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
          }
        }, 5000);
        return;
      }

      if (msg.type === 'auth_error') {
        setStatus('disconnected');
        ws.close();
        return;
      }

      if (msg.type === 'pong') {
        setLatency(Math.max(0, Date.now() - msg.timestamp));
        return;
      }

      if (msg.type === 'agent_status') {
        setAgentOnline(msg.online);
        onAgentStatusRef.current?.(msg.online);
        return;
      }

      onMessageRef.current?.(msg);
    };

    ws.onclose = () => {
      setStatus('disconnected');
      if (pingTimer.current) {
        clearInterval(pingTimer.current);
        pingTimer.current = null;
      }

      if (autoReconnect && mountedRef.current && reconnectAttempt.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempt.current), 30000);
        reconnectAttempt.current += 1;
        setStatus('reconnecting');
        reconnectTimer.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [url, token, autoReconnect, maxReconnectAttempts, cleanup]);

  const disconnect = useCallback(() => {
    reconnectAttempt.current = maxReconnectAttempts;
    cleanup();
    setStatus('disconnected');
    setAgentOnline(false);
  }, [cleanup, maxReconnectAttempts]);

  const send = useCallback((payload: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const sendCommand = useCallback(
    (action: string, params: Record<string, unknown> = {}) => {
      return send({ type: 'command', action, ...params });
    },
    [send],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  return {
    status,
    latency,
    agentOnline,
    connect,
    disconnect,
    send,
    sendCommand,
    reconnectAttempt: reconnectAttempt.current,
  };
}
