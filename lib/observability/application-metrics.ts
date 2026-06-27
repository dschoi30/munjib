import * as Sentry from "@sentry/nextjs";

type MetricAttributeValue = boolean | number | string;
type MetricAttributes = Record<string, MetricAttributeValue | undefined>;

function compactAttributes(attributes: MetricAttributes | undefined) {
  if (!attributes) {
    return undefined;
  }

  const compacted = Object.fromEntries(
    Object.entries(attributes).filter((entry): entry is [string, MetricAttributeValue] => {
      return entry[1] !== undefined;
    }),
  );

  return Object.keys(compacted).length > 0 ? compacted : undefined;
}

export function captureMetricCount(
  name: string,
  value = 1,
  attributes?: MetricAttributes,
) {
  try {
    const countMetric = Sentry.metrics?.count;

    if (typeof countMetric !== "function") {
      return;
    }

    const compactedAttributes = compactAttributes(attributes);

    if (compactedAttributes) {
      countMetric(name, value, { attributes: compactedAttributes });
      return;
    }

    countMetric(name, value);
  } catch {
    // Metrics are observational only and must not change application behavior.
  }
}
