'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Layers, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestPasswordReset } from '../actions';

type ActionState = { error?: string; success?: string; email?: string };

export default function ForgotPasswordPage() {
  const [state, action, isPending] = useActionState<ActionState, FormData>(
    requestPasswordReset,
    {},
  );

  return (
    <div className="min-h-[calc(100dvh-68px)] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <Layers className="h-12 w-12 text-orange-500" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Forgot your password?
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Enter the email on your account and we'll send a reset link.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <form action={action} className="space-y-6">
          <div>
            <Label htmlFor="email">Email</Label>
            <div className="mt-1">
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={state.email}
                required
              />
            </div>
          </div>

          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          {state.success && (
            <p className="text-sm text-green-700">{state.success}</p>
          )}

          <Button
            type="submit"
            disabled={isPending}
            className="w-full bg-orange-600 hover:bg-orange-700"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending…
              </>
            ) : (
              'Send reset link'
            )}
          </Button>

          <p className="text-center text-sm text-gray-600">
            Remembered it?{' '}
            <Link
              href="/sign-in"
              className="text-orange-600 hover:text-orange-700"
            >
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
