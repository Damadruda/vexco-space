import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware() {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/",
    },
  }
);

export const config = {
  matcher: [
    "/inbox",
    "/dashboard",
    "/agile/:path*",
    "/assistant",
    "/discovery",
    "/idea-vault",
    "/project-builder/:path*",
    "/roadmap",
    "/search",
    "/settings",
    "/war-room/:path*",
    "/projects/:path*",
  ],
};
