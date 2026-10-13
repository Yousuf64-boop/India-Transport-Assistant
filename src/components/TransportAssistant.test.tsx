import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageText } from './MessageText';
import { TransportAssistant } from './TransportAssistant';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ response: 'Northern: **Good Service**', source: 'rules', toolsUsed: ['get_line_status'] }))));
  vi.stubEnv('VITE_SUPABASE_URL', 'https://x.test');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('MessageText', () => {
  it('renders bold and never interprets HTML', () => {
    const { container } = render(<MessageText text={'**Bold** and <img src=x onerror=alert(1)>'} />);
    expect(container.querySelector('strong')?.textContent).toBe('Bold');
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('TransportAssistant', () => {
  it('shows the empty state with suggestions and a disabled send button', () => {
    render(<TransportAssistant />);
    expect(screen.getByRole('heading', { name: /how can i help/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  it('fills the input from a suggestion chip', async () => {
    render(<TransportAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /by metro/i }));
    expect(screen.getByLabelText(/ask about getting around/i)).toHaveValue('Dum Dum to Esplanade by metro');
  });

  it('shows city-specific suggestions when the city changes', async () => {
    render(<TransportAssistant />);
    await userEvent.selectOptions(screen.getByLabelText(/^city$/i), 'Mumbai');
    await userEvent.click(screen.getByRole('button', { name: /local train/i }));
    expect(screen.getByLabelText(/ask about getting around/i)).toHaveValue('Bandra to Churchgate by local train');
  });

  it('shows an error bubble when the backend is not configured, and can clear the chat', async () => {
    render(<TransportAssistant />);
    await userEvent.type(screen.getByLabelText(/ask about getting around/i), 'hello');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));
    await waitFor(() => expect(within(screen.getByRole('log')).getByText(/not configured/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /clear conversation/i }));
    expect(screen.getByRole('heading', { name: /how can i help/i })).toBeInTheDocument();
  });
});
