// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthForm } from '@/components/auth-form';
import { jsonResponse, mockFetch } from './helpers';

const router = { replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const user = { id: 'user-1', email: 'ada@example.com' };

describe('AuthForm', () => {
  beforeEach(() => {
    router.replace.mockReset();
    router.refresh.mockReset();
  });

  it('validates with the shared schema, links each error and focuses the first invalid field', async () => {
    const fetchMock = mockFetch();
    render(<AuthForm mode="register" next="/" />);

    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    const email = screen.getByLabelText('Email');
    const password = screen.getByLabelText('Password');
    expect(email).toHaveFocus();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Enter a valid email address');
    expect(password).toHaveAccessibleDescription(
      'At least 8 characters. Password must be at least 8 characters',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the normalized credentials and opens the sanitized next path', async () => {
    const fetchMock = mockFetch(jsonResponse({ data: { user } }));
    render(<AuthForm mode="login" next="/stocks/AAPL" />);

    await userEvent.type(screen.getByLabelText('Email'), '  Ada@Example.com ');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/auth/login');
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'ada@example.com',
      password: 'correct-horse',
    });
    expect(router.replace).toHaveBeenCalledWith('/stocks/AAPL');
  });

  it('shows the server error above the form and lets the user retry', async () => {
    mockFetch(
      jsonResponse(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } },
        { status: 401 },
      ),
    );
    render(<AuthForm mode="login" next="/" />);

    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('signs in with the demo account without reading the form', async () => {
    const fetchMock = mockFetch(jsonResponse({ data: { user } }));
    render(<AuthForm mode="login" next="/" />);

    await userEvent.click(screen.getByRole('button', { name: 'Use demo account' }));

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/auth/demo');
    expect(init?.body).toBeUndefined();
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('shows why the demo account is unavailable instead of a generic error', async () => {
    mockFetch(
      jsonResponse(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'The demo account is not available right now.',
          },
        },
        { status: 500 },
      ),
    );
    render(<AuthForm mode="login" next="/" />);

    await userEvent.click(screen.getByRole('button', { name: 'Use demo account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The demo account is not available right now.',
    );
  });
});
