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

export const AccountClaims: CollectionConfig = {
  slug: 'account-claims',
  access: {
    create: allowsMemberAccountClaimOperation(
      memberAccountClaimOperations.submitClaim,
    ),
    delete: denyAll,
    read: allowsMemberAccountClaimOperation(
      memberAccountClaimOperations.readQueue,
      memberAccountClaimOperations.approveClaim,
      memberAccountClaimOperations.rejectClaim,
      memberAccountClaimOperations.convertClaimToDirect,
      memberAccountClaimOperations.disableClaim,
      memberAccountClaimOperations.readStatus,
      memberAccountClaimOperations.reissueStatusReceipt,
      memberAccountClaimOperations.updatePublicMessage,
      memberAccountClaimOperations.withdrawClaimConversion,
    ),
    update: allowsMemberAccountClaimOperation(
      memberAccountClaimOperations.approveClaim,
      memberAccountClaimOperations.rejectClaim,
      memberAccountClaimOperations.convertClaimToDirect,
      memberAccountClaimOperations.disableClaim,
      memberAccountClaimOperations.reopenClaim,
      memberAccountClaimOperations.reissueStatusReceipt,
      memberAccountClaimOperations.updatePublicMessage,
      memberAccountClaimOperations.withdrawClaimConversion,
    ),
  },
  admin: { hidden: true, useAsTitle: 'id' },
  labels: { plural: '账号认领记录', singular: '账号认领记录' },
  fields: [
    {
      name: 'member',
      type: 'relationship',
      index: true,
      relationTo: 'members',
      required: true,
    },
    {
      name: 'authUser',
      type: 'relationship',
      index: true,
      relationTo: 'auth-users',
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pendingReview',
      index: true,
      options: [...applicationReviewStatuses],
      required: true,
    },
    {
      name: 'applicantIdentity',
      type: 'select',
      options: [...membershipIdentities],
      required: true,
    },
    contactFields,
    { name: 'major', type: 'text', maxLength: 120 },
    {
      name: 'idempotencyKey',
      type: 'text',
      index: true,
      required: true,
      unique: true,
    },
    { name: 'requestFingerprint', type: 'text', required: true },
    {
      name: 'submittedAuthUserVersion',
      type: 'number',
      min: 1,
      required: true,
    },
    { name: 'authorizationSummary', type: 'json', required: true },
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
    { name: 'convertedAt', type: 'date' },
    { name: 'convertedAccountVersion', type: 'number', min: 1 },
    { name: 'conversionWithdrawnAt', type: 'date' },
    {
      name: 'conversionWithdrawnBy',
      type: 'relationship',
      relationTo: 'auth-users',
    },
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
