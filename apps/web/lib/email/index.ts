/**
 * Public email API — call these from server actions / webhooks.
 *
 * Each function never throws. Failures are logged + returned as
 * {delivered: false, reason}. Sign-up flows should treat delivery as
 * "nice to have" and never block on it.
 */

import {
  type EmailSendResult,
  type EmailSender,
  sendEmail as defaultSender,
} from './client';
import {
  type OverageWarningProps,
  type PasswordResetProps,
  type TrialExpiringProps,
  type WelcomeProps,
  type WorkspaceInvitationProps,
  overageWarningEmail,
  passwordResetEmail,
  trialExpiringEmail,
  welcomeEmail,
  workspaceInvitationEmail,
} from './templates';

export async function sendWelcomeEmail(
  props: WelcomeProps,
  sender: EmailSender = defaultSender,
): Promise<EmailSendResult> {
  return sender(welcomeEmail(props));
}

export async function sendTrialExpiringEmail(
  props: TrialExpiringProps,
  sender: EmailSender = defaultSender,
): Promise<EmailSendResult> {
  return sender(trialExpiringEmail(props));
}

export async function sendOverageWarningEmail(
  props: OverageWarningProps,
  sender: EmailSender = defaultSender,
): Promise<EmailSendResult> {
  return sender(overageWarningEmail(props));
}

export async function sendWorkspaceInvitationEmail(
  props: WorkspaceInvitationProps,
  sender: EmailSender = defaultSender,
): Promise<EmailSendResult> {
  return sender(workspaceInvitationEmail(props));
}

export async function sendPasswordResetEmail(
  props: PasswordResetProps,
  sender: EmailSender = defaultSender,
): Promise<EmailSendResult> {
  return sender(passwordResetEmail(props));
}

export type { EmailSender, EmailSendResult } from './client';
export type {
  WelcomeProps,
  TrialExpiringProps,
  OverageWarningProps,
  WorkspaceInvitationProps,
  PasswordResetProps,
} from './templates';
