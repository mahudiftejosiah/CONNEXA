import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import {
  COOKIE_OPTIONS,
  ROLE_COOKIE,
  VIEW_COOKIE,
  cookieSaysAdmin,
  cookieSaysSite,
  roleCookieValue,
} from "@/lib/adminCookies"

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/about",
  "/privacy",
  "/terms",
  "/help",
  "/contact",
  "/cookies",
  "/search",
  "/api/auth",
]

async function lookUpIsAdmin(userId: string, request: NextRequest) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: () => {},
        },
      }
    )
    const { data } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle()
    return Boolean(data?.is_admin)
  } catch {
    // A hiccup here must never lock anybody out of the site.
    return false
  }
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  )

  // Redirect unauthenticated users away from protected routes
  if (!user && !isPublic && !pathname.startsWith("/_next") && !pathname.startsWith("/api")) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("redirectTo", pathname)
    const res = NextResponse.redirect(url)
    res.cookies.delete(ROLE_COOKIE)
    res.cookies.delete(VIEW_COOKIE)
    return res
  }

  if (user) {
    const cached = request.cookies.get(ROLE_COOKIE)?.value
    const admin =
      cached !== undefined && cached.startsWith(user.id.slice(0, 8) + ":")
        ? cookieSaysAdmin(cached, user.id)
        : await lookUpIsAdmin(user.id, request)
    if (cached !== roleCookieValue(user.id, admin)) {
      supabaseResponse.cookies.set(ROLE_COOKIE, roleCookieValue(user.id, admin), COOKIE_OPTIONS)
    }

    const onLoginPage = ["/login", "/register", "/forgot-password"].includes(pathname)
    const onAdminPage = pathname === "/admin" || pathname.startsWith("/admin/")
    // Admins live in the panel. They only reach the public site through the
    // explicit "Enter public site" action, and only stay there until they
    // choose "Back to admin panel".
    const viewingSite = !admin || cookieSaysSite(request.cookies.get(VIEW_COOKIE)?.value, user.id)

    if (onLoginPage) {
      const url = request.nextUrl.clone()
      url.pathname = admin ? "/admin" : "/feed"
      const res = NextResponse.redirect(url)
      // Signing in always lands an admin in the panel, so any leftover
      // "browsing the site" marker is dropped here.
      if (admin) res.cookies.delete(VIEW_COOKIE)
      return res
    }

    if (admin && !viewingSite && !onAdminPage && !isPublic && !pathname.startsWith("/api")) {
      const url = request.nextUrl.clone()
      url.pathname = "/admin"
      return NextResponse.redirect(url)
    }

    if (admin && onAdminPage && viewingSite) {
      const url = request.nextUrl.clone()
      url.search = ""
      url.pathname = "/feed"
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
