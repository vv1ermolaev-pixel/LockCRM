// The password of a test person, set the way the app sets it: inside, after a login by the link

import { auth } from "@/lib/auth";

import { signInAs } from "./sign-in";
import { headers } from "./stubs/next-headers";

export const PASSWORD = "длинная фраза для входа";

export function loginForm(email: string, password: string) {
  const formData = new FormData();
  formData.set("email", email);
  formData.set("password", password);
  return formData;
}

// Leaves the person signed in, in the browser named by the email unless another name is given
export async function signInWithNewPassword(email: string, password = PASSWORD, options?: { browser?: string }) {
  await signInAs(email, options);
  await auth.api.setPassword({ body: { newPassword: password }, headers: await headers() });
}
