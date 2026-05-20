import * as React from 'react';
import { Button, Section, Text } from '@react-email/components';
import { Layout, styles } from './Layout';

interface Props {
  name?: string;
  planName: string;
  expiresOnIso: string;
  manageUrl: string;
}

export function TrialExpiringEmail({
  name,
  planName,
  expiresOnIso,
  manageUrl,
}: Props) {
  const greet = name ? `Hi ${name},` : 'Hi there,';
  const expiresOn = new Date(expiresOnIso).toUTCString();
  return (
    <Layout
      preview={`Your ${planName} trial ends ${expiresOn}`}
      title={`Your ${planName} trial ends ${expiresOn}`}
    >
      <Text style={styles.paragraph}>{greet}</Text>
      <Text style={styles.paragraph}>
        Heads up — your <strong>{planName}</strong> free trial ends on{' '}
        <strong>{expiresOn} (UTC)</strong>. After that we'll charge the
        card on file unless you cancel.
      </Text>
      <Section style={{ margin: '20px 0' }}>
        <Button href={manageUrl} style={styles.buttonDark}>
          Manage subscription
        </Button>
      </Section>
      <Text style={styles.smallMuted}>
        This notice is sent at least 48 hours ahead of the charge per our
        user agreement — no surprise billing, ever.
      </Text>
    </Layout>
  );
}
