import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Only a quick sift: no session cookie, no page. It does not ask the database, so a cookie of an ended session
// passes here, and the page or the action then sends the person to the login page (requireUserId).
// The real check of who is asking is in the code that reads data, never here
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Open to everybody: the login pages, the login API (its link in the email), the health check for smoke tests,
  // and the files of the app itself
  matcher: ["/((?!login|api/auth|health|_next/static|_next/image|favicon.ico).*)"],
};
