import { config } from './config';
import { getSessionId } from './session';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantReply {
  response: string;
  source: 'agent' | 'rules';
  toolsUsed: string[];
}

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function askAssistant(
  query: string,
  history: ChatTurn[],
  city: string,
  signal?: AbortSignal,
  endpoint: { url: string; anonKey: string } = { url: config.functionUrl, anonKey: config.anonKey },
): Promise<AssistantReply> {
  if (!endpoint.url) {
    throw new ApiError('App is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  let res: Response;
  try {
    res = await fetch(endpoint.url, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${endpoint.anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, history, city, sessionId: getSessionId() }),
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError('Network error. Check your connection and try again.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      typeof data.error === 'string' ? data.error : 'The assistant is unavailable right now.',
      res.status,
    );
  }
  return data as AssistantReply;
}
