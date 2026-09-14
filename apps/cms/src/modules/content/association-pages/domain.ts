import { randomUUID } from 'node:crypto'

export const associationPageKeys = ['home', 'about', 'contact'] as const
export type AssociationPageKey = (typeof associationPageKeys)[number]

export const contactTypes = ['email', 'phone', 'qq', 'wechat', 'other'] as const
export type ContactType = (typeof contactTypes)[number]

export type AssociationContact = {
  contactId?: unknown
  id?: unknown
  isPublic?: unknown
  label?: unknown
  note?: unknown
  showOnHome?: unknown
  type?: unknown
  value?: unknown
}

type ValidatedAssociationContact = AssociationContact & {
  contactId: string
  isPublic: boolean
  showOnHome: boolean
  type: ContactType
}

type PublicContact = {
  contactId: string
  href?: string
  label: string
  note: null | string
  showOnHome: boolean
  type: ContactType
  value: string
}

const controlCharacters = /[\u0000-\u001f\u007f]/
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function rowId(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number'
    ? `${typeof value}:${value}`
    : undefined
}

export function isAssociationPageKey(
  value: unknown,
): value is AssociationPageKey {
  return (
    typeof value === 'string' &&
    associationPageKeys.includes(value as AssociationPageKey)
  )
}

export function assignContactIds(
  contacts: AssociationContact[] | undefined,
  originalContacts: AssociationContact[] | undefined,
  generateId: () => string = randomUUID,
): AssociationContact[] {
  const originalByRowId = new Map(
    (originalContacts ?? [])
      .map((contact) => [rowId(contact.id), contact] as const)
      .filter(
        (entry): entry is readonly [string, AssociationContact] =>
          entry[0] !== undefined,
      ),
  )
  const reservedIds = new Set(
    (originalContacts ?? [])
      .map((contact) => contact.contactId)
      .filter(
        (contactId): contactId is string => typeof contactId === 'string',
      ),
  )

  return (contacts ?? []).map((contact) => {
    const key = rowId(contact.id)
    const original = key === undefined ? undefined : originalByRowId.get(key)
    if (original) {
      if (
        contact.contactId !== undefined &&
        contact.contactId !== original.contactId
      ) {
        throw new Error('Existing contactId cannot be changed')
      }
      return { ...contact, contactId: original.contactId }
    }

    for (let attempt = 0; attempt < 16; attempt += 1) {
      const contactId = generateId()
      if (uuid.test(contactId) && !reservedIds.has(contactId)) {
        reservedIds.add(contactId)
        return { ...contact, contactId }
      }
    }
    throw new Error('Unable to allocate a unique contactId')
  })
}

function string(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function requirePublicText(value: unknown, field: string, max: number): string {
  const result = string(value)
  if (!result || result.length > max || controlCharacters.test(result)) {
    throw new Error(`Invalid public contact ${field}`)
  }
  return result
}

function optionalPublicText(value: unknown, max: number): null | string {
  if (value == null) return null
  const result = string(value)
  if (!result) return null
  if (result.length > max || controlCharacters.test(result)) {
    throw new Error('Invalid public contact note')
  }
  return result
}

function validateOptionalStoredText(
  value: unknown,
  field: string,
  max: number,
): void {
  if (value == null) return
  if (typeof value !== 'string' || value.length > max) {
    throw new Error(`Invalid contact ${field}`)
  }
}

export function validateAssociationContacts(
  contacts: AssociationContact[] | undefined,
): asserts contacts is ValidatedAssociationContact[] | undefined {
  const seen = new Set<string>()

  for (const contact of contacts ?? []) {
    if (
      typeof contact.contactId !== 'string' ||
      !uuid.test(contact.contactId) ||
      seen.has(contact.contactId) ||
      !contactTypes.includes(contact.type as ContactType) ||
      typeof contact.isPublic !== 'boolean' ||
      typeof contact.showOnHome !== 'boolean'
    ) {
      throw new Error('Invalid contact identity or type')
    }
    seen.add(contact.contactId)

    validateOptionalStoredText(contact.label, 'label', 60)
    validateOptionalStoredText(contact.value, 'value', 200)
    validateOptionalStoredText(contact.note, 'note', 160)
  }
}

export function validateAndMapPublicContacts(
  contacts: AssociationContact[] | undefined,
): PublicContact[] {
  const result: PublicContact[] = []

  validateAssociationContacts(contacts)

  for (const contact of contacts ?? []) {
    if (contact.showOnHome && !contact.isPublic) {
      throw new Error('A contact shown on the home page must be public')
    }
    if (!contact.isPublic) continue

    const label = requirePublicText(contact.label, 'label', 60)
    const value = requirePublicText(contact.value, 'value', 200)
    const note = optionalPublicText(contact.note, 160)
    const base = {
      contactId: contact.contactId,
      label,
      note,
      showOnHome: contact.showOnHome,
      type: contact.type as ContactType,
      value,
    }

    switch (contact.type) {
      case 'email':
        if (
          /[,;?#/\\\s]/.test(value) ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ) {
          throw new Error('Invalid public email value')
        }
        result.push({ ...base, href: `mailto:${value}` })
        break
      case 'phone': {
        if (!/^\+?[0-9 ()-]+$/.test(value)) {
          throw new Error('Invalid public phone value')
        }
        const normalized = value.replace(/[ ()-]/g, '')
        if (!/^\+?[0-9]{5,20}$/.test(normalized)) {
          throw new Error('Invalid public phone value')
        }
        result.push({ ...base, href: `tel:${normalized}` })
        break
      }
      case 'qq':
        if (!/^\d{5,12}$/.test(value))
          throw new Error('Invalid public QQ value')
        result.push(base)
        break
      case 'wechat':
        if (!/^[A-Za-z0-9_.-]{5,32}$/.test(value)) {
          throw new Error('Invalid public WeChat value')
        }
        result.push(base)
        break
      case 'other':
        result.push(base)
        break
    }
  }

  return result
}
