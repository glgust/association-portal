import { AuthenticationError } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { AuthUsers } from '@/collections/AuthUsers'
import {
  sanitizePayloadLogObject,
  staleLoginErrorCategory,
  staleLoginLogEvent,
} from '@/modules/identity-access/stale-login-logging'

describe('AuthUser protected fields', () => {
  it.each(['role', 'accessExpiresAt'])('prevents self-updating %s', (name) => {
    const field = AuthUsers.fields.find(
      (candidate) => 'name' in candidate && candidate.name === name,
    )
    expect(field && 'access' in field && field.access?.update).toBeTypeOf(
      'function',
    )
    if (!field || !('access' in field) || !field.access?.update) return
    expect(field.access.update({} as never)).toBe(false)
  })
})

describe('AuthUser login state boundary', () => {
  const beforeLogin = AuthUsers.hooks?.beforeLogin?.[0]

  function runBeforeLogin(input: {
    activation?: boolean
    expiresAt?: string | null
    status:
      | 'active'
      | 'claimBlocked'
      | 'disabled'
      | 'pendingActivation'
      | 'pendingApproval'
      | 'pendingClaim'
  }) {
    if (typeof beforeLogin !== 'function') {
      throw new Error('AuthUser beforeLogin hook is not registered')
    }
    return beforeLogin({
      collection: AuthUsers,
      context: {},
      req: {
        context: { identityActivationLogin: input.activation === true },
        t: ((key: string) => key) as never,
      },
      user: {
        status: input.status,
        temporaryCredentialExpiresAt: input.expiresAt,
      },
    } as never)
  }

  it('allows active accounts only through ordinary login mode', () => {
    expect(runBeforeLogin({ status: 'active' })).toMatchObject({
      status: 'active',
    })
    expect(() =>
      runBeforeLogin({ activation: true, status: 'active' }),
    ).toThrow(AuthenticationError)
  })

  it('allows activation only for pending accounts with an unexpired credential', () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    const past = new Date(Date.now() - 60_000).toISOString()

    expect(
      runBeforeLogin({
        activation: true,
        expiresAt: future,
        status: 'pendingActivation',
      }),
    ).toMatchObject({ status: 'pendingActivation' })
    expect(() =>
      runBeforeLogin({ expiresAt: future, status: 'pendingActivation' }),
    ).toThrow(AuthenticationError)
    expect(() =>
      runBeforeLogin({
        activation: true,
        expiresAt: past,
        status: 'pendingActivation',
      }),
    ).toThrow(AuthenticationError)
    expect(() =>
      runBeforeLogin({
        activation: true,
        expiresAt: future,
        status: 'disabled',
      }),
    ).toThrow(AuthenticationError)
  })

  it.each(['pendingClaim', 'pendingApproval', 'claimBlocked'] as const)(
    'rejects ordinary and activation login for %s accounts',
    (status) => {
      const future = new Date(Date.now() + 60_000).toISOString()
      expect(() => runBeforeLogin({ expiresAt: future, status })).toThrow(
        AuthenticationError,
      )
      expect(() =>
        runBeforeLogin({ activation: true, expiresAt: future, status }),
      ).toThrow(AuthenticationError)
    },
  )
})

describe('AuthUser stale-login server log boundary', () => {
  const sensitiveValues = [
    'fictional-hash-r3',
    'fictional-salt-r3',
    'fictional-session-r3',
    'fictional-token-r3',
    'fictional-temporary-credential-r3',
    'fictional-login-r3',
  ]

  function staleLoginError(): Error {
    const databaseError = Object.assign(
      new Error('M009_AUTH_USER_STALE_WRITE'),
      {
        code: '40001',
        parameters: sensitiveValues,
        query: 'update auth_users set hash = $1, salt = $2, sessions = $3',
      },
    )
    return Object.assign(new Error('Failed query with sensitive parameters'), {
      cause: databaseError,
    })
  }

  it('replaces the exact stale-write logger object without retaining the Error or SQL parameters', () => {
    const sanitized = sanitizePayloadLogObject({ err: staleLoginError() })
    expect(sanitized).toEqual({
      errorCategory: staleLoginErrorCategory,
      event: staleLoginLogEvent,
    })
    const serialized = JSON.stringify(sanitized)
    expect(serialized).not.toContain('M009_AUTH_USER_STALE_WRITE')
    expect(serialized).not.toContain('update auth_users')
    for (const value of sensitiveValues) expect(serialized).not.toContain(value)
  })

  it('preserves unrelated Payload error log objects', () => {
    const unrelated = {
      err: Object.assign(new Error('unrelated serialization failure'), {
        code: '40001',
      }),
    }
    expect(sanitizePayloadLogObject(unrelated)).toBe(unrelated)
  })

  it('logs only a correlated safe event before returning the fixed login response', () => {
    const afterError = AuthUsers.hooks?.afterError?.[0]
    if (typeof afterError !== 'function') {
      throw new Error('AuthUser afterError hook is not registered')
    }
    const warn = vi.fn()
    const result = afterError({
      collection: AuthUsers,
      context: {},
      error: staleLoginError(),
      req: {
        headers: new Headers({ 'x-request-id': 'r3-log-correlation' }),
        method: 'POST',
        payload: { logger: { warn } },
        url: 'http://127.0.0.1/api/auth-users/login',
      },
      result: {},
    } as never)

    expect(warn).toHaveBeenCalledExactlyOnceWith({
      errorCategory: staleLoginErrorCategory,
      event: staleLoginLogEvent,
      requestId: 'r3-log-correlation',
    })
    expect(result).toEqual({
      response: { errors: [{ message: 'Authentication failed' }] },
      status: 401,
    })
    const serializedLog = JSON.stringify(warn.mock.calls)
    expect(serializedLog).not.toContain('M009_AUTH_USER_STALE_WRITE')
    expect(serializedLog).not.toContain('update auth_users')
    for (const value of sensitiveValues) {
      expect(serializedLog).not.toContain(value)
    }
  })
})

it('does not let authenticated users clear another account lockout through generic unlock', async () => {
  const unlock = AuthUsers.access?.unlock
  expect(unlock).toBeTypeOf('function')
  for (const role of ['member', 'staff', 'owner']) {
    expect(
      await unlock!({
        req: { user: { id: 'caller', role } },
        id: 'other-account',
      } as never),
    ).toBe(false)
  }
})
