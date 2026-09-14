import type { PublicRichTextV1 } from '@ascnucc/contracts'
import type { ReactNode } from 'react'

type Block = PublicRichTextV1['blocks'][number]
type Inline = Extract<Block, { children: unknown }>['children'][number]

/**
 * Renders the already validated public rich-text contract. Layout and typography
 * remain owned by each consuming module's wrapper.
 */
export function PublicRichText({ body }: { body: PublicRichTextV1 }) {
  return body.blocks.map((block, index) => (
    <BlockNode block={block} key={index} />
  ))
}

function BlockNode({ block }: { block: Block }) {
  switch (block.type) {
    case 'paragraph':
      return <p>{renderInlines(block.children)}</p>
    case 'heading':
      return block.level === 2 ? (
        <h2>{renderInlines(block.children)}</h2>
      ) : (
        <h3>{renderInlines(block.children)}</h3>
      )
    case 'orderedList':
      return (
        <ol>
          {block.items.map((item, index) => (
            <li key={index}>{renderInlines(item.children)}</li>
          ))}
        </ol>
      )
    case 'unorderedList':
      return (
        <ul>
          {block.items.map((item, index) => (
            <li key={index}>{renderInlines(item.children)}</li>
          ))}
        </ul>
      )
    case 'quote':
      return <blockquote>{renderInlines(block.children)}</blockquote>
    default:
      return assertNever(block)
  }
}

function renderInlines(inlines: Inline[]): ReactNode {
  return inlines.map((inline, index) => {
    switch (inline.type) {
      case 'text': {
        let content: ReactNode = inline.text
        for (const mark of inline.marks ?? []) {
          switch (mark) {
            case 'bold':
              content = <strong>{content}</strong>
              break
            case 'italic':
              content = <em>{content}</em>
              break
            case 'underline':
              content = <u>{content}</u>
              break
            case 'code':
              content = <code>{content}</code>
              break
            default:
              assertNever(mark)
          }
        }
        return <span key={index}>{content}</span>
      }
      case 'lineBreak':
        return <br key={index} />
      case 'link': {
        const external = /^https?:/i.test(inline.href)
        return (
          <a
            href={inline.href}
            key={index}
            rel={external ? 'noopener noreferrer' : undefined}
            target={external ? '_blank' : undefined}
          >
            {renderInlines(inline.children)}
          </a>
        )
      }
      default:
        return assertNever(inline)
    }
  })
}

function assertNever(value: never): never {
  throw new Error(`Unsupported public rich-text node: ${String(value)}`)
}
