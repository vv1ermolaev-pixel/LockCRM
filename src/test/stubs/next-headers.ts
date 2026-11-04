// A stand-in for "next/headers": outside Next there is no request, so a test says which browser is asking.
// A browser here is a set of cookies and an address. Server code calls headers() and cookies() as usual
// and gets those of the current browser; tests switch with switchBrowser() to act as two people at once.

type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
  path?: string;
  maxAge?: number;
  expires?: Date;
};

type StoredCookie = { value: string } & CookieOptions;

type Browser = { cookies: Map<string, StoredCookie>; ip: string };

let browserCount = 0;
let current = createBrowser();

function createBrowser(): Browser {
  browserCount += 1;
  // Every browser has its own address, so the per-address limit never joins two of them by accident
  return { cookies: new Map(), ip: `203.0.113.${browserCount % 250}` };
}

const browsers = new Map<string, Browser>();

// A browser that has no cookies yet; a name brings back the same browser later
export function switchBrowser(name?: string) {
  if (!name) {
    current = createBrowser();
  } else {
    if (!browsers.has(name)) browsers.set(name, createBrowser());
    current = browsers.get(name)!;
  }
}

export function resetBrowsers() {
  browsers.clear();
  current = createBrowser();
}

export function setBrowserAddress(ip: string) {
  current.ip = ip;
}

// The cookie as the current browser holds it, for tests to look at
export function browserCookie(name: string) {
  return current.cookies.get(name);
}

export function removeBrowserCookie(name: string) {
  current.cookies.delete(name);
}

// What a response with `Set-Cookie` headers does to the browser: stores or removes the cookies
export function storeSetCookies(setCookies: string[]) {
  for (const header of setCookies) {
    const [pair, ...attributes] = header.split(";").map((part) => part.trim());
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    const value = decodeURIComponent(pair.slice(separator + 1));
    const options: CookieOptions = {};
    for (const attribute of attributes) {
      const [key, ...rest] = attribute.split("=");
      const attributeValue = rest.join("=");
      switch (key.toLowerCase()) {
        case "httponly":
          options.httpOnly = true;
          break;
        case "secure":
          options.secure = true;
          break;
        case "samesite":
          options.sameSite = attributeValue.toLowerCase();
          break;
        case "path":
          options.path = attributeValue;
          break;
        case "max-age":
          options.maxAge = Number(attributeValue);
          break;
      }
    }
    if (options.maxAge === 0 || !value) current.cookies.delete(name);
    else current.cookies.set(name, { value, ...options });
  }
}

export async function headers() {
  const result = new Headers({ "x-forwarded-for": current.ip });
  const cookie = [...current.cookies].map(([name, { value }]) => `${name}=${encodeURIComponent(value)}`).join("; ");
  if (cookie) result.set("cookie", cookie);
  return result;
}

export async function cookies() {
  return {
    get: (name: string) => {
      const stored = current.cookies.get(name);
      return stored ? { name, value: stored.value } : undefined;
    },
    set: (name: string, value: string, options: CookieOptions = {}) => {
      current.cookies.set(name, { value, ...options });
    },
    delete: (name: string) => {
      current.cookies.delete(name);
    },
  };
}
