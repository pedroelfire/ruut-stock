'use client';

import type { Series, SeriesRange } from '@ruut/shared';
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  TickMarkType,
  createChart,
  type AreaData,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import {
  formatAxisTick,
  formatPercent,
  formatPrice,
  formatTooltipDate,
  type AxisTickKind,
} from '@/lib/format';
import { cn } from '@/lib/utils';

interface PriceChartProps {
  series: Series;
  currency: string;
  className?: string;
}

interface TooltipState {
  left: number;
  date: string;
  price: string;
}

const TOOLTIP_HALF_WIDTH = 72;

const TICK_KIND: Record<TickMarkType, AxisTickKind> = {
  [TickMarkType.Year]: 'year',
  [TickMarkType.Month]: 'month',
  [TickMarkType.DayOfMonth]: 'day',
  [TickMarkType.Time]: 'time',
  [TickMarkType.TimeWithSeconds]: 'time',
};

/** Reads a design token from globals.css: the canvas cannot resolve CSS variables itself. */
function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** `#0e7c7b` → `rgba(14, 124, 123, 0.2)`; any other format is returned unchanged. */
function withAlpha(color: string, alpha: number): string {
  const hex = color.replace('#', '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return color;
  const [r, g, b] = [0, 2, 4].map((start) => parseInt(full.slice(start, start + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function themeOptions() {
  const primary = readToken('--primary');
  const border = readToken('--border');
  const muted = readToken('--muted-foreground');
  return {
    chart: {
      layout: { textColor: muted },
      grid: { horzLines: { color: border } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border },
      crosshair: { vertLine: { color: muted }, horzLine: { color: muted } },
    },
    series: {
      lineColor: primary,
      topColor: withAlpha(primary, 0.2),
      bottomColor: withAlpha(primary, 0),
      crosshairMarkerBackgroundColor: primary,
    },
  };
}

function toSeconds(iso: string): UTCTimestamp {
  return Math.floor(Date.parse(iso) / 1000) as UTCTimestamp;
}

/** The chart throws on repeated or unordered times, so anything out of order is dropped. */
function toChartData(series: Series): AreaData<Time>[] {
  const data: AreaData<Time>[] = [];
  let last = -Infinity;
  for (const point of series.points) {
    const time = toSeconds(point.t);
    if (time <= last) continue;
    data.push({ time, value: point.close });
    last = time;
  }
  return data;
}

function timeToDate(time: Time): Date | null {
  return typeof time === 'number' ? new Date(time * 1000) : null;
}

/** Accessible summary (conventions §9): "NVDA price, 1M: from $176.20 to $189.84, +7.74%". */
export function chartSummary(series: Series, currency: string): string {
  const first = series.points[0];
  const last = series.points.at(-1);
  if (!first || !last) return `${series.symbol} price, ${series.range}: no data`;
  return `${series.symbol} price, ${series.range}: from ${formatPrice(first.close, currency)} to ${formatPrice(last.close, currency)}, ${formatPercent(series.periodChangePercent)}`;
}

/**
 * Area chart with Lightweight Charts (conventions §5). Client only, loaded with next/dynamic;
 * created once, resized with a ResizeObserver, re-colored when the color scheme changes and
 * removed on unmount. Zoom and pan are off: this is a calm overview, not a trading terminal.
 */
export function PriceChart({ series, currency, className }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const areaRef = useRef<ISeriesApi<'Area'> | null>(null);
  // Formatters live in the chart's options; refs let them read the current range and currency.
  const rangeRef = useRef<SeriesRange>(series.range);
  const currencyRef = useRef(currency);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const theme = themeOptions();
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: theme.chart.layout.textColor,
        fontFamily: getComputedStyle(container).fontFamily,
        attributionLogo: true,
      },
      grid: { vertLines: { visible: false }, horzLines: theme.chart.grid.horzLines },
      // The bottom margin keeps the line clear of the TradingView logo (bottom left, license).
      rightPriceScale: { ...theme.chart.rightPriceScale, scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: {
        ...theme.chart.timeScale,
        fixLeftEdge: true,
        fixRightEdge: true,
        // Calm axis (conventions §1): every label in the same weight, no bold month starts.
        allowBoldLabels: false,
        tickMarkFormatter: (time: Time, tickMarkType: TickMarkType) => {
          const date = timeToDate(time);
          return date ? formatAxisTick(date, rangeRef.current, TICK_KIND[tickMarkType]) : null;
        },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { ...theme.chart.crosshair.vertLine, labelVisible: false },
        horzLine: { ...theme.chart.crosshair.horzLine, labelVisible: false },
      },
      localization: {
        locale: 'en-US',
        priceFormatter: (price: number) => formatPrice(price, currencyRef.current),
      },
      handleScroll: false,
      handleScale: false,
    });
    const area = chart.addSeries(AreaSeries, {
      ...theme.series,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    chartRef.current = chart;
    areaRef.current = area;

    const handleCrosshair = (param: MouseEventParams<Time>) => {
      const point = param.point;
      const date = param.time === undefined ? null : timeToDate(param.time);
      const datum = param.seriesData.get(area);
      if (!point || !date || !datum || !('value' in datum)) {
        setTooltip(null);
        return;
      }
      const width = container.clientWidth;
      const left = Math.min(Math.max(point.x, TOOLTIP_HALF_WIDTH), width - TOOLTIP_HALF_WIDTH);
      setTooltip({
        left,
        date: formatTooltipDate(date, rangeRef.current),
        price: formatPrice(datum.value, currencyRef.current),
      });
    };
    chart.subscribeCrosshairMove(handleCrosshair);

    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      chart.resize(Math.floor(width), Math.floor(height));
    });
    resizeObserver.observe(container);

    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const next = themeOptions();
      chart.applyOptions(next.chart);
      area.applyOptions(next.series);
    };
    scheme.addEventListener('change', applyTheme);

    return () => {
      scheme.removeEventListener('change', applyTheme);
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(handleCrosshair);
      chart.remove();
      chartRef.current = null;
      areaRef.current = null;
    };
  }, []);

  useEffect(() => {
    rangeRef.current = series.range;
    currencyRef.current = currency;
    areaRef.current?.setData(toChartData(series));
    chartRef.current?.timeScale().fitContent();
  }, [series, currency]);

  return (
    <div
      data-testid="price-chart"
      data-slot="price-chart"
      className={cn('relative h-80 w-full md:h-105', className)}
    >
      {/* The summary is a sibling of the chart, not its wrapper: the chart holds the TradingView
          attribution link, and a link inside role="img" is hidden from assistive technology. */}
      <div role="img" aria-label={chartSummary(series, currency)} className="sr-only" />
      <div ref={containerRef} className="absolute inset-0" />
      {tooltip ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-md border border-border bg-surface px-2 py-1 text-center text-xs shadow-sm"
          style={{ left: tooltip.left }}
        >
          <span className="block text-muted-foreground">{tooltip.date}</span>
          <span className="block font-semibold tabular-nums">{tooltip.price}</span>
        </div>
      ) : null}
    </div>
  );
}
