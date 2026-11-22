'use client';

import { loginBodySchema, meResponseSchema, registerBodySchema } from '@ruut/shared';
import { CircleAlert, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type FormEvent } from 'react';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';

type Mode = 'login' | 'register';
type Field = 'email' | 'password';
type FieldErrors = Partial<Record<Field, string>>;
type PendingAction = 'submit' | 'demo' | null;

const COPY = {
  login: {
    submit: 'Sign in',
    endpoint: '/api/auth/login',
    passwordAutoComplete: 'current-password',
    fallbackError: 'We could not sign you in right now. Please try again.',
  },
  register: {
    submit: 'Create account',
    endpoint: '/api/auth/register',
    passwordAutoComplete: 'new-password',
    fallbackError: 'We could not create your account right now. Please try again.',
  },
} as const;

function formatWait(seconds: number): string {
  return seconds < 60 ? `${seconds} s` : `${Math.ceil(seconds / 60)} min`;
}

/**
 * Error envelopes from the API and the BFF carry messages written for users (spec 02 §2), 5xx
 * included, e.g. "The demo account is not available right now." Only failures without one
 * (network errors, unexpected values) get the fallback.
 */
function describeError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.code === 'RATE_LIMITED') {
    return error.retryAfter
      ? `Too many attempts. Try again in ${formatWait(error.retryAfter)}.`
      : 'Too many attempts. Try again later.';
  }
  return error.status === 0 ? fallback : error.message;
}

function toFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if ((field === 'email' || field === 'password') && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

interface AuthFormProps {
  mode: Mode;
  /** Already sanitized internal path to open after signing in. */
  next: string;
}

export function AuthForm({ mode, next }: AuthFormProps) {
  const router = useRouter();
  const copy = COPY[mode];
  const id = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);

  const ids = {
    email: `${id}-email`,
    emailError: `${id}-email-error`,
    password: `${id}-password`,
    passwordHint: `${id}-password-hint`,
    passwordError: `${id}-password-error`,
    serverError: `${id}-server-error`,
  };

  async function run(action: Exclude<PendingAction, null>, endpoint: string, body?: unknown) {
    setPending(action);
    setServerError(null);
    try {
      await apiRequest(endpoint, meResponseSchema, { method: 'POST', body });
      // Pending stays on until the next page replaces this one.
      router.replace(next);
      router.refresh();
    } catch (error) {
      setServerError(describeError(error, copy.fallbackError));
      setPending(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const schema = mode === 'login' ? loginBodySchema : registerBodySchema;
    const parsed = schema.safeParse({
      email: formData.get('email') ?? '',
      password: formData.get('password') ?? '',
    });

    if (!parsed.success) {
      const errors = toFieldErrors(parsed.error);
      setFieldErrors(errors);
      setServerError(null);
      (errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    setFieldErrors({});
    void run('submit', copy.endpoint, parsed.data);
  }

  function clearFieldError(field: Field) {
    if (fieldErrors[field]) setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  const isPending = pending !== null;
  const passwordDescribedBy =
    [mode === 'register' ? ids.passwordHint : null, fieldErrors.password ? ids.passwordError : null]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className="space-y-4">
      {serverError && (
        <div
          id={ids.serverError}
          role="alert"
          className="flex items-start gap-2 rounded-md border border-negative px-3 py-2 text-sm text-negative"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{serverError}</p>
        </div>
      )}

      <form noValidate onSubmit={handleSubmit} className="space-y-4" aria-busy={isPending}>
        <div className="space-y-2">
          <Label htmlFor={ids.email}>Email</Label>
          <Input
            ref={emailRef}
            id={ids.email}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? ids.emailError : undefined}
            onChange={() => clearFieldError('email')}
          />
          {fieldErrors.email && (
            <p id={ids.emailError} className="text-xs text-negative">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={ids.password}>Password</Label>
          <Input
            ref={passwordRef}
            id={ids.password}
            name="password"
            type="password"
            autoComplete={copy.passwordAutoComplete}
            required
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={passwordDescribedBy}
            onChange={() => clearFieldError('password')}
          />
          {mode === 'register' && (
            <p id={ids.passwordHint} className="text-xs text-muted-foreground">
              At least 8 characters.
            </p>
          )}
          {fieldErrors.password && (
            <p id={ids.passwordError} className="text-xs text-negative">
              {fieldErrors.password}
            </p>
          )}
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={isPending}>
          {pending === 'submit' && (
            <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
          )}
          {copy.submit}
        </Button>
      </form>

      {mode === 'login' && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          disabled={isPending}
          onClick={() => void run('demo', '/api/auth/demo')}
        >
          {pending === 'demo' && (
            <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
          )}
          Use demo account
        </Button>
      )}
    </div>
  );
}
