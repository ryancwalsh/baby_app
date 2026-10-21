import { StatusCodes } from 'http-status-codes';
import { NextResponse } from 'next/server';

import { getEnvironment } from '@/constants/environment';

/**
 * In the cloud role every route that reaches the Nanit answers 404 before its module is ever loaded, so Vercel can never open a socket to the camera — a second socket counts against its connection limit and can lock streaming out for minutes. The worker serves them as before.
 */
export function proxy() {
  return getEnvironment().APP_ROLE === 'cloud' ? new NextResponse(null, { status: StatusCodes.NOT_FOUND }) : NextResponse.next();
}

export const config = {
  matcher: ['/api/worker/:path*', '/api/night-light/:path*', '/api/temperature/:path*', '/api/nanit/:path*'],
};
