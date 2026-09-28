import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MessageMarkdown } from '../../components/MessageMarkdown';
import { AIConfigProvider } from '../../context/AIConfigContext';
import { DEFAULT_CONFIG } from '../../utils/api';

const sample = `Welcome! Today we're practicing **"used to"** — structure for past habits.

**Micro-point 1: Positive sentences**

Formula: Subject + used to + verb (base form)

Examples:
- "I **used to live** in Ho Chi Minh City."
- "She **used to play** tennis."

Now your turn: Make one sentence about something you used to do.`;

describe('MessageMarkdown', () => {
  it('renders bold, lists and drill callout without raw **', () => {
    const html = renderToString(
      <AIConfigProvider config={{ ...DEFAULT_CONFIG }}>
        <MessageMarkdown text={sample} tone="coach" />
      </AIConfigProvider>,
    );
    expect(html).not.toContain('**');
    expect(html).toContain('<strong');
    expect(html).toContain('<ul');
    expect(html).toContain('<li');
    expect(html).toContain('Your turn');
  });
});
