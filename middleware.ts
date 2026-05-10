import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher(['/api/internal/(.*)'])

const CORS = {
  'Access-Control-Allow-Origin':      'http://localhost:3000',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods':     'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers':     'Content-Type,Authorization',
}

export default clerkMiddleware(async (auth, request) => {
  // Return CORS headers immediately for preflight — never let Clerk block OPTIONS
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: CORS })
  }

  if (!isPublicRoute(request)) {
    await auth.protect()
  }

  // Attach CORS headers to every actual response
  const res = NextResponse.next()
  Object.entries(CORS).forEach(([k, v]) => res.headers.set(k, v))
  return res
}, {
  authorizedParties: ['http://localhost:3000'],
})

export const config = {
  matcher: ['/api/(.*)'],
}
