import { City, parseCity } from './cities.ts';
import { ChatTurn, UserFacingError } from './types.ts';

export const MAX_QUERY_LENGTH = 500;
export const MAX_HISTORY_TURNS = 8;

export interface ValidatedRequest {
  query: string;
  history: ChatTurn[];
  sessionId: string;
  city: City;
}

const SESSION_ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

/** Validates untrusted JSON from the client and returns a clean, bounded request. */
export function validateRequest(body: unknown): ValidatedRequest {
  if (typeof body !== 'object' || body === null) {
    throw new UserFacingError('Request body must be a JSON object.');
  }
  const { query, history, sessionId, city } = body as Record<string, unknown>;

  if (typeof query !== 'string' || query.trim().length === 0) {
    throw new UserFacingError('"query" is required.');
  }
  if (query.length > MAX_QUERY_LENGTH) {
    throw new UserFacingError(`"query" must be at most ${MAX_QUERY_LENGTH} characters.`);
  }

  const cleanHistory: ChatTurn[] = [];
  if (history !== undefined) {
    if (!Array.isArray(history)) throw new UserFacingError('"history" must be an array.');
    for (const turn of history.slice(-MAX_HISTORY_TURNS)) {
      if (
        typeof turn === 'object' && turn !== null &&
        ((turn as ChatTurn).role === 'user' || (turn as ChatTurn).role === 'assistant') &&
        typeof (turn as ChatTurn).content === 'string'
      ) {
        cleanHistory.push({
          role: (turn as ChatTurn).role,
          content: (turn as ChatTurn).content.slice(0, 2000),
        });
      }
    }
  }

  const sid = typeof sessionId === 'string' && SESSION_ID_RE.test(sessionId) ? sessionId : 'anonymous';

  return { query: query.trim(), history: cleanHistory, sessionId: sid, city: parseCity(city) };
}
