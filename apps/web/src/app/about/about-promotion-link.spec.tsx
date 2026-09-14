import { renderToStaticMarkup } from 'react-dom/server'
// @ts-expect-error The CMS Vitest runner supplies the shared test dependency.
import { expect, it } from 'vitest'

import { AboutPromotionLink } from './AboutPromotionLink'
import AboutNotFound from './not-found'

it('links to the local contact page', () => {
  const html = renderToStaticMarkup(<AboutPromotionLink />)
  expect(html).toContain('href="/contact"')
  expect(html).toContain('联系协会，了解参与方式')
})

it('keeps the contact entry available without publishing the about page', () => {
  const html = renderToStaticMarkup(<AboutNotFound />)
  expect(html).toContain('协会介绍尚未公开')
  expect(html).toContain('href="/contact"')
  expect(html).toContain('返回首页')
})
