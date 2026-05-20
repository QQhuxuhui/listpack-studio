import * as React from 'react';
import { Button, Section, Text } from '@react-email/components';
import { Layout, styles } from './Layout';

interface Props {
  name?: string;
  planName: string;
  skuUsed: number;
  skuQuota: number;
  overagePerSku: number;
  manageUrl: string;
}

export function OverageWarningEmail({
  name,
  planName,
  skuUsed,
  skuQuota,
  overagePerSku,
  manageUrl,
}: Props) {
  const greet = name ? `Hi ${name},` : 'Hi there,';
  const rate = `$${overagePerSku.toFixed(2)}`;
  return (
    <Layout
      preview={`You've hit your ${planName} SKU quota`}
      title={`You've hit your ${planName} SKU quota`}
    >
      <Text style={styles.paragraph}>{greet}</Text>
      <Text style={styles.paragraph}>
        You've used <strong>{skuUsed}</strong> of{' '}
        <strong>{skuQuota}</strong> SKUs on the {planName} plan. Any
        further SKU this billing period costs <strong>{rate}</strong>{' '}
        each.
      </Text>
      <Section>
        <Text style={styles.paragraph}>
          • Keep going at the overage rate (itemised on your next
          invoice)
        </Text>
        <Text style={styles.paragraph}>
          • Upgrade to a higher plan for a better per-SKU rate
        </Text>
        <Text style={styles.paragraph}>
          • Disable overage to halt further generation
        </Text>
      </Section>
      <Section style={{ margin: '20px 0' }}>
        <Button href={manageUrl} style={styles.buttonPrimary}>
          Manage your plan
        </Button>
      </Section>
    </Layout>
  );
}
