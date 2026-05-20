import * as React from 'react';
import { Button, Section, Text } from '@react-email/components';
import { Layout, styles } from './Layout';

interface Props {
  resetUrl: string;
}

export function PasswordResetEmail({ resetUrl }: Props) {
  return (
    <Layout
      preview="Reset your ListPack Studio password"
      title="Reset your ListPack Studio password"
    >
      <Text style={styles.paragraph}>
        We received a request to reset the password on your ListPack
        Studio account.
      </Text>
      <Section style={{ margin: '20px 0' }}>
        <Button href={resetUrl} style={styles.buttonPrimary}>
          Reset password
        </Button>
      </Section>
      <Text style={styles.smallMuted}>
        Link is valid for 1 hour. If you didn't ask for this, ignore — your
        password stays the same.
      </Text>
    </Layout>
  );
}
