export interface ScrollEdges {
  readonly canScrollUp: boolean;
  readonly canScrollDown: boolean;
}

export interface ScrollMetrics {
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

const EDGE_SLACK_PX = 1;

export function scrollEdgesOf(metrics: ScrollMetrics): ScrollEdges {
  const rest = metrics.scrollHeight - metrics.clientHeight;
  return {
    canScrollUp: metrics.scrollTop > EDGE_SLACK_PX,
    canScrollDown: metrics.scrollTop < rest - EDGE_SLACK_PX,
  };
}
