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

const SPAN_QUERY_KEYS = new Set(["url.query", "http.query"]);
const SPAN_NETWORK_KEYS = new Set([
  "server.address",
  "client.address",
  "network.peer.address",
  "user_agent.original",
]);

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

function scrubSpan(span: SentrySpan): void {
  if (!span.data) {
    return;
  }

  if (typeof span.data["url.full"] === "string") {
    span.data["url.full"] = stripUrlQuery(span.data["url.full"]);
  }

  if (typeof span.data["http.url"] === "string") {
    span.data["http.url"] = stripUrlQuery(span.data["http.url"]);
  }

  for (const key of [...SPAN_QUERY_KEYS, ...SPAN_NETWORK_KEYS]) {
    delete span.data[key];
  }

  if (Object.keys(span.data).length === 0) {
    delete span.data;
  }
}

function scrubBreadcrumb(breadcrumb: SentryBreadcrumb): void {
  if (!breadcrumb.data) {
    return;
  }

  if (typeof breadcrumb.data.url === "string") {
    breadcrumb.data.url = stripUrlQuery(breadcrumb.data.url);
  }

  if (typeof breadcrumb.data.href === "string") {
    breadcrumb.data.href = stripUrlQuery(breadcrumb.data.href);
  }

  delete breadcrumb.data.query;
  delete breadcrumb.data["url.query"];
}

export function scrubSentryEvent<T extends ScrubbableSentryEvent>(event: T): T {
  if (event.request) {
    scrubRequest(event.request);
  }

  if (event.user && !scrubUser(event.user)) {
    delete event.user;
  }

  for (const span of event.spans ?? []) {
    scrubSpan(span);
  }

  for (const breadcrumb of event.breadcrumbs ?? []) {
    scrubBreadcrumb(breadcrumb);
  }

  return event;
}
