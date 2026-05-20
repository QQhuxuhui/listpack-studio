import * as React from 'react';
import { Button, Section, Text } from '@react-email/components';
import { Layout, styles } from './Layout';

interface Props {
  name?: string;
  workspaceName: string;
  dashboardUrl: string;
}

export function WelcomeEmail({ name, workspaceName, dashboardUrl }: Props) {
  const greet = name ? `Hi ${name},` : 'Hi there,';
  return (
    <Layout
      preview="Welcome to ListPack Studio — your first 5 SKUs are on us"
      title="Welcome to ListPack Studio"
    >
      <Text style={styles.paragraph}>{greet}</Text>
      <Text style={styles.paragraph}>
        Welcome to ListPack Studio! Your workspace{' '}
        <strong>{workspaceName}</strong> is ready.
      </Text>
      <Text style={{ ...styles.paragraph, fontWeight: 600 }}>
        3-step first run:
      </Text>
      <Section>
        <Text style={styles.paragraph}>
          1. Upload one product photo (JPG/PNG/WebP, up to 20MB)
        </Text>
        <Text style={styles.paragraph}>
          2. Pick the platforms you sell on
        </Text>
        <Text style={styles.paragraph}>
          3. Watch the agent compliance-check, generate, and size your pack
        </Text>
      </Section>
      <Section style={{ margin: '20px 0' }}>
        <Button href={dashboardUrl} style={styles.buttonPrimary}>
          Open your dashboard
        </Button>
      </Section>
      <Text style={styles.smallMuted}>
        Free tier includes 5 SKUs / month, no credit card. Reply to this
        email if you need help — a real person reads every reply.
      </Text>
    </Layout>
  );
}
