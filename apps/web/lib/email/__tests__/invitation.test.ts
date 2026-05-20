import { test } from 'node:test';
import assert from 'node:assert/strict';

import { workspaceInvitationEmail } from '../templates';
import { sendWorkspaceInvitationEmail, type EmailSender } from '../index';

test('workspaceInvitationEmail carries inviter / workspace / role / accept URL', () => {
  const out = workspaceInvitationEmail({
    to: 'invitee@example.com',
    inviterName: 'Alice',
    workspaceName: 'Acme Ltd',
    role: 'editor',
    acceptUrl: 'https://app.listpack.studio/sign-up?inviteId=inv-1',
  });
  assert.match(out.subject, /Alice invited you to Acme Ltd/);
  assert.ok(out.text.includes('Alice'));
  assert.ok(out.text.includes('Acme Ltd'));
  assert.ok(out.text.includes('editor'));
  assert.ok(out.html.includes('https://app.listpack.studio/sign-up?inviteId=inv-1'));
  assert.match(out.text, /14 days/);
});

test('workspaceInvitationEmail escapes HTML in inviter / workspace fields', () => {
  const out = workspaceInvitationEmail({
    to: 'x@x.com',
    inviterName: '<script>alert(1)</script>',
    workspaceName: '"><img onerror=alert(1)>',
    role: 'admin',
    acceptUrl: 'https://x',
  });
  // The dangerous bits are <script>, raw <img, and the closing "> that
  // would break out of the surrounding <strong>. After escaping, none of
  // these tag boundaries should appear in the output.
  assert.ok(!out.html.includes('<script>alert(1)</script>'));
  assert.ok(!out.html.includes('<img'));
  // The escaped form must be present, proving the input was processed.
  assert.ok(out.html.includes('&lt;script&gt;'));
});

test('sendWorkspaceInvitationEmail accepts a stub sender', async () => {
  const captured: { sent?: { subject: string; to: string } } = {};
  const stub: EmailSender = async (p) => {
    captured.sent = { subject: p.subject, to: p.to };
    return { delivered: true, messageId: 'inv-test-1' };
  };
  const result = await sendWorkspaceInvitationEmail(
    {
      to: 'inv@example.com',
      inviterName: 'Bob',
      workspaceName: 'Bob Co',
      role: 'viewer',
      acceptUrl: 'https://x/sign-up?inviteId=i',
    },
    stub,
  );
  assert.equal(result.delivered, true);
  assert.equal(captured.sent?.to, 'inv@example.com');
  assert.match(captured.sent?.subject ?? '', /Bob invited you to Bob Co/);
});
