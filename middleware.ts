import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher(['/api/internal/(.*)', '/api/health'])

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://next-flow-frontend.vercel.app',
]

const CORS_HEADERS = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods':     'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers':     'Content-Type,Authorization',
}

function getCorsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return { ...CORS_HEADERS, 'Access-Control-Allow-Origin': allowed }
}

export default clerkMiddleware(async (auth, request) => {
  const origin = request.headers.get('origin')
  const cors = getCorsHeaders(origin)

  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: cors })
  }

  if (!isPublicRoute(request)) {
    await auth.protect()
  }

  const res = NextResponse.next()
  Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v))
  return res
}, {
  authorizedParties: ['http://localhost:3000', 'https://next-flow-frontend.vercel.app'],
})

export const config = {
  matcher: ['/api/(.*)'],
}
