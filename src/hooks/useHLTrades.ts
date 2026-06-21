'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Real-time trade stream from Hyperliquid's public WebSocket API.
 *
 * Subscribes to `trades` for a given coin (e.g. "BTC", "ETH").
 * Reconnects automatically on close/error with 3s back-off.
 *
 * HL WS: wss://api.hyperliquid.xyz/ws
 * Subscribe: {"method":"subscribe","subscription":{"type":"trades","coin":"BTC"}}
 * Message:   {"channel":"trades","data":[{coin,side,px,sz,time,hash,tid}]}
 *   side: "B" = buy (long), "A" = ask (sell/short)
 */

export interface HLTrade {
  id: string;          // tid as string (used as React key)
  coin: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;        // base asset size (e.g. BTC)
  valueUsd: number;    // price * size
  time: number;        // ms timestamp
}

const MAX_DISPLAY = 300;
const HL_WS_URL = 'wss://api.hyperliquid.xyz/ws';

// HL tick data — internal raw shape
interface HLTickTrade {
  coin: string;
  side: 'B' | 'A';
  px: string;
  sz: string;
  time: number;
  hash?: string;
  tid: number;
}

interface HLMsg {
  channel: string;
  data: HLTickTrade | HLTickTrade[];
}

export function useHLTrades(coin: string) {
  const [trades, setTrades] = useState<HLTrade[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const destroyedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentCoinRef = useRef(coin);

  useEffect(() => { currentCoinRef.current = coin; }, [coin]);

  const connect = useCallback(() => {
    if (destroyedRef.current) return;

    let ws: WebSocket;
    try {
      ws = new WebSocket(HL_WS_URL);
    } catch {
      setConnected(false);
      if (!destroyedRef.current) {
        reconnectTimerRef.current = setTimeout(() => connect(), 3000);
      }
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({
        method: 'subscribe',
        subscription: { type: 'trades', coin: currentCoinRef.current },
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg: HLMsg = JSON.parse(event.data as string);
        if (msg.channel !== 'trades') return;

        const rawTrades = Array.isArray(msg.data) ? msg.data : [msg.data];
        const parsed: HLTrade[] = [];

        for (const t of rawTrades) {
          if (!t || t.coin !== currentCoinRef.current) continue;
          const price = parseFloat(t.px);
          const size = parseFloat(t.sz);
          if (!Number.isFinite(price) || !Number.isFinite(size) || price <= 0 || size <= 0) continue;
          parsed.push({
            id: String(t.tid),
            coin: t.coin,
            side: t.side === 'B' ? 'buy' : 'sell',
            price,
            size,
            valueUsd: price * size,
            time: t.time,
          });
        }

        if (parsed.length > 0) {
          setTrades(prev => [...parsed.reverse(), ...prev].slice(0, MAX_DISPLAY));
        }
      } catch { /* skip malformed */ }
    };

    ws.onclose = () => {
      setConnected(false);
      if (!destroyedRef.current) {
        reconnectTimerRef.current = setTimeout(() => connect(), 3000);
      }
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    destroyedRef.current = true;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }

    destroyedRef.current = false;
    setTrades([]);
    setConnected(false);

    connect();

    return () => {
      destroyedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    };
  }, [coin, connect]);

  return { trades, connected };
}
