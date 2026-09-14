export class AssociationPageNotFoundError extends Error {}

export class AssociationPageUnavailableError extends Error {
  constructor(public readonly requestId = crypto.randomUUID()) {
    super('Association page service unavailable')
  }
}
