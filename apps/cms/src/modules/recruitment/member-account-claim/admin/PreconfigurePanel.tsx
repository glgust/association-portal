'use client'

import { useState } from 'react'

import { adminClaimApi } from './schemas'
import styles from './member-claim-admin.module.css'
import {
  permissionLabel,
  permissionUsage,
} from '@/modules/admin-experience/permission-copy'

type OverrideDraft = {
  effect: 'allow' | 'deny'
  permission: string
  reason: string
  recruitmentCycleId: string
  scopeType: 'global' | 'recruitmentCycle'
}

const emptyOverride = (permission: string): OverrideDraft => ({
  effect: 'allow',
  permission,
  reason: '',
  recruitmentCycleId: '',
  scopeType: 'global',
})

export function PreconfigurePanel({
  permissionOptions,
}: {
  permissionOptions: readonly string[]
}) {
  const [mode, setMode] = useState<'create' | 'existing'>('existing')
  const [memberId, setMemberId] = useState('')
  const [name, setName] = useState('')
  const [studentNumber, setStudentNumber] = useState('')
  const [membershipIdentity, setMembershipIdentity] = useState<
    'cadre' | 'member' | 'staff'
  >('member')
  const [major, setMajor] = useState('')
  const [contactType, setContactType] = useState<
    'other' | 'phone' | 'qq' | 'wechat'
  >('phone')
  const [contactLabel, setContactLabel] = useState('')
  const [contactValue, setContactValue] = useState('')
  const [role, setRole] = useState<'member' | 'staff' | 'cadre'>('member')
  const [overrides, setOverrides] = useState<OverrideDraft[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)

  function patchOverride(index: number, patch: Partial<OverrideDraft>) {
    setOverrides((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      ),
    )
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setFeedback('')
    const member =
      mode === 'existing'
        ? { memberId, mode: 'existing' as const }
        : {
            mode: 'create' as const,
            offlineInterviewConfirmed: true as const,
            profile: {
              contacts: [
                {
                  isPrimary: true,
                  label: contactType === 'other' ? contactLabel : null,
                  type: contactType,
                  value: contactValue,
                },
              ],
              major: major || null,
              membershipIdentity,
              name,
              source: 'offlineInterview' as const,
              studentNumber,
            },
          }
    try {
      const response = await fetch(adminClaimApi.preconfigure, {
        body: JSON.stringify({
          member,
          overrides: overrides.map((entry) => ({
            effect: entry.effect,
            expiresAt: null,
            permission: entry.permission,
            reason: entry.reason,
            recruitmentCycleId:
              entry.scopeType === 'recruitmentCycle'
                ? entry.recruitmentCycleId
                : null,
            scopeType: entry.scopeType,
          })),
          role,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body?.message ?? body?.error?.message ?? '预配置失败。')
      }
      setFeedback(
        '待认领账号及个人权限差异已原子预配置；本步骤不会签发临时凭证。请让会员从公开认领入口自行设置正式密码。',
      )
      setMemberId('')
      setConfirmed(false)
      setOverrides([])
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '预配置失败。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="preconfigure-title">
      <h2 id="preconfigure-title">预配置待认领账号</h2>
      <p>选择完整的正式 Member，或明确确认线下面试已经通过后新建。</p>
      <form onSubmit={submit}>
        <fieldset>
          <legend>Member 来源</legend>
          <label>
            <input
              checked={mode === 'existing'}
              name="member-mode"
              onChange={() => setMode('existing')}
              type="radio"
            />
            关联既有正式 Member
          </label>
          <label>
            <input
              checked={mode === 'create'}
              name="member-mode"
              onChange={() => setMode('create')}
              type="radio"
            />
            线下面试通过并新建 Member
          </label>
        </fieldset>
        {mode === 'existing' ? (
          <label>
            已确认 Member ID
            <input
              required
              value={memberId}
              onChange={(event) => setMemberId(event.target.value)}
            />
          </label>
        ) : (
          <fieldset>
            <legend>正式 Member 资料</legend>
            <label>
              姓名
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              学号
              <input
                inputMode="numeric"
                required
                value={studentNumber}
                onChange={(event) => setStudentNumber(event.target.value)}
              />
            </label>
            <label>
              协会身份
              <select
                value={membershipIdentity}
                onChange={(event) => {
                  const next = event.target.value as typeof membershipIdentity
                  setMembershipIdentity(next)
                  setRole(next)
                }}
              >
                <option value="member">member</option>
                <option value="staff">staff</option>
                <option value="cadre">cadre</option>
              </select>
            </label>
            <label>
              专业（适用时）
              <input
                value={major}
                onChange={(event) => setMajor(event.target.value)}
              />
            </label>
            <label>
              主要联系方式类型
              <select
                value={contactType}
                onChange={(event) =>
                  setContactType(event.target.value as typeof contactType)
                }
              >
                <option value="phone">电话</option>
                <option value="wechat">微信</option>
                <option value="qq">QQ</option>
                <option value="other">其他</option>
              </select>
            </label>
            {contactType === 'other' ? (
              <label>
                联系方式标签
                <input
                  required
                  value={contactLabel}
                  onChange={(event) => setContactLabel(event.target.value)}
                />
              </label>
            ) : null}
            <label>
              联系方式值
              <input
                required
                value={contactValue}
                onChange={(event) => setContactValue(event.target.value)}
              />
            </label>
          </fieldset>
        )}
        <label>
          目标角色
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as typeof role)}
          >
            <option value="member">member（无默认业务权限）</option>
            <option value="staff">staff</option>
            <option value="cadre">cadre</option>
          </select>
        </label>
        <fieldset>
          <legend>个人权限差异（可选）</legend>
          {overrides.map((entry, index) => (
            <section className={styles.overrideEditor} key={index}>
              <div className={styles.field}>
                <label htmlFor={`preconfigure-permission-${index}`}>权限</label>
                <select
                  aria-describedby={`preconfigure-permission-help-${index}`}
                  id={`preconfigure-permission-${index}`}
                  value={entry.permission}
                  onChange={(event) =>
                    patchOverride(index, { permission: event.target.value })
                  }
                >
                  {permissionOptions.map((permission) => (
                    <option key={permission} value={permission}>
                      {permissionLabel(permission)}
                    </option>
                  ))}
                </select>
                <small id={`preconfigure-permission-help-${index}`}>
                  {permissionUsage(entry.permission)}
                </small>
              </div>
              <div className={styles.field}>
                <label htmlFor={`preconfigure-effect-${index}`}>效果</label>
                <select
                  aria-describedby={`preconfigure-effect-help-${index}`}
                  id={`preconfigure-effect-${index}`}
                  value={entry.effect}
                  onChange={(event) =>
                    patchOverride(index, {
                      effect: event.target.value as OverrideDraft['effect'],
                    })
                  }
                >
                  <option value="allow">允许</option>
                  <option value="deny">拒绝</option>
                </select>
                <small id={`preconfigure-effect-help-${index}`}>
                  允许会增加能力；拒绝优先于默认权限和允许覆盖。
                </small>
              </div>
              <div className={styles.field}>
                <label htmlFor={`preconfigure-scope-${index}`}>范围</label>
                <select
                  aria-describedby={`preconfigure-scope-help-${index}`}
                  id={`preconfigure-scope-${index}`}
                  value={entry.scopeType}
                  onChange={(event) =>
                    patchOverride(index, {
                      scopeType: event.target
                        .value as OverrideDraft['scopeType'],
                    })
                  }
                >
                  <option value="global">全局</option>
                  <option value="recruitmentCycle">指定招新届次</option>
                </select>
                <small id={`preconfigure-scope-help-${index}`}>
                  全局作用于全部记录；指定招新届次只作用于填写的届次 ID。
                </small>
              </div>
              {entry.scopeType === 'recruitmentCycle' ? (
                <label>
                  招新届次 ID
                  <input
                    required
                    value={entry.recruitmentCycleId}
                    onChange={(event) =>
                      patchOverride(index, {
                        recruitmentCycleId: event.target.value,
                      })
                    }
                  />
                </label>
              ) : null}
              <label>
                原因
                <input
                  required
                  value={entry.reason}
                  onChange={(event) =>
                    patchOverride(index, { reason: event.target.value })
                  }
                />
              </label>
              <button
                onClick={() =>
                  setOverrides((current) =>
                    current.filter((_, entryIndex) => entryIndex !== index),
                  )
                }
                type="button"
              >
                移除此差异
              </button>
            </section>
          ))}
          <button
            disabled={permissionOptions.length === 0}
            onClick={() =>
              setOverrides((current) => [
                ...current,
                emptyOverride(permissionOptions[0] ?? ''),
              ])
            }
            type="button"
          >
            添加权限差异
          </button>
        </fieldset>
        <label className={styles.warning}>
          <input
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            required
            type="checkbox"
          />
          我已核对该人员已通过线下面试或正式人工确认。
        </label>
        <button disabled={busy || !confirmed} type="submit">
          {busy ? '处理中…' : '建立 pendingClaim 账号'}
        </button>
      </form>
      <p aria-live="polite">{feedback}</p>
    </section>
  )
}
