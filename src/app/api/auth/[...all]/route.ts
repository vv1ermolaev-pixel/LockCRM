import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

// Better Auth's own address space: /api/auth/magic-link/verify is the target of the link in the email
export const { GET, POST } = toNextJsHandler(auth);
