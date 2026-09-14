'use client'

import { useField } from '@payloadcms/ui'
import type { RelationshipFieldClientComponent } from 'payload'
import { useEffect, useId, useState } from 'react'

type Candidate = {
  displayName: null | string
  id: string
  statusHint: 'penNameRequired' | 'ready'
}

function relationId(value: unknown): string {
  if (typeof value === 'string') return value
  if (
    value &&
    typeof value === 'object' &&
    'id' in value &&
    typeof value.id === 'string'
  ) {
    return value.id
  }
  return ''
}

function isCandidate(value: unknown): value is Candidate {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'id' in value &&
      typeof value.id === 'string' &&
      'displayName' in value &&
      (value.displayName === null || typeof value.displayName === 'string') &&
      'statusHint' in value &&
      (value.statusHint === 'ready' || value.statusHint === 'penNameRequired'),
  )
}

export const GalleryAuthorField: RelationshipFieldClientComponent = ({
  field,
  path,
}) => {
  const { errorMessage, setValue, showError, value } = useField<unknown>({
    path,
  })
  const { value: penName } = useField<unknown>({
    path: path.replace(/author$/, 'penName'),
  })
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [hasNextPage, setHasNextPage] = useState(false)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchDraft, setSearchDraft] = useState('')
  const [requestRevision, setRequestRevision] = useState(0)
  const [loadState, setLoadState] = useState<'error' | 'loading' | 'ready'>(
    'loading',
  )
  const [preview, setPreview] = useState<
    | { authorName: string; status: 'ready' }
    | { status: 'idle' | 'invalid' | 'loading' }
  >({ status: 'idle' })
  const generatedId = useId()
  const inputId = `gallery-author-${generatedId.replaceAll(':', '')}`

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ page: String(page) })
    if (search) params.set('q', search)
    void fetch(`/api/v1/admin/gallery-authors?${params}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('author candidates unavailable')
        const body: unknown = await response.json()
        if (
          !body ||
          typeof body !== 'object' ||
          !('items' in body) ||
          !Array.isArray(body.items) ||
          !body.items.every(isCandidate) ||
          !('hasNextPage' in body) ||
          typeof body.hasNextPage !== 'boolean' ||
          !('page' in body) ||
          body.page !== page
        ) {
          throw new Error('invalid author candidates')
        }
        const items = body.items as Candidate[]
        setCandidates((current) =>
          page === 1
            ? items
            : [
                ...current,
                ...items.filter(
                  (item) =>
                    !current.some((candidate) => candidate.id === item.id),
                ),
              ],
        )
        setHasNextPage(body.hasNextPage)
        setLoadState('ready')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoadState('error')
      })
    return () => controller.abort()
  }, [page, requestRevision, search])

  const selectedId = relationId(value)

  useEffect(() => {
    if (!selectedId) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setPreview({ status: 'loading' })
      void fetch('/api/v1/admin/gallery-authors', {
        body: JSON.stringify({
          authorId: selectedId,
          penName: typeof penName === 'string' ? penName : null,
        }),
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('author preview unavailable')
          const body: unknown = await response.json()
          if (
            body &&
            typeof body === 'object' &&
            'status' in body &&
            body.status === 'ready' &&
            'authorName' in body &&
            typeof body.authorName === 'string'
          ) {
            setPreview({ authorName: body.authorName, status: 'ready' })
            return
          }
          if (
            body &&
            typeof body === 'object' &&
            'status' in body &&
            body.status === 'invalid'
          ) {
            setPreview({ status: 'invalid' })
            return
          }
          throw new Error('invalid author preview')
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError')
            return
          setPreview({ status: 'invalid' })
        })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [penName, selectedId])

  function submitSearch() {
    setLoadState('loading')
    setPage(1)
    setSearch(searchDraft)
    setRequestRevision((current) => current + 1)
  }

  const previewText = !selectedId
    ? '请选择作者后由服务端确认发布署名。'
    : preview.status === 'ready'
      ? `服务端确认的本次发布署名：${preview.authorName}`
      : preview.status === 'loading'
        ? '正在由服务端校验发布署名…'
        : preview.status === 'invalid'
          ? '当前署名不能发布，请填写安全笔名或更换作者。'
          : '请选择作者后由服务端确认发布署名。'
  return (
    <div className="field-type relationship">
      <div>
        <label htmlFor={`${inputId}-search`}>搜索作者显示名</label>
        <input
          id={`${inputId}-search`}
          maxLength={100}
          onChange={(event) => setSearchDraft(event.target.value)}
          type="search"
          value={searchDraft}
        />
        <button
          disabled={loadState === 'loading'}
          onClick={submitSearch}
          type="button"
        >
          搜索作者
        </button>
      </div>
      <label htmlFor={inputId}>内部作者追溯</label>
      <select
        aria-describedby={`${inputId}-description`}
        aria-invalid={showError || undefined}
        disabled={loadState !== 'ready' || field.admin?.readOnly === true}
        id={inputId}
        onChange={(event) => setValue(event.target.value || null)}
        required={field.required}
        value={selectedId}
      >
        <option value="">
          {loadState === 'loading' ? '正在加载作者候选…' : '请选择作者'}
        </option>
        {selectedId &&
        !candidates.some((candidate) => candidate.id === selectedId) ? (
          <option value={selectedId}>当前作者（可保留或改为本人）</option>
        ) : null}
        {candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.displayName ?? '该账号需填写安全笔名'}
            {candidate.statusHint === 'penNameRequired' ? '（需笔名）' : ''}
          </option>
        ))}
      </select>
      {loadState === 'ready' && hasNextPage ? (
        <button
          onClick={() => {
            setLoadState('loading')
            setPage((current) => current + 1)
          }}
          type="button"
        >
          加载更多作者
        </button>
      ) : null}
      <p id={`${inputId}-description`}>
        默认当前操作者；账号管理员可以选择其他内部账号。公开页面只使用发布时署名快照。
      </p>
      <p aria-live="polite">{previewText}</p>
      {loadState === 'error' ? (
        <p aria-live="polite">作者候选暂时不可用，请稍后重试。</p>
      ) : null}
      {showError && errorMessage ? <p role="alert">{errorMessage}</p> : null}
    </div>
  )
}
