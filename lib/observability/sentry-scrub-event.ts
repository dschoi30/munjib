type SentryRequest = {
  url?: string;
  query_string?: unknown;
  data?: unknown;
  headers?: Record<string, unknown>;
  cookies?: unknown;
};

type SentrySpan = {
  data?: Record<string, unknown>;
};

type SentryBreadcrumb = {
  category?: string;
  data?: Record<string, unknown>;
};

type ScrubbableSentryEvent = {
  request?: SentryRequest;
  user?: Record<string, unknown>;
  spans?: SentrySpan[];
  breadcrumbs?: SentryBreadcrumb[];
};

const SENSITIVE_REQUEST_HEADERS = new Set([
  "referer",
  "referrer",
  "cookie",
  "authorization",
  "proxy-authorization",
  "x-forwarded-for",
  "x-real-ip",
]);

const SPAN_URL_KEYS = new Set([
  "url.full",
  "http.url",
  "http.target",
  "request.path",
]);
const SPAN_QUERY_KEYS = new Set(["url.query", "http.query"]);
const SPAN_NETWORK_KEYS = new Set([
  "server.address",
  "server.port",
  "client.address",
  "client.port",
  "network.peer.address",
  "network.peer.port",
  "net.host.ip",
  "net.host.port",
  "net.host.name",
  "net.peer.ip",
  "net.peer.port",
  "net.peer.name",
  "http.client_ip",
  "http.user_agent",
  "http.host",
  "url.domain",
  "url.port",
  "user_agent.original",
]);

function isSensitiveSpanDataKey(key: string): boolean {
  const normalizedKey = key.toLowerCase().replace(/-/g, "_");

  return (
    normalizedKey === "user.ip_address" ||
    normalizedKey.startsWith("http.request.body") ||
    normalizedKey.startsWith("http.response.body") ||
    normalizedKey === "http.request.header" ||
    normalizedKey === "http.response.header" ||
    normalizedKey.startsWith("http.request.header.") ||
    normalizedKey.startsWith("http.response.header.")
  );
}

function stripUrlQuery(rawUrl: string): string {
  try {
    const absoluteUrl = new URL(rawUrl);
    absoluteUrl.search = "";
    return absoluteUrl.toString();
  } catch {
    // Continue with relative URL parsing.
  }

  try {
    const relativeUrl = new URL(rawUrl, "http://sentry.local");
    return `${relativeUrl.pathname}${relativeUrl.hash}`;
  } catch {
    const queryStart = rawUrl.indexOf("?");
    return queryStart === -1 ? rawUrl : rawUrl.slice(0, queryStart);
  }
}

function scrubRequest(request: SentryRequest): void {
  if (request.url) {
    request.url = stripUrlQuery(request.url);
  }

  delete request.query_string;
  delete request.data;
  delete request.cookies;

  if (!request.headers) {
    return;
  }

  for (const header of Object.keys(request.headers)) {
    if (SENSITIVE_REQUEST_HEADERS.has(header.toLowerCase())) {
      delete request.headers[header];
    }
  }

  if (Object.keys(request.headers).length === 0) {
    delete request.headers;
  }
}

function scrubUser(user: Record<string, unknown>): boolean {
  delete user.ip_address;
  return Object.keys(user).length > 0;
}

export function scrubSentrySpan<T extends SentrySpan>(span: T): T {
  if (!span.data) {
    return span;
  }

  for (const key of SPAN_URL_KEYS) {
    if (typeof span.data[key] === "string") {
      span.data[key] = stripUrlQuery(span.data[key]);
    }
  }

  for (const key of Object.keys(span.data)) {
    if (
      SPAN_QUERY_KEYS.has(key) ||
      SPAN_NETWORK_KEYS.has(key) ||
      isSensitiveSpanDataKey(key)
    ) {
      delete span.data[key];
    }
  }

  if (Object.keys(span.data).length === 0) {
    delete span.data;
  }

  return span;
}

export function scrubSentryBreadcrumb<T extends SentryBreadcrumb>(
  breadcrumb: T,
): T | null {
  if (breadcrumb.category === "console") {
    return null;
  }

  if (!breadcrumb.data) {
    return breadcrumb;
  }

  for (const urlKey of ["url", "href", "from", "to"]) {
    if (typeof breadcrumb.data[urlKey] === "string") {
      breadcrumb.data[urlKey] = stripUrlQuery(breadcrumb.data[urlKey]);
    }
  }

  delete breadcrumb.data.query;
  delete breadcrumb.data["url.query"];

  return breadcrumb;
}

export function scrubSentryEvent<T extends ScrubbableSentryEvent>(event: T): T {
  if (event.request) {
    scrubRequest(event.request);
  }

  if (event.user && !scrubUser(event.user)) {
    delete event.user;
  }

  for (const span of event.spans ?? []) {
    scrubSentrySpan(span);
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.filter(
      (breadcrumb) => scrubSentryBreadcrumb(breadcrumb) !== null,
    );
  }

  return event;
}
