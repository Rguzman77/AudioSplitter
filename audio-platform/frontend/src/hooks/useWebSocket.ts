import { useEffect, useRef } from "react";

interface WsMessage {
  status: string;
  progress: number;
  bpm?: number;
  stems?: Record<string, string>;
  error_message?: string;
}

export function useJobWebSocket(
  jobId: string | undefined,
  onMessage: (msg: WsMessage) => void,
  active = true
) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!jobId || !active) return;

    const wsUrl = `ws://${window.location.host}/api/v1/jobs/${jobId}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as WsMessage;
        onMessage(data);
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [jobId, active]); // eslint-disable-line react-hooks/exhaustive-deps
}
