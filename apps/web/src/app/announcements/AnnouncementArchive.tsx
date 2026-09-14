'use client'

import type {
  PublicAnnouncementListItem,
  PublicAnnouncementPage,
} from '@ascnucc/contracts'
import Link from 'next/link'
import {
  type CSSProperties,
  type MouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { AnnouncementBody } from './AnnouncementBody'
import { AnnouncementSpectrumWindow } from './AnnouncementSpectrum'
import {
  loadAnnouncementDetail,
  type AnnouncementDetailResult,
} from './actions'
import { generateAnnouncementSpectrum, spectrumPosition } from './spectrum'

type DetailState = AnnouncementDetailResult | { status: 'loading' }

type ArchiveRow =
  | { count: number; entryIndex: number; key: string; kind: 'month' }
  | {
      entryIndex: number
      item: PublicAnnouncementListItem
      itemIndex: number
      kind: 'announcement'
      number: number
    }

export function AnnouncementArchive({
  initialOpenSlug,
  page,
}: {
  initialOpenSlug?: string
  page: PublicAnnouncementPage
}) {
  const { groups, rows } = useMemo(() => buildArchive(page), [page])
  const initialOpen = page.items.some(({ slug }) => slug === initialOpenSlug)
    ? initialOpenSlug
    : undefined
  const [expandedSlugs, setExpandedSlugs] = useState<Set<string>>(
    () => new Set(initialOpen ? [initialOpen] : []),
  )
  const [details, setDetails] = useState<Record<string, DetailState>>(() =>
    initialOpen ? { [initialOpen]: { status: 'loading' } } : {},
  )
  const requestedSlugs = useRef(new Set(initialOpen ? [initialOpen] : []))
  const listRef = useRef<HTMLOListElement>(null)
  const itemRefs = useRef<Array<HTMLLIElement | null>>([])
  const mapMarkRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const mapFrameRef = useRef<HTMLDivElement>(null)

  const updateMap = useCallback(() => {
    const list = listRef.current
    const frame = mapFrameRef.current
    if (!list || !frame || page.items.length === 0) return

    const listTop = absoluteTop(list)
    const listHeight = list.offsetHeight || 1
    itemRefs.current.forEach((item, index) => {
      const mark = mapMarkRefs.current[index]
      if (!item || !mark) return
      mark.style.top = `${((absoluteTop(item) - listTop) / listHeight) * 100}%`
      const rect = item.getBoundingClientRect()
      mark.classList.toggle(
        'visible',
        rect.bottom > 0 && rect.top < window.innerHeight,
      )
    })

    const frameHeight = Math.min(1, window.innerHeight / listHeight)
    const maximumTop = Math.max(0, 1 - frameHeight)
    const frameTop = clamp(
      (window.scrollY - listTop) / listHeight,
      0,
      maximumTop,
    )
    frame.style.top = `${frameTop * 100}%`
    frame.style.height = `${frameHeight * 100}%`
  }, [page.items.length])

  useLayoutEffect(() => {
    let ticking = false
    const scheduleUpdate = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        updateMap()
      })
    }
    const observer = new ResizeObserver(scheduleUpdate)
    if (listRef.current) observer.observe(listRef.current)
    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)
    updateMap()
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
    }
  }, [updateMap])

  const requestDetail = useCallback(async (slug: string) => {
    if (requestedSlugs.current.has(slug)) return
    requestedSlugs.current.add(slug)
    setDetails((current) => ({
      ...current,
      [slug]: { status: 'loading' },
    }))
    const result = await loadAnnouncementDetail(slug)
    setDetails((current) => ({ ...current, [slug]: result }))
  }, [])

  useEffect(() => {
    if (!initialOpen) return
    let active = true
    void loadAnnouncementDetail(initialOpen).then((result) => {
      if (!active) return
      setDetails((current) => ({ ...current, [initialOpen]: result }))
    })
    return () => {
      active = false
    }
  }, [initialOpen])

  function toggleAnnouncement(slug: string) {
    const opening = !expandedSlugs.has(slug)
    setExpandedSlugs((current) => {
      const next = new Set(current)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
    if (opening) void requestDetail(slug)
  }

  function scrollToElement(element: Element, offset = 64) {
    window.scrollTo({
      behavior: reducedMotion() ? 'auto' : 'smooth',
      top: absoluteTop(element) - offset,
    })
  }

  function handleMapStripClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || !listRef.current) return
    const stripRect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientY - stripRect.top) / stripRect.height
    window.scrollTo({
      behavior: reducedMotion() ? 'auto' : 'smooth',
      top:
        absoluteTop(listRef.current) +
        ratio * listRef.current.offsetHeight -
        window.innerHeight * 0.3,
    })
  }

  return (
    <>
      <div className="announcement-layout">
        <div className="announcement-index-rail">
          <nav className="announcement-index-inner" aria-label="按时间索引">
            <p>时间索引</p>
            {groups.map((group) => (
              <a
                href={`#month-${group.key}`}
                key={group.key}
                onClick={(event) => {
                  event.preventDefault()
                  const target = document.getElementById(`month-${group.key}`)
                  if (target) scrollToElement(target)
                }}
              >
                <span>{group.key}</span>
                <span>{twoDigits(group.count)}</span>
              </a>
            ))}
          </nav>
        </div>

        <div className="announcement-content">
          <ol className="announcement-list" ref={listRef}>
            {rows.map((row) => {
              const enterStyle = {
                '--announcement-enter-delay': `${row.entryIndex * 35}ms`,
              } as CSSProperties
              if (row.kind === 'month') {
                return (
                  <li
                    className="announcement-month-divider"
                    id={`month-${row.key}`}
                    key={`month-${row.key}`}
                    style={enterStyle}
                  >
                    <span>{row.key}</span>
                    <span>{twoDigits(row.count)} 条</span>
                  </li>
                )
              }

              const { item, itemIndex, number } = row
              const publication = formatPublication(item.publishedAt)
              const isOpen = expandedSlugs.has(item.slug)
              const detail = details[item.slug]
              const bodyId = `announcement-body-${item.id}`
              return (
                <li
                  className={`announcement-item${isOpen ? ' open' : ''}`}
                  id={`announcement-${item.id}`}
                  key={item.id}
                  ref={(element) => {
                    itemRefs.current[itemIndex] = element
                  }}
                  style={enterStyle}
                >
                  <div className="announcement-item-meta">
                    <span>{twoDigits(number)}</span>
                    <time dateTime={item.publishedAt}>
                      <span>{publication.date}</span>
                      <span>{publication.time}</span>
                    </time>
                  </div>

                  <h2 className="announcement-item-main">
                    <button
                      aria-controls={bodyId}
                      aria-expanded={isOpen}
                      onClick={() => toggleAnnouncement(item.slug)}
                      type="button"
                    >
                      <span className="announcement-item-title">
                        {item.title}
                      </span>
                      {item.summary ? (
                        <span className="announcement-item-summary">
                          {item.summary}
                        </span>
                      ) : null}
                      <span className="announcement-read-cue">
                        {isOpen
                          ? detail?.status === 'loading'
                            ? '载入中'
                            : '收起'
                          : '阅读全文'}
                      </span>
                    </button>
                  </h2>

                  <div
                    aria-hidden="true"
                    className="announcement-item-spectrum"
                  >
                    <AnnouncementSpectrumWindow seed={item.id} />
                  </div>

                  <div className="announcement-inline-body">
                    <div
                      aria-busy={detail?.status === 'loading'}
                      aria-label={item.title}
                      className="announcement-inline-clip"
                      id={bodyId}
                      role="region"
                    >
                      <div
                        aria-hidden="true"
                        className="announcement-inline-wash"
                        style={{ background: buildSpectrumWash(item.id) }}
                      />
                      <div className="announcement-inline-inner">
                        <AnnouncementInlineContent detail={detail} />
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>

          {page.totalPages > 1 ? (
            <nav aria-label="公告分页" className="announcement-pagination">
              {page.page > 1 ? (
                <Link href={`/announcements?page=${page.page - 1}`} rel="prev">
                  ← 上一页
                </Link>
              ) : (
                <span aria-disabled="true">← 上一页</span>
              )}
              <span aria-current="page">
                第 {page.page} 页 / 共 {page.totalPages} 页
              </span>
              {page.hasNextPage ? (
                <Link href={`/announcements?page=${page.page + 1}`} rel="next">
                  下一页 →
                </Link>
              ) : (
                <span aria-disabled="true">下一页 →</span>
              )}
            </nav>
          ) : null}
        </div>

        <div className="announcement-map-rail">
          <div className="announcement-map-inner">
            <div
              aria-label="公告纵向概览"
              className="announcement-map-strip"
              onClick={handleMapStripClick}
            >
              {page.items.map((item, index) => {
                const strongest = strongestLine(item.id)
                return (
                  <a
                    aria-label={`跳到“${item.title}”`}
                    className="announcement-map-mark"
                    href={`#announcement-${item.id}`}
                    key={item.id}
                    onClick={(event) => {
                      event.preventDefault()
                      const target = itemRefs.current[index]
                      if (target) scrollToElement(target, 72)
                    }}
                    ref={(element) => {
                      mapMarkRefs.current[index] = element
                    }}
                    style={
                      {
                        '--announcement-map-color': strongest.color,
                        '--announcement-map-width': `${9 + strongest.intensity * 15}px`,
                      } as CSSProperties
                    }
                  />
                )
              })}
              <div
                aria-hidden="true"
                className="announcement-map-frame"
                ref={mapFrameRef}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function AnnouncementInlineContent({ detail }: { detail?: DetailState }) {
  if (!detail || detail.status === 'loading') {
    return <p className="announcement-inline-state">正在载入正文…</p>
  }
  if (detail.status === 'not-found') {
    return <p className="announcement-inline-state">这篇公告已不可用。</p>
  }
  if (detail.status === 'unavailable') {
    return (
      <div className="announcement-inline-state" role="status">
        <p>正文暂时无法载入，请稍后再试。</p>
        <p>请求编号：{detail.requestId}</p>
      </div>
    )
  }
  return <AnnouncementBody body={detail.data.body} />
}

function buildArchive(page: PublicAnnouncementPage): {
  groups: Array<{ count: number; key: string }>
  rows: ArchiveRow[]
} {
  const groups: Array<{ count: number; key: string }> = []
  for (const item of page.items) {
    const key = formatMonth(item.publishedAt)
    const latest = groups.at(-1)
    if (latest?.key === key) latest.count += 1
    else groups.push({ count: 1, key })
  }

  const rows: ArchiveRow[] = []
  let groupIndex = 0
  page.items.forEach((item, itemIndex) => {
    const key = formatMonth(item.publishedAt)
    const latestRow = rows.at(-1)
    const latestMonth =
      latestRow?.kind === 'month'
        ? latestRow.key
        : formatMonth(page.items[itemIndex - 1]?.publishedAt ?? '')
    if (itemIndex === 0 || latestMonth !== key) {
      rows.push({
        count: groups[groupIndex].count,
        entryIndex: rows.length,
        key,
        kind: 'month',
      })
      groupIndex += 1
    }
    rows.push({
      entryIndex: rows.length,
      item,
      itemIndex,
      kind: 'announcement',
      number: (page.page - 1) * page.pageSize + itemIndex + 1,
    })
  })
  return { groups, rows }
}

function buildSpectrumWash(seed: string): string {
  const continuous =
    'linear-gradient(90deg,rgba(0,0,0,0) 0%,rgba(106,69,232,.075) 6%,rgba(63,107,255,.08) 18%,rgba(47,184,200,.075) 30%,rgba(53,200,106,.075) 44%,rgba(168,206,58,.065) 57%,rgba(232,172,40,.075) 68%,rgba(232,102,30,.075) 79%,rgba(206,32,48,.075) 90%,rgba(0,0,0,0) 100%)'
  const stops = ['rgba(0,0,0,0) 0%']
  for (const line of generateAnnouncementSpectrum(seed)
    .slice()
    .sort((left, right) => left.wavelength - right.wavelength)) {
    const position = spectrumPosition(line.wavelength)
    const halfWidth = 0.3 + line.intensity * 1.1
    stops.push(`rgba(0,0,0,0) ${Math.max(0, position - halfWidth)}%`)
    stops.push(
      `${hexToRgba(line.color, 0.14 + line.intensity * 0.32)} ${position}%`,
    )
    stops.push(`rgba(0,0,0,0) ${Math.min(100, position + halfWidth)}%`)
  }
  stops.push('rgba(0,0,0,0) 100%')
  return `${continuous},linear-gradient(90deg,${stops.join(',')})`
}

function strongestLine(seed: string) {
  return generateAnnouncementSpectrum(seed).reduce((strongest, line) =>
    line.intensity > strongest.intensity ? line : strongest,
  )
}

function hexToRgba(hex: string, alpha: number): string {
  const red = Number.parseInt(hex.slice(1, 3), 16)
  const green = Number.parseInt(hex.slice(3, 5), 16)
  const blue = Number.parseInt(hex.slice(5, 7), 16)
  return `rgba(${red},${green},${blue},${alpha})`
}

function formatMonth(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  }).formatToParts(date)
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`
}

function formatPublication(value: string): { date: string; time: string } {
  const date = new Date(value)
  return {
    date: new Intl.DateTimeFormat('zh-CN', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
    })
      .format(date)
      .replaceAll('/', '-'),
    time: new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
      timeZone: 'Asia/Shanghai',
    }).format(date),
  }
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

function absoluteTop(element: Element): number {
  return element.getBoundingClientRect().top + window.scrollY
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
