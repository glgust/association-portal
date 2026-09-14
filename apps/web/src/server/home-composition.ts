import type {
  PublicAnnouncementPage,
  PublicAssociationContact,
  PublicAssociationContactPage,
} from '@ascnucc/contracts'

import {
  AssociationPageNotFoundError,
  AssociationPageUnavailableError,
} from './association-page-errors'

export type ContactSection =
  | { contacts: PublicAssociationContact[]; status: 'ready' }
  | { status: 'empty' | 'not-published' }
  | { requestId?: string; status: 'unavailable' }

export type AnnouncementSection =
  | { page: PublicAnnouncementPage; status: 'ready' }
  | { status: 'empty' }
  | { status: 'unavailable' }

export type HomeSectionsData = {
  announcements: AnnouncementSection
  contacts: ContactSection
}

export type HomeSectionDependencies = {
  loadAnnouncements: () => Promise<PublicAnnouncementPage>
  loadContacts: () => Promise<PublicAssociationContactPage>
}

/** Pure, injectable boundary: dependencies must return already parsed public DTOs. */
export async function composeHomeSections(
  dependencies: HomeSectionDependencies,
): Promise<HomeSectionsData> {
  const [contacts, announcements] = await Promise.allSettled([
    dependencies.loadContacts(),
    dependencies.loadAnnouncements(),
  ])

  return {
    announcements: mapAnnouncements(announcements),
    contacts: mapContacts(contacts),
  }
}

function mapContacts(
  result: PromiseSettledResult<PublicAssociationContactPage>,
): ContactSection {
  if (result.status === 'rejected') {
    if (result.reason instanceof AssociationPageNotFoundError) {
      return { status: 'not-published' }
    }
    return {
      requestId:
        result.reason instanceof AssociationPageUnavailableError
          ? result.reason.requestId
          : undefined,
      status: 'unavailable',
    }
  }

  const contacts = result.value.contacts
    .filter((contact) => contact.showOnHome)
    .slice(0, 3)
  return contacts.length > 0
    ? { contacts, status: 'ready' }
    : { status: 'empty' }
}

function mapAnnouncements(
  result: PromiseSettledResult<PublicAnnouncementPage>,
): AnnouncementSection {
  if (result.status === 'rejected') return { status: 'unavailable' }
  const items = result.value.items.slice(0, 3)
  return items.length > 0
    ? { page: { ...result.value, items }, status: 'ready' }
    : { status: 'empty' }
}
