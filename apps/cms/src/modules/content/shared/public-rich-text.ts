import {
  publicRichTextV1Schema,
  type PublicRichTextV1,
} from '@ascnucc/contracts'

const allowedFormatMask = 1 | 2 | 8 | 16

type UnknownRecord = Record<string, unknown>

function record(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid public rich text ${label}`)
  }
  return value as UnknownRecord
}

function children(node: UnknownRecord, label: string): unknown[] {
  if (!Array.isArray(node.children)) {
    throw new Error(`Invalid public rich text ${label} children`)
  }
  return node.children
}

function mapText(node: UnknownRecord) {
  if (typeof node.text !== 'string') {
    throw new Error('Invalid public rich text text node')
  }
  const format = node.format ?? 0
  if (
    typeof format !== 'number' ||
    !Number.isInteger(format) ||
    (format & ~allowedFormatMask) !== 0
  ) {
    throw new Error('Public rich text contains an unsupported mark')
  }

  const marks: Array<'bold' | 'code' | 'italic' | 'underline'> = []
  if (format & 1) marks.push('bold')
  if (format & 2) marks.push('italic')
  if (format & 8) marks.push('underline')
  if (format & 16) marks.push('code')

  return {
    ...(marks.length > 0 ? { marks } : {}),
    text: node.text,
    type: 'text' as const,
  }
}

function mapLinkChild(value: unknown) {
  const node = record(value, 'link child')
  if (node.type === 'text') return mapText(node)
  if (node.type === 'linebreak') return { type: 'lineBreak' as const }
  throw new Error('Public rich text link contains an unsupported child')
}

function mapInline(value: unknown) {
  const node = record(value, 'inline node')
  if (node.type === 'text') return mapText(node)
  if (node.type === 'linebreak') return { type: 'lineBreak' as const }
  if (node.type === 'link') {
    const fields = record(node.fields, 'link fields')
    if (fields.linkType !== 'custom' || typeof fields.url !== 'string') {
      throw new Error('Public rich text link must use a custom URL')
    }
    return {
      children: children(node, 'link').map(mapLinkChild),
      href: fields.url,
      type: 'link' as const,
    }
  }
  throw new Error(`Unsupported announcement inline node: ${String(node.type)}`)
}

function mapListItem(value: unknown) {
  const node = record(value, 'list item')
  if (node.type !== 'listitem') {
    throw new Error('Public rich text list contains an unsupported item')
  }
  return { children: children(node, 'list item').map(mapInline) }
}

function mapBlock(value: unknown) {
  const node = record(value, 'block')
  switch (node.type) {
    case 'paragraph':
      return {
        children: children(node, 'paragraph').map(mapInline),
        type: 'paragraph' as const,
      }
    case 'heading': {
      if (node.tag !== 'h2' && node.tag !== 'h3') {
        throw new Error('Public rich text heading level is unsupported')
      }
      return {
        children: children(node, 'heading').map(mapInline),
        level: node.tag === 'h2' ? (2 as const) : (3 as const),
        type: 'heading' as const,
      }
    }
    case 'quote':
      return {
        children: children(node, 'quote').map(mapInline),
        type: 'quote' as const,
      }
    case 'list': {
      const type =
        node.listType === 'number' || node.tag === 'ol'
          ? ('orderedList' as const)
          : node.listType === 'bullet' || node.tag === 'ul'
            ? ('unorderedList' as const)
            : null
      if (!type) throw new Error('Public rich text list type is unsupported')
      return {
        items: children(node, 'list').map(mapListItem),
        type,
      }
    }
    default:
      throw new Error(
        `Unsupported announcement block node: ${String(node.type)}`,
      )
  }
}

export function toPublicRichText(value: unknown): PublicRichTextV1 {
  const lexical = record(value, 'document')
  const root = record(lexical.root, 'root')
  if (root.type !== 'root') {
    throw new Error('Invalid announcement rich text root')
  }

  return publicRichTextV1Schema.parse({
    blocks: children(root, 'root').map(mapBlock),
    version: 1,
  })
}

export function hasMeaningfulPublicText(value: PublicRichTextV1): boolean {
  const inlineHasText = (items: unknown[]): boolean =>
    items.some((item) => {
      const node = item as {
        children?: unknown[]
        text?: string
        type?: string
      }
      if (node.type === 'text') return Boolean(node.text?.trim())
      if (node.type === 'link') return inlineHasText(node.children ?? [])
      return false
    })

  return value.blocks.some((block) =>
    'items' in block
      ? block.items.some((item) => inlineHasText(item.children))
      : inlineHasText(block.children),
  )
}
