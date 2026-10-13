import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, askAssistant } from '../lib/api';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isError?: boolean;
  toolsUsed?: string[];
}

const HISTORY_TURNS = 8;

export function useChat(city: string, ask: typeof askAssistant = askAssistant) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      const query = text.trim();
      if (!query || isLoading) return;

      const history = messagesRef.current
        .filter((m) => !m.isError)
        .slice(-HISTORY_TURNS)
        .map(({ role, content }) => ({ role, content }));

      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', content: query, timestamp: new Date() },
      ]);
      setIsLoading(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const reply = await ask(query, history, city, controller.signal);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: reply.response,
            timestamp: new Date(),
            toolsUsed: reply.toolsUsed,
          },
        ]);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        const content =
          err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'assistant', content, timestamp: new Date(), isError: true },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [ask, city, isLoading],
  );

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setIsLoading(false);
  }, []);

  return { messages, isLoading, send, clear };
}
