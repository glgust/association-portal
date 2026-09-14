import { formSchema } from '@ascnucc/contracts'
import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
} from 'payload'

import { hashFormSchema } from './schema-hash'

export const validateDraftSchema: CollectionBeforeChangeHook = ({ data }) => {
  formSchema.parse(data.draftSchema)
  return data
}

export const protectFormVersion: CollectionBeforeChangeHook = ({
  data,
  operation,
}) => {
  if (operation === 'update')
    throw new Error('Published FormVersion records are immutable')

  const schema = formSchema.parse(data.schema)
  const expectedHash = hashFormSchema(schema)
  if (data.schemaHash && data.schemaHash !== expectedHash) {
    throw new Error('FormVersion schemaHash does not match its schema')
  }

  return { ...data, schema, schemaHash: expectedHash }
}

export const preventFormVersionDelete: CollectionBeforeDeleteHook = () => {
  throw new Error('Published FormVersion records cannot be deleted')
}
