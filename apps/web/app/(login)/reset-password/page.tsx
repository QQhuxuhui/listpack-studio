'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Layers, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resetPassword } from '../actions';
import { useDictionary } from '@/lib/i18n/client';

type ActionState = { error?: string };

function ResetPasswordForm() {
  const { t } = useDictionary();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, action, isPending] = useActionState<ActionState, FormData>(
    resetPassword,
    {},
  );

  return (
    <div className="min-h-[calc(100dvh-68px)] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <Layers className="h-12 w-12 text-orange-500" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          {t.auth.reset_h1}
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        {!token ? (
          <p className="text-center text-sm text-red-600">
            Missing reset token. Use the link in the email we sent you, or{' '}
            <Link
              href="/forgot-password"
              className="text-orange-600 hover:text-orange-700"
            >
              request a new one
            </Link>
            .
          </p>
        ) : (
          <form action={action} className="space-y-6">
            <input type="hidden" name="token" value={token} />
            <div>
              <Label htmlFor="password">{t.auth.new_password_label}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div>
              <Label htmlFor="confirmPassword">{t.auth.confirm_password_label}</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>

            {state.error && (
              <p className="text-sm text-red-600">{state.error}</p>
            )}

            <Button
              type="submit"
              disabled={isPending}
              className="w-full bg-orange-600 hover:bg-orange-700"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.common.loading}
                </>
              ) : (
                t.auth.submit_set_new
              )}
            </Button>

            <p className="text-center text-sm text-gray-600">
              <Link
                href="/sign-in"
                className="text-orange-600 hover:text-orange-700"
              >
                {t.common.sign_in}
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
