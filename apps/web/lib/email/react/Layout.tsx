import * as React from 'react';
/**
 * Shared React Email layout — used by all transactional templates.
 *
 * React Email components (https://react.email — MIT) produce
 * Outlook/Gmail dark-mode-safe HTML. Compared with the prior
 * hand-rolled <table>-free shell, this gives us:
 *   - automatic inlining of styles (Outlook 2007 doesn't read <style>)
 *   - cross-client tested Button / Section / Text components
 *   - reliable preview text (the small grey snippet beside the subject)
 *
 * Keep this file styling-light: per-template differences belong in the
 * template file, not here.
 */

import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { type ReactNode } from 'react';

const BRAND = 'ListPack Studio';
const BRAND_URL = 'https://listpack.studio';

const main: React.CSSProperties = {
  backgroundColor: '#f8f8f8',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  color: '#111111',
};

const container: React.CSSProperties = {
  backgroundColor: '#ffffff',
  maxWidth: '560px',
  margin: '0 auto',
  padding: '32px 24px',
  borderRadius: '8px',
};

const footer: React.CSSProperties = {
  fontSize: '12px',
  color: '#888888',
  marginTop: '32px',
};

const heading: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 600,
  margin: '0 0 16px',
  color: '#111111',
};

const hr: React.CSSProperties = {
  borderColor: '#eeeeee',
  margin: '32px 0',
};

interface Props {
  preview: string;
  title: string;
  children: ReactNode;
}

export function Layout({ preview, title, children }: Props) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={heading}>{title}</Text>
          {children}
          <Hr style={hr} />
          <Text style={footer}>
            {BRAND} ·{' '}
            <Link href={BRAND_URL} style={{ color: '#888888' }}>
              {BRAND_URL}
            </Link>
            <br />
            You're receiving this because you signed up at {BRAND_URL}.{' '}
            <Link href={`${BRAND_URL}/unsubscribe`} style={{ color: '#888888' }}>
              Unsubscribe
            </Link>
            .
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const styles = {
  paragraph: {
    fontSize: '14px',
    lineHeight: '22px',
    color: '#333333',
  } satisfies React.CSSProperties,
  buttonPrimary: {
    backgroundColor: '#ea580c',
    color: '#ffffff',
    padding: '10px 18px',
    borderRadius: '6px',
    fontWeight: 600,
    textDecoration: 'none',
    display: 'inline-block',
  } satisfies React.CSSProperties,
  buttonDark: {
    backgroundColor: '#111111',
    color: '#ffffff',
    padding: '10px 18px',
    borderRadius: '6px',
    fontWeight: 600,
    textDecoration: 'none',
    display: 'inline-block',
  } satisfies React.CSSProperties,
  smallMuted: {
    fontSize: '13px',
    color: '#777777',
  } satisfies React.CSSProperties,
};

export { BRAND, BRAND_URL };
