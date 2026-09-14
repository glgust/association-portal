import type { Field } from 'payload'

import { contactTypes } from '../domain'

export const contactFields: Field = {
  name: 'contacts',
  type: 'array',
  maxRows: 10,
  fields: [
    {
      name: 'type',
      type: 'select',
      options: [...contactTypes],
      required: true,
    },
    { name: 'label', type: 'text', maxLength: 60 },
    { name: 'value', type: 'text', maxLength: 200, required: true },
    {
      name: 'isPrimary',
      type: 'checkbox',
      defaultValue: false,
      required: true,
    },
  ],
}
