import type { CSSProperties } from 'react';

export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  borderRadius: '0.375rem',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontSize: 'var(--text-base)',
};

export const buttonStyle: CSSProperties = {
  padding: '0.6rem 1.25rem',
  borderRadius: '0.375rem',
  border: 'none',
  background: 'var(--color-accent)',
  color: '#ffffff',
  fontWeight: 600,
  cursor: 'pointer',
};

export const buttonSecondaryStyle: CSSProperties = {
  ...buttonStyle,
  background: 'transparent',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text)',
};

export const cardStyle: CSSProperties = {
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  borderRadius: '0.5rem',
  padding: '0.75rem 1rem',
  marginBottom: '0.5rem',
};
