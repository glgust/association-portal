import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

type HomeStatusComponent = (props: {
  outcome:
    | { status: 'not-found' }
    | { requestId: string; status: 'unavailable' }
}) => ReactNode

let HomeStatus: HomeStatusComponent

beforeAll(async () => {
  const pageModulePath: string = pathToFileURL(
    resolve(process.cwd(), '../web/src/app/page.tsx'),
  ).href
  const pageModule = (await import(pageModulePath)) as {
    HomeStatus: HomeStatusComponent
  }
  HomeStatus = pageModule.HomeStatus
})

describe('home page service states', () => {
  it('explains an unpublished or missing home without calling it unavailable', () => {
    const markup = renderToStaticMarkup(
      HomeStatus({ outcome: { status: 'not-found' } }),
    )
    expect(markup).toContain('首页尚未配置或尚未发布')
    expect(markup).toContain('请由内容管理员在 CMS 中创建首页')
    expect(markup).not.toContain('首页暂时无法载入')
  })

  it('preserves requestId for CMS timeout, unreachable, or malformed responses', () => {
    const markup = renderToStaticMarkup(
      HomeStatus({
        outcome: {
          requestId: 'fictional-request-id',
          status: 'unavailable',
        },
      }),
    )
    expect(markup).toContain('首页暂时无法载入')
    expect(markup).toContain('请求编号：fictional-request-id')
    expect(markup).not.toContain('首页尚未配置或尚未发布')
  })
})
