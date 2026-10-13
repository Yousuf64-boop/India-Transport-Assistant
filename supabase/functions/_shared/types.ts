export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantResult {
  response: string;
  /** Which engine produced the answer. */
  source: 'agent' | 'rules';
  /** Names of the tools that were invoked (for observability / UI badges). */
  toolsUsed: string[];
}

export class UserFacingError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = 'UserFacingError';
  }
}
