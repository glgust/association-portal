import type { CollectionConfig } from 'payload'
import { AuthenticationError } from 'payload'

import {
  allowsIdentityFieldOperation,
  allowsIdentityOperation,
  identityOperations,
} from '@/modules/identity-access/business-context'
import {
  isM009LoginRace,
  logHandledM009LoginRace,
} from '@/modules/identity-access/stale-login-logging'

export const AuthUsers: CollectionConfig = {
  slug: 'auth-users',
  access: {
    create: allowsIdentityOperation(
      identityOperations.createAccount,
      identityOperations.preconfigureClaim,
    ),
    delete: () => false,
    // Lockout recovery uses the existing expiry/account workflow, never Payload's
    // generic unlock endpoint (GHSA-jg8r-5jh2-v2xj).
    unlock: () => false,
    read: ({ req }) =>
      req.user
        ? {
            id: {
              equals: req.user.id,
            },
          }
        : false,
    update: allowsIdentityOperation(
      identityOperations.activate,
      identityOperations.approveClaim,
      identityOperations.convertClaimToDirect,
      identityOperations.disableAccount,
      identityOperations.manageAccount,
      identityOperations.rejectClaim,
      identityOperations.reissueTemporaryCredential,
      identityOperations.reopenClaim,
      identityOperations.resetCredential,
      identityOperations.setOverride,
      identityOperations.submitClaim,
      identityOperations.withdrawClaimConversion,
      identityOperations.selfDisplayName,
      identityOperations.selfPassword,
    ),
  },
  admin: {
    hidden: true,
    useAsTitle: 'username',
  },
  labels: { plural: '认证账号', singular: '认证账号' },
  auth: {
    loginWithUsername: {
      allowEmailLogin: false,
      requireEmail: false,
    },
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
  },
  hooks: {
    afterError: [
      ({ error, req }) => {
        const isLoginRequest =
          req.method === 'POST' &&
          typeof req.url === 'string' &&
          new URL(req.url).pathname.endsWith('/api/auth-users/login')
        if (!isLoginRequest || !isM009LoginRace(error)) return
        logHandledM009LoginRace(req)
        return {
          response: { errors: [{ message: 'Authentication failed' }] },
          status: 401,
        }
      },
    ],
    beforeLogin: [
      ({ req, user }) => {
        const isActivationLogin = req.context.identityActivationLogin === true
        const loginAllowed = isActivationLogin
          ? user.status === 'pendingActivation' &&
            typeof user.temporaryCredentialExpiresAt === 'string' &&
            new Date(user.temporaryCredentialExpiresAt) > new Date()
          : user.status === 'active'
        if (!loginAllowed) throw new AuthenticationError(req.t, true)
        return user
      },
    ],
  },
  fields: [
    {
      name: 'displayName',
      type: 'text',
      required: true,
      validate: (value: null | string | undefined) =>
        typeof value === 'string' &&
        value.trim().length >= 1 &&
        value.trim().length <= 100
          ? true
          : 'Display name must contain 1–100 characters.',
    },
    {
      name: 'accountType',
      type: 'select',
      options: ['student', 'external'],
      required: true,
      defaultValue: 'external',
      access: { update: () => false },
    },
    {
      name: 'studentNumber',
      type: 'text',
      unique: true,
      access: { update: () => false },
    },
    {
      name: 'status',
      type: 'select',
      options: [
        'pendingActivation',
        'pendingClaim',
        'pendingApproval',
        'claimBlocked',
        'active',
        'disabled',
      ],
      required: true,
      defaultValue: 'pendingActivation',
      access: {
        update: allowsIdentityFieldOperation(
          identityOperations.activate,
          identityOperations.approveClaim,
          identityOperations.convertClaimToDirect,
          identityOperations.disableAccount,
          identityOperations.preconfigureClaim,
          identityOperations.rejectClaim,
          identityOperations.reissueTemporaryCredential,
          identityOperations.reopenClaim,
          identityOperations.resetCredential,
          identityOperations.submitClaim,
          identityOperations.withdrawClaimConversion,
        ),
      },
    },
    {
      name: 'role',
      type: 'select',
      access: {
        create: allowsIdentityFieldOperation(
          identityOperations.createAccount,
          identityOperations.preconfigureClaim,
        ),
        update: allowsIdentityFieldOperation(
          identityOperations.manageAccount,
          identityOperations.approveClaim,
        ),
      },
      defaultValue: 'staff',
      options: ['member', 'staff', 'cadre', 'admin', 'owner'],
      required: true,
    },
    {
      name: 'defaultRoleExpiresAt',
      type: 'date',
      access: {
        update: allowsIdentityFieldOperation(
          identityOperations.manageAccount,
          identityOperations.approveClaim,
          identityOperations.convertClaimToDirect,
          identityOperations.withdrawClaimConversion,
        ),
      },
    },
    {
      name: 'temporaryCredentialExpiresAt',
      type: 'date',
      access: {
        update: allowsIdentityFieldOperation(
          identityOperations.activate,
          identityOperations.convertClaimToDirect,
          identityOperations.disableAccount,
          identityOperations.preconfigureClaim,
          identityOperations.rejectClaim,
          identityOperations.reissueTemporaryCredential,
          identityOperations.reopenClaim,
          identityOperations.resetCredential,
          identityOperations.submitClaim,
          identityOperations.withdrawClaimConversion,
        ),
      },
    },
    {
      name: 'recordVersion',
      type: 'number',
      defaultValue: 1,
      required: true,
      access: {
        update: allowsIdentityFieldOperation(
          identityOperations.activate,
          identityOperations.approveClaim,
          identityOperations.convertClaimToDirect,
          identityOperations.withdrawClaimConversion,
          identityOperations.disableAccount,
          identityOperations.manageAccount,
          identityOperations.preconfigureClaim,
          identityOperations.rejectClaim,
          identityOperations.reissueTemporaryCredential,
          identityOperations.reopenClaim,
          identityOperations.resetCredential,
          identityOperations.selfDisplayName,
          identityOperations.selfPassword,
          identityOperations.setOverride,
          identityOperations.submitClaim,
        ),
      },
    },
    {
      name: 'accessExpiresAt',
      type: 'date',
      access: {
        create: allowsIdentityFieldOperation(
          identityOperations.createAccount,
          identityOperations.preconfigureClaim,
        ),
        update: allowsIdentityFieldOperation(
          identityOperations.manageAccount,
          identityOperations.approveClaim,
          identityOperations.convertClaimToDirect,
          identityOperations.withdrawClaimConversion,
        ),
      },
      admin: {
        description: 'Ordinary staff access normally expires after 10 months.',
      },
    },
  ],
}
