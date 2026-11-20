import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "./admin-session";
import { isSameOrigin } from "./request-origin";

export async function requireAdmin(request?: Request): Promise<void> {
  const session = (await cookies()).get(ADMIN_SESSION_COOKIE);
  if (!verifyAdminSession(session?.value)) throw new Error("Unauthorized");
  if (request) {
    const origin = request.headers.get("origin");
    const site = request.headers.get("sec-fetch-site");
    if ((origin && !isSameOrigin(request, origin)) || (site && site !== "same-origin" && site !== "none")) {
      throw new Error("Unauthorized");
    }
  }
}
