import { describe, expect, test } from "vitest";
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentryMetric,
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
      url: "/workspaces/company-handbook#heading",
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

  test("removes request headers", () => {
    const event = {
      request: {
        headers: {
          Referer: "https://example.com/search?q=private",
          "User-Agent": "Secret Browser",
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
            url: "/api/workspaces/company-handbook?documentId=secret#xhr",
            "url.full": "https://example.com/search?q=private#result",
            "http.url": "/workspaces/company-handbook?documentId=secret",
            "http.target": "/workspaces/company-handbook?documentId=secret#editor",
            "request.path": "/api/workspaces/company-handbook?documentId=secret",
            "url.query": "q=private",
            "http.query": "documentId=secret",
            "url.fragment": "xhr",
            "http.fragment": "editor",
            "http.request.body.data": '{"contentMarkdown":"private"}',
            "http.request.header.cookie.session": "secret",
            "http.request.header.authorization": "Bearer secret",
            "http.response.header.set_cookie.session": "secret",
            "server.address": "example.com",
            "server.port": 443,
            "client.address": "203.0.113.10",
            "client.port": 12345,
            "network.peer.address": "203.0.113.11",
            "network.peer.port": 5432,
            "net.host.ip": "198.51.100.10",
            "net.host.port": 443,
            "net.host.name": "internal.example.com",
            "net.peer.ip": "198.51.100.11",
            "net.peer.port": 5432,
            "net.peer.name": "database.internal",
            "http.client_ip": "203.0.113.12",
            "http.user_agent": "Secret Browser",
            "http.host": "internal.example.com",
            "url.domain": "internal.example.com",
            "url.port": 443,
            "user.ip_address": "203.0.113.12",
            "user_agent.original": "Secret Browser",
            "http.method": "GET",
          },
        },
      ],
    };

    scrubSentryEvent(event);

    expect(event.spans[0].data).toEqual({
      url: "/api/workspaces/company-handbook#xhr",
      "url.full": "/search#result",
      "http.url": "/workspaces/company-handbook",
      "http.target": "/workspaces/company-handbook#editor",
      "request.path": "/api/workspaces/company-handbook",
      "http.method": "GET",
    });
  });

  test("scrubs standalone span payloads for beforeSendSpan", () => {
    const span = {
      data: {
        url: "/api/workspaces/company-handbook?documentId=secret#xhr",
        "url.full": "https://example.com/workspaces/company-handbook?documentId=secret",
        "http.target": "/workspaces/company-handbook?documentId=secret",
        "request.path": "/api/workspaces/company-handbook?documentId=secret",
        "url.query": "documentId=secret",
        "http.fragment": "xhr",
        "http.request.body.data": '{"contentMarkdown":"private"}',
        "http.request.header.cookie.session": "secret",
        "http.request.header.authorization": "Bearer secret",
        "http.response.header.set_cookie.session": "secret",
        "user.ip_address": "203.0.113.10",
        "net.peer.ip": "203.0.113.10",
        "http.client_ip": "203.0.113.10",
        "http.host": "internal.example.com",
        "network.peer.address": "203.0.113.10",
      },
    };

    const result = scrubSentrySpan(span);

    expect(result).toBe(span);
    expect(span.data).toEqual({
      url: "/api/workspaces/company-handbook#xhr",
      "url.full": "/workspaces/company-handbook",
      "http.target": "/workspaces/company-handbook",
      "request.path": "/api/workspaces/company-handbook",
    });
  });

  test("scrubs URL-like span descriptions and names", () => {
    const spanWithoutData = {
      description:
        "GET https://example.com/api/documents?documentId=secret#result then /api/ask?documentId=secret",
      name: "POST /api/workspaces/company-handbook?documentId=secret",
    };

    const result = scrubSentrySpan(spanWithoutData);

    expect(result).toBe(spanWithoutData);
    expect(spanWithoutData).toEqual({
      description: "GET /api/documents#result then /api/ask",
      name: "POST /api/workspaces/company-handbook",
    });
  });

  test("scrubs browser fetch and xhr span url payloads", () => {
    const fetchSpan = {
      data: {
        url: "https://example.com/api/documents?documentId=secret#fetch",
        type: "fetch",
      },
    };
    const xhrSpan = {
      data: {
        url: "/api/documents?documentId=secret#xhr",
        type: "xhr",
      },
    };

    scrubSentrySpan(fetchSpan);
    scrubSentrySpan(xhrSpan);

    expect(fetchSpan.data).toEqual({
      url: "/api/documents#fetch",
      type: "fetch",
    });
    expect(xhrSpan.data).toEqual({
      url: "/api/documents#xhr",
      type: "xhr",
    });
  });

  test("scrubs breadcrumb URL and query data", () => {
    const event = {
      breadcrumbs: [
        {
          data: {
            url: "https://example.com/workspaces/company-handbook?documentId=secret",
            href: "/search?q=private#result",
            from: "/workspaces/company-handbook?documentId=old",
            to: "/workspaces/company-handbook?documentId=new#editor",
            query: "q=private",
            "url.query": "documentId=secret",
            method: "GET",
          },
        },
      ],
    };

    scrubSentryEvent(event);

    expect(event.breadcrumbs[0].data).toEqual({
      url: "/workspaces/company-handbook",
      href: "/search#result",
      from: "/workspaces/company-handbook",
      to: "/workspaces/company-handbook#editor",
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

  test("drops console breadcrumbs from event payloads", () => {
    const event = {
      breadcrumbs: [
        {
          category: "console",
          data: {
            arguments: ["private startup output"],
          },
          message: "private startup output",
        },
        {
          category: "navigation",
          data: {
            to: "/workspaces/company-handbook?documentId=secret",
          },
        },
      ],
    };

    scrubSentryEvent(event);

    expect(event.breadcrumbs).toEqual([
      {
        category: "navigation",
        data: {
          to: "/workspaces/company-handbook",
        },
      },
    ]);
  });

  test("drops standalone console breadcrumbs for beforeBreadcrumb", () => {
    const breadcrumb = {
      category: "console",
      message: "private startup output",
    };

    expect(scrubSentryBreadcrumb(breadcrumb)).toBeNull();
  });
});

describe("scrubSentryMetric", () => {
  test("removes user and server address attributes from metric payloads", () => {
    const metric = {
      attributes: {
        "server.address": "munjib.andrewchoi.link",
        "user.email": "person@example.com",
        "user.id": "user-1",
        "user.name": "Private User",
        environment: "production",
        surface: "ask_document",
      },
      tags: {
        "server.address": "internal-host",
        "user.email": "person@example.com",
        surface: "workspace_chat_stream",
      },
      value: 1,
    };

    const result = scrubSentryMetric(metric);

    expect(result).toBe(metric);
    expect(metric).toEqual({
      attributes: {
        environment: "production",
        surface: "ask_document",
      },
      tags: {
        surface: "workspace_chat_stream",
      },
      value: 1,
    });
  });

  test("leaves null and primitive metric payloads unchanged", () => {
    expect(scrubSentryMetric(null)).toBeNull();
    expect(scrubSentryMetric(undefined)).toBeUndefined();
    expect(scrubSentryMetric("metric-name")).toBe("metric-name");
    expect(scrubSentryMetric(1)).toBe(1);
  });
});
