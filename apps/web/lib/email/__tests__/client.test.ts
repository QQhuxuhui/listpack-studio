import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sendEmail, type EmailPayload } from '../client';
import { sendWelcomeEmail } from '../index';

test('sendEmail no-ops when RESEND_API_KEY is unset', async () => {
  delete process.env.RESEND_API_KEY;
  const payload: EmailPayload = {
    to: 'x@y.com',
    subject: 's',
    html: '<p>h</p>',
    text: 't',
  };
  const result = await sendEmail(payload);
  assert.equal(result.delivered, false);
  assert.equal(result.messageId, null);
  assert.match(result.reason ?? '', /no api key/);
});

test('sendWelcomeEmail accepts a custom sender for testing', async () => {
  const captured: { payload: EmailPayload | null } = { payload: null };
  const result = await sendWelcomeEmail(
    {
      to: 'jane@example.com',
      workspaceName: 'Jane Co',
      dashboardUrl: 'https://x/dashboard',
    },
    async (payload) => {
      captured.payload = payload;
      return { delivered: true, messageId: 'fake-id-1' };
    },
  );
  assert.equal(result.delivered, true);
  assert.equal(result.messageId, 'fake-id-1');
  assert.equal(captured.payload?.to, 'jane@example.com');
  assert.match(captured.payload?.subject ?? '', /Welcome to ListPack Studio/);
});

test('sendWelcomeEmail surfaces sender errors as {delivered:false}', async () => {
  const result = await sendWelcomeEmail(
    {
      to: 'x@y.com',
      workspaceName: 'Ws',
      dashboardUrl: 'https://x',
    },
    async () => ({
      delivered: false,
      messageId: null,
      reason: 'resend 429: rate limited',
    }),
  );
  assert.equal(result.delivered, false);
  assert.match(result.reason ?? '', /rate limited/);
});
