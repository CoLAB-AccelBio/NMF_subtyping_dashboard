import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Legend, 
  Area, 
  ComposedChart,
  ReferenceLine
} from "recharts";
import { useMemo, useRef } from "react";
import { Download } from "lucide-react";
import { downloadChartAsPNG, downloadRechartsAsSVG } from "@/lib/chartExport";
import { logRankTest, formatPValue } from "@/lib/logRankTest";
import { estimateCoxPH, formatHR } from "@/lib/coxphAnalysis";

export interface SurvivalTimePoint {
  time: number;
  survival: number;
  censored?: number; // Number of censored at this time
  events?: number;   // Number of events at this time
  atRisk?: number;   // Number at risk
}

export interface SurvivalData {
  subtype: string;
  timePoints: SurvivalTimePoint[];
}

interface SurvivalCurveProps {
  data: SurvivalData[];
  subtypeColors: Record<string, string>;
  subtypeCounts?: Record<string, number>;
}

export const SurvivalCurve = ({ data, subtypeColors, subtypeCounts }: SurvivalCurveProps) => {
  const chartRef = useRef<HTMLDivElement>(null);

  const handleDownloadPNG = () => {
    downloadChartAsPNG(chartRef.current, "survival-curve");
  };

  const handleDownloadSVG = () => {
    downloadRechartsAsSVG(chartRef.current, "survival-curve");
  };

  // Calculate log-rank test p-value
  const logRankResult = useMemo(() => {
    return logRankTest(data, subtypeCounts);
  }, [data, subtypeCounts]);

  // Calculate Cox PH results
  const coxPHResult = useMemo(() => {
    return estimateCoxPH(data, subtypeCounts);
  }, [data, subtypeCounts]);

  // Calculate median survival for each subtype
  const medianSurvival = useMemo(() => {
    const result: Record<string, number | null> = {};
    
    data.forEach(group => {
      // Sort time points
      const sorted = [...group.timePoints].sort((a, b) => a.time - b.time);
      
      // Ensure monotonic decreasing survival
      let lastSurvival = 1;
      const monotonic = sorted.map(tp => {
        const survival = Math.min(lastSurvival, tp.survival);
        lastSurvival = survival;
        return { ...tp, survival };
      });
      
      // Find first time where survival drops to or below 0.5
      let median: number | null = null;
      for (let i = 0; i < monotonic.length; i++) {
        if (monotonic[i].survival <= 0.5) {
          // Linear interpolation for exact median
          if (i > 0) {
            const prev = monotonic[i - 1];
            const curr = monotonic[i];
            if (prev.survival > 0.5) {
              // Interpolate
              const slope = (curr.survival - prev.survival) / (curr.time - prev.time);
              if (slope !== 0) {
                median = prev.time + (0.5 - prev.survival) / slope;
              } else {
                median = curr.time;
              }
            } else {
              median = curr.time;
            }
          } else {
            median = monotonic[i].time;
          }
          break;
        }
      }
      
      result[group.subtype] = median;
    });
    
    return result;
  }, [data]);

  // Transform data into step-function format with confidence intervals
  const { chartData, eventPoints, censorPoints, subtypes, maxTime } = useMemo(() => {
    if (!data || data.length === 0) return { chartData: [], eventPoints: [], censorPoints: [], subtypes: [], maxTime: 100 };
    
    const subtypeNames = data.map(d => d.subtype);
    
    // For each subtype, create a proper step function with CIs
    // Ensure survival is monotonically decreasing
    const processedData = data.map(group => {
      const subtype = group.subtype;
      const n = subtypeCounts?.[subtype] || 100;
      
      // Sort time points and ensure monotonicity
      const sortedPoints = [...group.timePoints]
        .sort((a, b) => a.time - b.time)
        .reduce<{ time: number; survival: number; se: number; censored?: number; events?: number }[]>((acc, tp) => {
          const lastSurvival = acc.length > 0 ? acc[acc.length - 1].survival : 1;
          // Ensure survival is monotonically non-increasing
          const survival = Math.min(lastSurvival, tp.survival);
          
          // Calculate standard error using Greenwood's formula approximation
          // SE ≈ S * sqrt((1-S) / (n * S)) when S > 0
          const se = survival > 0.01 && survival < 0.99
            ? survival * Math.sqrt((1 - survival) / (n * survival))
            : 0;
          
          acc.push({ 
            time: tp.time, 
            survival, 
            se,
            censored: tp.censored,
            events: tp.events
          });
          return acc;
        }, []);
      
      return { subtype, points: sortedPoints };
    });
    
    // Get all unique time points
    const allTimes = new Set<number>();
    processedData.forEach(group => {
      group.points.forEach(p => allTimes.add(p.time));
    });
    const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);
    const maxT = sortedTimes.length > 0 ? sortedTimes[sortedTimes.length - 1] : 100;
    
    // Build step-function chart data
    const chartPoints: Record<string, number>[] = [];
    const lastKnown: Record<string, { survival: number; se: number }> = {};
    
    processedData.forEach(g => {
      lastKnown[g.subtype] = { survival: 1.0, se: 0 };
    });
    
    for (let i = 0; i < sortedTimes.length; i++) {
      const time = sortedTimes[i];
      const point: Record<string, number> = { time };
      
      processedData.forEach(group => {
        const tp = group.points.find(p => p.time === time);
        if (tp) {
          lastKnown[group.subtype] = { survival: tp.survival, se: tp.se };
        }
        const { survival, se } = lastKnown[group.subtype];
        point[group.subtype] = survival;
        point[`${group.subtype}_upper`] = Math.min(1, survival + 1.96 * se);
        point[`${group.subtype}_lower`] = Math.max(0, survival - 1.96 * se);
      });
      
      chartPoints.push(point);
    }
    
    // Collect event markers (where survival drops)
    const markers: { time: number; survival: number; subtype: string }[] = [];
    processedData.forEach(group => {
      for (let i = 1; i < group.points.length; i++) {
        const prev = group.points[i - 1];
        const curr = group.points[i];
        if (curr.survival < prev.survival - 0.001) {
          markers.push({
            time: curr.time,
            survival: curr.survival,
            subtype: group.subtype
          });
        }
      }
    });
    
    // Collect censoring markers (where survival stays same or data has censored flag)
    // Censoring is shown as vertical tick marks
    const censors: { time: number; survival: number; subtype: string }[] = [];
    processedData.forEach(group => {
      for (let i = 1; i < group.points.length; i++) {
        const prev = group.points[i - 1];
        const curr = group.points[i];
        
        // Check if explicitly marked as censored
        if (curr.censored && curr.censored > 0) {
          censors.push({
            time: curr.time,
            survival: curr.survival,
            subtype: group.subtype
          });
        }
        // Or if survival doesn't drop (indicating censoring at this time)
        else if (Math.abs(curr.survival - prev.survival) < 0.001 && curr.time > 0) {
          // This could be a censoring event - but we need explicit data
          // For now, add censoring marks at every time point where survival is constant
          // except the first point
        }
      }
      
      // Also check if the last observation is censored (survival > 0 at end)
      const lastPoint = group.points[group.points.length - 1];
      if (lastPoint && lastPoint.survival > 0.001) {
        censors.push({
          time: lastPoint.time,
          survival: lastPoint.survival,
          subtype: group.subtype
        });
      }
    });
    
    return { chartData: chartPoints, eventPoints: markers, censorPoints: censors, subtypes: subtypeNames, maxTime: maxT };
  }, [data, subtypeCounts]);

  if (!data || data.length === 0) {
    return (
      <Card className="border-0 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg">Survival Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
            No survival data available. Include survivalData in your JSON.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 bg-card/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3 flex-wrap">
          <CardTitle className="text-lg">Kaplan-Meier Survival Curves</CardTitle>
          {logRankResult && (
            <Badge 
              variant={logRankResult.pValue < 0.05 ? "default" : "secondary"}
              className={logRankResult.pValue < 0.05 ? "bg-green-600 hover:bg-green-700" : ""}
            >
              Log-rank: {formatPValue(logRankResult.pValue)}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadPNG}>
            <Download className="h-4 w-4 mr-1" />
            PNG
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadSVG}>
            <Download className="h-4 w-4 mr-1" />
            SVG
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div ref={chartRef} className="h-[420px] bg-card">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 30 }}>
              <XAxis
                dataKey="time"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))" }}
                label={{ value: "Time (months)", position: "insideBottom", offset: -15, fontSize: 12 }}
              />
              <YAxis
                domain={[0, 1]}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))" }}
                label={{ value: "Survival Probability", angle: -90, position: "insideLeft", fontSize: 12, dx: -5 }}
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: number, name: string) => {
                  if (name.includes('_upper') || name.includes('_lower')) {
                    return null;
                  }
                  return [`${(value * 100).toFixed(1)}%`, name];
                }}
                labelFormatter={(time) => `Time: ${time} months`}
              />
              <Legend 
                verticalAlign="top"
                wrapperStyle={{ fontSize: "12px", paddingBottom: "10px" }}
                iconType="plainline"
                payload={subtypes.map(subtype => ({
                  value: `${subtype}${medianSurvival[subtype] !== null ? ` (median: ${medianSurvival[subtype]?.toFixed(1)}mo)` : ' (median: NR)'}`,
                  type: 'line' as const,
                  color: subtypeColors[subtype] || "hsl(var(--primary))"
                }))}
              />
              
              {/* Reference line at 50% survival (median) */}
              <ReferenceLine 
                y={0.5} 
                stroke="hsl(var(--muted-foreground))" 
                strokeDasharray="3 3" 
                strokeOpacity={0.5}
              />
              
              {/* Median survival vertical lines for each subtype */}
              {subtypes.map(subtype => {
                const median = medianSurvival[subtype];
                if (median === null) return null;
                return (
                  <ReferenceLine
                    key={`median-line-${subtype}`}
                    x={median}
                    stroke={subtypeColors[subtype] || "hsl(var(--primary))"}
                    strokeDasharray="3 3"
                    strokeOpacity={0.4}
                  />
                );
              })}
              
              {/* Confidence interval areas - upper bounds with fill */}
              {subtypes.map((subtype) => {
                const color = subtypeColors[subtype] || "hsl(var(--primary))";
                return (
                  <Area
                    key={`${subtype}-upper`}
                    type="stepAfter"
                    dataKey={`${subtype}_upper`}
                    fill={color}
                    fillOpacity={0.1}
                    stroke={color}
                    strokeWidth={0.5}
                    strokeDasharray="2 2"
                    strokeOpacity={0.3}
                    connectNulls
                    isAnimationActive={false}
                    legendType="none"
                  />
                );
              })}
              
              {/* Lower bounds - just show as dashed line */}
              {subtypes.map((subtype) => {
                const color = subtypeColors[subtype] || "hsl(var(--primary))";
                return (
                  <Line
                    key={`${subtype}-lower`}
                    type="stepAfter"
                    dataKey={`${subtype}_lower`}
                    stroke={color}
                    strokeWidth={0.5}
                    strokeDasharray="2 2"
                    strokeOpacity={0.3}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                    legendType="none"
                  />
                );
              })}
              
              {/* Survival lines with event dots and censoring marks */}
              {subtypes.map((subtype) => (
                <Line
                  key={subtype}
                  type="stepAfter"
                  dataKey={subtype}
                  stroke={subtypeColors[subtype] || "hsl(var(--primary))"}
                  strokeWidth={2.5}
                  dot={(props) => {
                    const { cx, cy, payload } = props;
                    if (!payload || cx === undefined || cy === undefined) return null;
                    
                    const time = payload.time;
                    const survival = payload[subtype];
                    const color = subtypeColors[subtype] || "hsl(var(--primary))";
                    
                    // Check if this is an event point (survival drop)
                    const isEvent = eventPoints.some(
                      e => e.subtype === subtype && e.time === time
                    );
                    
                    // Check if this is a censoring point
                    const isCensor = censorPoints.some(
                      c => c.subtype === subtype && c.time === time
                    );
                    
                    if (isEvent) {
                      // Event: filled circle
                      return (
                        <circle
                          key={`event-${subtype}-${time}`}
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill={color}
                          stroke="hsl(var(--background))"
                          strokeWidth={1.5}
                        />
                      );
                    }
                    
                    if (isCensor) {
                      // Censoring: vertical tick mark (like + in R)
                      return (
                        <g key={`censor-${subtype}-${time}`}>
                          <line
                            x1={cx}
                            y1={cy - 6}
                            x2={cx}
                            y2={cy + 6}
                            stroke={color}
                            strokeWidth={2}
                          />
                        </g>
                      );
                    }
                    
                    return null;
                  }}
                  connectNulls
                  name={subtype}
                  isAnimationActive={false}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        
        {/* Summary statistics below the chart */}
        <div className="mt-4 space-y-3">
          {/* Median survival times */}
          <div className="flex flex-wrap gap-4 justify-center">
            {subtypes.map(subtype => (
              <div 
                key={subtype}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50"
              >
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: subtypeColors[subtype] }}
                />
                <span className="text-sm font-medium">{subtype}:</span>
                <span className="text-sm text-muted-foreground">
                  Median = {medianSurvival[subtype] !== null 
                    ? `${medianSurvival[subtype]?.toFixed(1)} mo` 
                    : 'Not Reached'}
                </span>
              </div>
            ))}
          </div>
          
          {/* Cox PH results */}
          {coxPHResult && (
            <div className="border rounded-md p-3 bg-muted/30">
              <h4 className="text-sm font-semibold mb-2">Cox Proportional Hazards Analysis</h4>
              <div className="text-xs text-muted-foreground mb-2">
                Reference: {coxPHResult.referenceGroup}
              </div>
              <div className="space-y-1">
                {coxPHResult.groups.map(g => (
                  <div key={g.subtype} className="flex flex-wrap items-center gap-2 text-sm">
                    <span 
                      className="font-medium"
                      style={{ color: subtypeColors[g.subtype] }}
                    >
                      {g.subtype}:
                    </span>
                    <span>HR = {formatHR(g.hazardRatio, g.lowerCI, g.upperCI)}</span>
                    <Badge 
                      variant={g.pValue < 0.05 ? "default" : "secondary"}
                      className={`text-xs ${g.pValue < 0.05 ? "bg-green-600 hover:bg-green-700" : ""}`}
                    >
                      {formatPValue(g.pValue)}
                    </Badge>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Wald test: χ² = {coxPHResult.waldTest.chiSquare.toFixed(2)}, 
                df = {coxPHResult.waldTest.df}, 
                {formatPValue(coxPHResult.waldTest.pValue)}
              </div>
            </div>
          )}
        </div>
        
        <p className="text-xs text-muted-foreground mt-3 text-center">
          Shaded regions show 95% confidence intervals. Dots indicate events (deaths). 
          Vertical ticks indicate censored observations. Dashed line at 50% indicates median survival.
        </p>
      </CardContent>
    </Card>
  );
};
