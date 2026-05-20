import * as React from 'react';
import { Button, Section, Text } from '@react-email/components';
import { Layout, styles } from './Layout';

interface Props {
  inviterName: string;
  workspaceName: string;
  role: 'admin' | 'editor' | 'viewer';
  acceptUrl: string;
}

export function WorkspaceInvitationEmail({
  inviterName,
  workspaceName,
  role,
  acceptUrl,
}: Props) {
  return (
    <Layout
      preview={`${inviterName} invited you to ${workspaceName}`}
      title={`Join ${workspaceName} on ListPack Studio`}
    >
      <Text style={styles.paragraph}>
        {inviterName} invited you to join <strong>{workspaceName}</strong>{' '}
        as <strong>{role}</strong>.
      </Text>
      <Section style={{ margin: '20px 0' }}>
        <Button href={acceptUrl} style={styles.buttonPrimary}>
          Accept invitation
        </Button>
      </Section>
      <Text style={styles.smallMuted}>
        If you weren't expecting this, you can safely ignore — the
        invitation expires in 14 days.
      </Text>
    </Layout>
  );
}
