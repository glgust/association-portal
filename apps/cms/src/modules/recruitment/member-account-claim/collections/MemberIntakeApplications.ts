import type { CollectionConfig } from 'payload'

import { denyAll } from '@/access/deny-all'

import {
  allowsMemberAccountClaimOperation,
  memberAccountClaimOperations,
} from '../business-context'
import {
  applicationReviewStatuses,
  claimRejectionReasons,
  membershipIdentities,
} from '../domain'
import { contactFields } from './contact-fields'

export const MemberIntakeApplications: CollectionConfig = {
  slug: 'member-intake-applications',
  access: {
    create: allowsMemberAccountClaimOperation(
      memberAccountClaimOperations.submitIntake,
    ),
    delete: denyAll,
    read: allowsMemberAccountClaimOperation(
      memberAccountClaimOperations.readQueue,
      memberAccountClaimOperations.approveIntake,
      memberAccountClaimOperations.rejectIntake,
      memberAccountClaimOperations.readStatus,
      memberAccountClaimOperations.reissueStatusReceipt,
      memberAccountClaimOperations.updatePublicMessage,
    ),
    update: allowsMemberAccountClaimOperation(
      memberAccountClaimOperations.approveIntake,
      memberAccountClaimOperations.rejectIntake,
      memberAccountClaimOperations.reissueStatusReceipt,
      memberAccountClaimOperations.updatePublicMessage,
    ),
  },
  admin: { hidden: true, useAsTitle: 'id' },
  labels: { plural: '人工核验申请', singular: '人工核验申请' },
  fields: [
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pendingReview',
      index: true,
      options: [...applicationReviewStatuses],
      required: true,
    },
    { name: 'name', type: 'text', maxLength: 100 },
    { name: 'studentNumber', type: 'text', index: true },
    {
      name: 'applicantIdentity',
      type: 'select',
      options: [...membershipIdentities],
      required: true,
    },
    contactFields,
    { name: 'major', type: 'text', maxLength: 120 },
    { name: 'privacyPurposeConfirmed', type: 'checkbox' },
    { name: 'member', type: 'relationship', relationTo: 'members' },
    {
      name: 'idempotencyKey',
      type: 'text',
      index: true,
      required: true,
      unique: true,
    },
    { name: 'requestFingerprint', type: 'text', required: true },
    { name: 'submittedAt', type: 'date', index: true, required: true },
    { name: 'reviewedAt', type: 'date' },
    { name: 'reviewedBy', type: 'relationship', relationTo: 'auth-users' },
    { name: 'publicMessage', type: 'textarea', maxLength: 300 },
    { name: 'publicMessageUpdatedAt', type: 'date' },
    {
      name: 'publicMessageUpdatedBy',
      type: 'relationship',
      relationTo: 'auth-users',
    },
    {
      name: 'statusAccessVersion',
      type: 'number',
      defaultValue: 1,
      min: 1,
      required: true,
    },
    { name: 'statusAccessIssuedAt', type: 'date' },
    {
      name: 'rejectionReason',
      type: 'select',
      options: [...claimRejectionReasons],
    },
    { name: 'requestId', type: 'text', index: true, required: true },
    {
      name: 'recordVersion',
      type: 'number',
      defaultValue: 1,
      min: 1,
      required: true,
    },
  ],
}
