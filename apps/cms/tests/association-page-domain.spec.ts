import { describe, expect, it } from 'vitest'

import {
  assignContactIds,
  validateAssociationContacts,
  validateAndMapPublicContacts,
} from '@/modules/content/association-pages/domain'

const contactId = 'f891a717-39b0-4752-ac1b-6e2be154cea9'

describe('association page contact rules', () => {
  it('maps only public contacts and derives safe mailto and tel links', () => {
    expect(
      validateAndMapPublicContacts([
        {
          contactId,
          isPublic: true,
          label: '协会邮箱',
          showOnHome: true,
          type: 'email',
          value: 'public@example.test',
        },
        {
          contactId: '44baef57-4b1a-4a59-b6a1-aa46aafdddc1',
          isPublic: true,
          label: '协会电话',
          showOnHome: false,
          type: 'phone',
          value: '+86 (20) 1234-5678',
        },
        {
          contactId: 'b34462c8-b6ea-40f7-a329-9a4923aaf2e7',
          isPublic: false,
          label: '',
          showOnHome: false,
          type: 'wechat',
          value: '',
        },
      ]),
    ).toEqual([
      expect.objectContaining({ href: 'mailto:public@example.test' }),
      expect.objectContaining({ href: 'tel:+862012345678' }),
    ])
  })

  it('allows draft display combinations but rejects them at publication', () => {
    expect(() =>
      validateAssociationContacts([
        {
          contactId,
          isPublic: false,
          label: '',
          showOnHome: true,
          type: 'email',
          value: '',
        },
      ]),
    ).not.toThrow()

    expect(() =>
      validateAndMapPublicContacts([
        {
          contactId,
          isPublic: false,
          label: '',
          showOnHome: true,
          type: 'email',
          value: '',
        },
      ]),
    ).toThrow('home page')
  })

  it('rejects modified stable ids', () => {
    expect(() =>
      assignContactIds(
        [{ contactId: '44baef57-4b1a-4a59-b6a1-aa46aafdddc1', id: 'row-1' }],
        [{ contactId, id: 'row-1' }],
      ),
    ).toThrow('cannot be changed')
  })

  it('ignores a caller id for new rows, preserves existing ids and retries collisions', () => {
    const secondId = '44baef57-4b1a-4a59-b6a1-aa46aafdddc1'
    const generated = [contactId, secondId]
    const contacts = assignContactIds(
      [{ contactId: secondId, id: 'new-row' }, { id: 27 }],
      [{ contactId, id: 27 }],
      () => generated.shift() ?? secondId,
    )

    expect(contacts).toEqual([
      { contactId: secondId, id: 'new-row' },
      { contactId, id: 27 },
    ])
  })

  it('allows incomplete draft text but always validates stable structure', () => {
    expect(() =>
      validateAssociationContacts([
        {
          contactId,
          isPublic: true,
          label: '',
          note: '',
          showOnHome: false,
          type: 'email',
          value: '',
        },
      ]),
    ).not.toThrow()

    expect(() =>
      validateAssociationContacts([
        {
          contactId,
          isPublic: true,
          label: 'a'.repeat(61),
          showOnHome: false,
          type: 'email',
          value: '',
        },
      ]),
    ).toThrow('label')

    expect(() =>
      validateAssociationContacts([
        {
          contactId,
          isPublic: true,
          showOnHome: false,
          type: 'unsupported',
        },
      ]),
    ).toThrow('identity or type')
  })

  it('rejects duplicate ids and unsafe values while normalizing an empty note', () => {
    expect(() =>
      validateAssociationContacts([
        {
          contactId,
          isPublic: false,
          showOnHome: false,
          type: 'other',
        },
        {
          contactId,
          isPublic: false,
          showOnHome: false,
          type: 'other',
        },
      ]),
    ).toThrow('identity or type')

    expect(() =>
      validateAndMapPublicContacts([
        {
          contactId,
          isPublic: true,
          label: '协会邮箱',
          showOnHome: false,
          type: 'email',
          value: 'first@example.test,second@example.test',
        },
      ]),
    ).toThrow('email')

    expect(
      validateAndMapPublicContacts([
        {
          contactId,
          isPublic: true,
          label: '协会电话',
          note: '   ',
          showOnHome: false,
          type: 'phone',
          value: '+86 (20) 1234-5678',
        },
      ]),
    ).toEqual([
      expect.objectContaining({ note: null, value: '+86 (20) 1234-5678' }),
    ])
  })
})
