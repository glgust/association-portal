import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const rawSlug = (await params).slug
  let slug = rawSlug

  try {
    slug = decodeURIComponent(rawSlug)
  } catch {
    // Preserve malformed legacy paths as inert query data on the archive page.
  }

  const destination = new URL('/announcements', request.url)
  destination.searchParams.set('open', slug)

  return NextResponse.redirect(destination, 307)
}
