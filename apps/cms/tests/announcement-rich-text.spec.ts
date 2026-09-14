import { describe, expect, it } from 'vitest'

import {
  hasMeaningfulPublicText,
  toPublicRichText,
} from '@/modules/content/announcements/public-rich-text'

function document(...children: unknown[]) {
  return {
    root: {
      children,
      type: 'root',
    },
  }
}

function text(value: string, format = 0) {
  return { format, text: value, type: 'text' }
}

function paragraph(...children: unknown[]) {
  return { children, type: 'paragraph' }
}

describe('announcement public rich text', () => {
  it('maps every frozen block, inline node and text mark', () => {
    expect(
      toPublicRichText(
        document(
          paragraph(
            text('all marks', 1 | 2 | 8 | 16),
            { type: 'linebreak' },
            {
              children: [text('relative link'), { type: 'linebreak' }],
              fields: { linkType: 'custom', url: '/announcements/inside' },
              type: 'link',
            },
          ),
          { children: [text('Heading 2')], tag: 'h2', type: 'heading' },
          { children: [text('Heading 3')], tag: 'h3', type: 'heading' },
          { children: [text('Quoted')], type: 'quote' },
          {
            children: [
              { children: [text('First')], type: 'listitem' },
              { children: [text('Second')], type: 'listitem' },
            ],
            listType: 'number',
            tag: 'ol',
            type: 'list',
          },
          {
            children: [{ children: [text('Bullet')], type: 'listitem' }],
            listType: 'bullet',
            tag: 'ul',
            type: 'list',
          },
        ),
      ),
    ).toEqual({
      blocks: [
        {
          children: [
            {
              marks: ['bold', 'italic', 'underline', 'code'],
              text: 'all marks',
              type: 'text',
            },
            { type: 'lineBreak' },
            {
              children: [
                { text: 'relative link', type: 'text' },
                { type: 'lineBreak' },
              ],
              href: '/announcements/inside',
              type: 'link',
            },
          ],
          type: 'paragraph',
        },
        {
          children: [{ text: 'Heading 2', type: 'text' }],
          level: 2,
          type: 'heading',
        },
        {
          children: [{ text: 'Heading 3', type: 'text' }],
          level: 3,
          type: 'heading',
        },
        {
          children: [{ text: 'Quoted', type: 'text' }],
          type: 'quote',
        },
        {
          items: [
            { children: [{ text: 'First', type: 'text' }] },
            { children: [{ text: 'Second', type: 'text' }] },
          ],
          type: 'orderedList',
        },
        {
          items: [{ children: [{ text: 'Bullet', type: 'text' }] }],
          type: 'unorderedList',
        },
      ],
      version: 1,
    })
  })

  it.each([
    { children: [text('raw')], type: 'html' },
    { children: [text('image')], type: 'upload' },
    { children: [text('Heading 1')], tag: 'h1', type: 'heading' },
    { children: [], listType: 'check', tag: 'ul', type: 'list' },
  ])('rejects an unsupported or unknown block: $type', (block) => {
    expect(() => toPublicRichText(document(block))).toThrow()
  })

  it.each([
    { type: 'tab' },
    { type: 'inline-image' },
    {
      children: [{ type: 'tab' }],
      fields: { linkType: 'custom', url: '/inside' },
      type: 'link',
    },
  ])('rejects an unsupported or unknown inline node', (inline) => {
    expect(() => toPublicRichText(document(paragraph(inline)))).toThrow()
  })

  it.each([
    '/announcements/inside',
    './inside',
    '../inside',
    '#section',
    '?page=2',
    'https://example.test/path',
    'http://example.test/path',
    'mailto:contact@example.test',
  ])('accepts the frozen custom link destination %s', (url) => {
    expect(
      toPublicRichText(
        document(
          paragraph({
            children: [text('destination')],
            fields: { linkType: 'custom', url },
            type: 'link',
          }),
        ),
      ),
    ).toMatchObject({
      blocks: [
        {
          children: [{ href: url, type: 'link' }],
          type: 'paragraph',
        },
      ],
    })
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,bad',
    '//example.test',
    '/\\evil.example/path',
    ' https://example.test',
  ])('rejects the unsafe link scheme %s', (url) => {
    expect(() =>
      toPublicRichText(
        document(
          paragraph({
            children: [text('unsafe')],
            fields: { linkType: 'custom', url },
            type: 'link',
          }),
        ),
      ),
    ).toThrow()
  })

  it('rejects a Payload internal relationship link', () => {
    expect(() =>
      toPublicRichText(
        document(
          paragraph({
            children: [text('internal relationship')],
            fields: {
              doc: { relationTo: 'announcements', value: 'announcement-id' },
              linkType: 'internal',
            },
            type: 'link',
          }),
        ),
      ),
    ).toThrow(/custom URL/)
  })

  it.each([4, 32, 1 | 4, -1, 1.5, 'bold'])(
    'rejects the disallowed text format %s',
    (format) => {
      expect(() =>
        toPublicRichText(
          document(paragraph({ format, text: 'marked', type: 'text' })),
        ),
      ).toThrow(/unsupported mark/)
    },
  )

  it('recognizes meaningful text in blocks, links and list items', () => {
    const empty = toPublicRichText(
      document(paragraph(text(' \n\t '), { type: 'linebreak' })),
    )
    const linked = toPublicRichText(
      document(
        paragraph({
          children: [text(' linked text ')],
          fields: { linkType: 'custom', url: '/inside' },
          type: 'link',
        }),
      ),
    )
    const listed = toPublicRichText(
      document({
        children: [{ children: [text(' list text ')], type: 'listitem' }],
        listType: 'bullet',
        tag: 'ul',
        type: 'list',
      }),
    )

    expect(hasMeaningfulPublicText(empty)).toBe(false)
    expect(hasMeaningfulPublicText(linked)).toBe(true)
    expect(hasMeaningfulPublicText(listed)).toBe(true)
  })
})
