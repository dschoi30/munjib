import { describe, expect, test } from "vitest";
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentrySpan,
} from "@/lib/observability/sentry-scrub-event";

describe("scrubSentryEvent", () => {
  test("strips absolute request URL query and removes query string and data", () => {
    const event = {
      request: {
        url: "https://example.com/workspaces/company-handbook?documentId=secret&search=private#heading",
        query_string: "documentId=secret&search=private",
        data: { contentMarkdown: "private document body" },
        cookies: { session: "secret" },
      },
    };

    const result = scrubSentryEvent(event);

    expect(result).toBe(event);
    expect(result.request).toEqual({
      url: "https://example.com/workspaces/company-handbook#heading",
    });
  });

  test("strips relative request URL query", () => {
    const event = {
      request: {
        url: "/workspaces/company-handbook?documentId=secret#graph",
      },
    };

    scrubSentryEvent(event);

    expect(event.request.url).toBe("/workspaces/company-handbook#graph");
  });

  test("removes sensitive request headers case-insensitively and keeps safe headers", () => {
    const event = {
      request: {
        headers: {
          Referer: "https://example.com/search?q=private",
          Cookie: "session=secret",
          authorization: "Bearer secret",
          "Proxy-Authorization": "Basic secret",
          "X-Forwarded-For": "203.0.113.10",
          "x-real-ip": "203.0.113.11",
          "content-type": "application/json",
        },
      },
    };

    scrubSentryEvent(event);

    expect(event.request.headers).toEqual({
      "content-type": "application/json",
    });
  });

  test("removes request headers when no safe headers remain", () => {
    const event = {
      request: {
        headers: {
          REFERRER: "https://example.com/search?q=private",
          COOKIE: "session=secret",
        },
      },
    };

    scrubSentryEvent(event);

    expect(event.request).toEqual({});
  });

  test("removes user ip_address and drops empty user objects", () => {
    const eventWithSafeUserField = {
      user: {
        id: "user-1",
        ip_address: "203.0.113.10",
      },
    };
    const eventWithOnlyIp = {
      user: {
        ip_address: "203.0.113.11",
      },
    };

    scrubSentryEvent(eventWithSafeUserField);
    scrubSentryEvent(eventWithOnlyIp);

    expect(eventWithSafeUserField.user).toEqual({ id: "user-1" });
    expect(eventWithOnlyIp).toEqual({});
  });

  test("scrubs span URL, query, address, and user-agent data", () => {
    const event = {
      spans: [
        {
          data: {
            "url.full": "https://example.com/search?q=private#result",
            "http.url": "/workspaces/company-handbook?documentId=secret",
            "url.query": "q=private",
            "http.query": "documentId=secret",
            "server.address": "example.com",
            "client.address": "203.0.113.10",
            "network.peer.address": "203.0.113.11",
            "user_agent.original": "Secret Browser",
            "http.method": "GET",
          },
        },
      ],
    };

    scrubSentryEvent(event);

    expect(event.spans[0].data).toEqual({
      "url.full": "https://example.com/search#result",
      "http.url": "/workspaces/company-handbook",
      "http.method": "GET",
    });
  });

  test("scrubs standalone span payloads for beforeSendSpan", () => {
    const span = {
      data: {
        "url.full": "https://example.com/workspaces/company-handbook?documentId=secret",
        "url.query": "documentId=secret",
        "network.peer.address": "203.0.113.10",
      },
    };

    const result = scrubSentrySpan(span);

    expect(result).toBe(span);
    expect(span.data).toEqual({
      "url.full": "https://example.com/workspaces/company-handbook",
    });
  });

  test("scrubs breadcrumb URL and query data", () => {
    const event = {
      breadcrumbs: [
        {
          data: {
            url: "https://example.com/workspaces/company-handbook?documentId=secret",
            href: "/search?q=private#result",
            query: "q=private",
            "url.query": "documentId=secret",
            method: "GET",
          },
        },
      ],
    };

    scrubSentryEvent(event);

    expect(event.breadcrumbs[0].data).toEqual({
      url: "https://example.com/workspaces/company-handbook",
      href: "/search#result",
      method: "GET",
    });
  });

  test("scrubs standalone breadcrumbs for beforeBreadcrumb", () => {
    const breadcrumb = {
      data: {
        url: "/workspaces/company-handbook?documentId=secret",
        query: "documentId=secret",
      },
    };

    const result = scrubSentryBreadcrumb(breadcrumb);

    expect(result).toBe(breadcrumb);
    expect(breadcrumb.data).toEqual({
      url: "/workspaces/company-handbook",
    });
  });
});
