type Labels = Record<string, string | number | boolean>;

interface MetricSample {
  value: number;
  labels: string;
}

const counters = new Map<string, MetricSample[]>();
const gauges = new Map<string, MetricSample[]>();
const histograms = new Map<string, { buckets: number[]; counts: number[]; sum: number; count: number; labels: string }[]>();

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

function normalizeLabels(labels: Labels = {}): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}="${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`)
    .join(',');
}

function metricName(name: string): string {
  return String(name || '').replace(/[^a-zA-Z0-9_:]/g, '_');
}

function addSample(store: Map<string, MetricSample[]>, name: string, value: number, labels?: Labels): void {
  const key = metricName(name);
  const labelText = normalizeLabels(labels);
  const list = store.get(key) ?? [];
  const existing = list.find((sample) => sample.labels === labelText);
  if (existing) existing.value += value;
  else list.push({ value, labels: labelText });
  store.set(key, list);
}

export function incrementCounter(name: string, labels?: Labels, value = 1): void {
  if (!Number.isFinite(value)) return;
  addSample(counters, name, value, labels);
}

export function setGauge(name: string, value: number, labels?: Labels): void {
  if (!Number.isFinite(value)) return;
  const key = metricName(name);
  const labelText = normalizeLabels(labels);
  const list = gauges.get(key) ?? [];
  const existing = list.find((sample) => sample.labels === labelText);
  if (existing) existing.value = value;
  else list.push({ value, labels: labelText });
  gauges.set(key, list);
}

export function observeHistogram(name: string, value: number, labels?: Labels, buckets = DEFAULT_BUCKETS): void {
  if (!Number.isFinite(value)) return;
  const key = metricName(name);
  const labelText = normalizeLabels(labels);
  const list = histograms.get(key) ?? [];
  let sample = list.find((item) => item.labels === labelText);
  if (!sample) {
    sample = { buckets, counts: buckets.map(() => 0), sum: 0, count: 0, labels: labelText };
    list.push(sample);
  }
  sample.sum += value;
  sample.count += 1;
  for (let index = 0; index < sample.buckets.length; index += 1) {
    if (value <= sample.buckets[index]) sample.counts[index] += 1;
  }
  histograms.set(key, list);
}

function renderSamples(name: string, type: 'counter' | 'gauge', samples: MetricSample[]): string[] {
  const lines = [`# HELP ${name} Anime engine ${type}.`, `# TYPE ${name} ${type}`];
  for (const sample of samples) {
    lines.push(`${name}${sample.labels ? `{${sample.labels}}` : ''} ${sample.value}`);
  }
  return lines;
}

export function renderPrometheusMetrics(): string {
  const lines: string[] = [];
  for (const [name, samples] of counters) lines.push(...renderSamples(name, 'counter', samples));
  for (const [name, samples] of gauges) lines.push(...renderSamples(name, 'gauge', samples));
  for (const [name, samples] of histograms) {
    lines.push(`# HELP ${name} Anime engine histogram.`, `# TYPE ${name} histogram`);
    for (const sample of samples) {
      const suffix = sample.labels ? `{${sample.labels}}` : '';
      for (let index = 0; index < sample.buckets.length; index += 1) {
        const bucketLabels = sample.labels ? `${sample.labels},le="${sample.buckets[index]}"` : `le="${sample.buckets[index]}"`;
        lines.push(`${name}_bucket{${bucketLabels}} ${sample.counts[index]}`);
      }
      lines.push(`${name}_bucket{${sample.labels ? `${sample.labels},` : ''}le="+Inf"} ${sample.count}`);
      lines.push(`${name}_sum${suffix} ${sample.sum}`);
      lines.push(`${name}_count${suffix} ${sample.count}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export function resetMetricsForTests(): void {
  counters.clear();
  gauges.clear();
  histograms.clear();
}
