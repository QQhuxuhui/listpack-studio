import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { User, WorkspaceWithMembers } from '@/lib/db/schema';
import { getUser, getWorkspaceForUser } from '@/lib/db/queries';

export type ActionState = {
  error?: string;
  success?: string;
  // Form-state echoes (email/password etc.) flow through the index signature.
  // `any` matches starter convention and avoids cast-noise in `<Input defaultValue>`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

type ValidatedActionFunction<S extends z.ZodType<unknown>, T> = (
  data: z.infer<S>,
  formData: FormData,
) => Promise<T>;

export function validatedAction<S extends z.ZodType<unknown>, T>(
  schema: S,
  action: ValidatedActionFunction<S, T>,
) {
  return async (
    _prev: ActionState,
    formData: FormData,
  ): Promise<ActionState> => {
    const result = schema.safeParse(Object.fromEntries(formData));
    if (!result.success) {
      return { error: result.error.issues[0]?.message ?? 'Invalid input' };
    }
    // `redirect()` throws a Next.js internal error, so `action` returns `never`
    // on the happy path. Coerce the formal T into ActionState for useActionState.
    const r = (await action(result.data, formData)) as
      | ActionState
      | undefined
      | null;
    return r ?? {};
  };
}

type ValidatedActionWithUserFunction<S extends z.ZodType<unknown>, T> = (
  data: z.infer<S>,
  formData: FormData,
  user: User,
) => Promise<T>;

export function validatedActionWithUser<S extends z.ZodType<unknown>, T>(
  schema: S,
  action: ValidatedActionWithUserFunction<S, T>,
) {
  return async (
    _prev: ActionState,
    formData: FormData,
  ): Promise<ActionState> => {
    const user = await getUser();
    if (!user) throw new Error('User is not authenticated');

    const result = schema.safeParse(Object.fromEntries(formData));
    if (!result.success) {
      return { error: result.error.issues[0]?.message ?? 'Invalid input' };
    }
    const r = (await action(result.data, formData, user)) as
      | ActionState
      | undefined
      | null;
    return r ?? {};
  };
}

type ActionWithWorkspaceFunction<T> = (
  formData: FormData,
  workspace: WorkspaceWithMembers,
) => Promise<T>;

export function withWorkspace<T>(action: ActionWithWorkspaceFunction<T>) {
  return async (formData: FormData): Promise<T> => {
    const user = await getUser();
    if (!user) redirect('/sign-in');

    const workspace = await getWorkspaceForUser();
    if (!workspace) throw new Error('Workspace not found');

    return action(formData, workspace);
  };
}
