'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type LogEntry = {
  event: string;
  data: string;
  ts: number;
};

export default function AgentDemoPage() {
  const [message, setMessage] = useState('world');
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // Clean up the EventSource if the user navigates away mid-stream.
  useEffect(() => {
    return () => esRef.current?.close();
  }, []);

  function pushLog(event: string, data: string) {
    setLogs((prev) => [...prev, { event, data, ts: Date.now() }]);
  }

  function run() {
    setLogs([]);
    setError(null);
    setRunning(true);

    const url = `/api/agent/hello/stream?message=${encodeURIComponent(message)}`;
    const es = new EventSource(url);
    esRef.current = es;

    const finish = () => {
      setRunning(false);
      es.close();
      esRef.current = null;
    };

    es.addEventListener('run.started', (e) => pushLog('run.started', e.data));
    es.addEventListener('step.completed', (e) =>
      pushLog('step.completed', e.data),
    );
    es.addEventListener('run.completed', (e) => {
      pushLog('run.completed', e.data);
      finish();
    });
    es.addEventListener('run.failed', (e) => {
      pushLog('run.failed', e.data);
      setError('Agent run failed (see log).');
      finish();
    });
    es.onerror = () => {
      // EventSource fires error on any disconnect; only treat as failure
      // if we never saw run.completed.
      if (esRef.current === es) {
        setError(
          'SSE stream closed unexpectedly. Is the agent service running on ' +
            'http://localhost:8000 ?',
        );
        finish();
      }
    };
  }

  return (
    <section className="flex-1 p-4 lg:p-8 space-y-6">
      <header>
        <h1 className="text-lg lg:text-2xl font-medium">Agent Demo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sends <code>/v1/hello/stream</code> to apps/agent via the Next.js SSE
          proxy at <code>/api/agent/hello/stream</code>. Validates the D3 end-to-end
          loop (browser → web → agent → SSE back).
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Run</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Input
              id="message"
              name="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={running}
              maxLength={500}
            />
          </div>
          <Button
            onClick={run}
            disabled={running || message.trim().length === 0}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {running ? 'Streaming…' : 'Run hello agent'}
          </Button>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Event stream</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No events yet. Click <b>Run hello agent</b> above.
            </p>
          ) : (
            <ol className="space-y-2 font-mono text-xs">
              {logs.map((log, i) => (
                <li key={i} className="border-l-2 border-orange-300 pl-3">
                  <span className="text-orange-600 font-semibold">
                    {log.event}
                  </span>{' '}
                  <span className="text-muted-foreground">
                    {new Date(log.ts).toLocaleTimeString()}
                  </span>
                  <pre className="mt-1 whitespace-pre-wrap text-gray-700">
                    {log.data}
                  </pre>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
