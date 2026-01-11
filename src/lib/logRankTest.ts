/**
 * Log-rank test implementation for Kaplan-Meier survival analysis
 * Returns p-value for comparing survival curves between groups
 */

import { SurvivalData } from "@/components/bioinformatics/SurvivalCurve";

interface SurvivalPoint {
  time: number;
  survival: number;
  subtype: string;
  atRisk?: number;
  events?: number;
}

/**
 * Calculate chi-square p-value from test statistic
 */
function chiSquarePValue(chiSquare: number, degreesOfFreedom: number): number {
  // Approximation using the regularized incomplete gamma function
  // For df=1, P(X > x) ≈ 2 * (1 - Φ(sqrt(x))) where Φ is standard normal CDF
  if (degreesOfFreedom === 1) {
    const z = Math.sqrt(chiSquare);
    // Standard normal CDF approximation
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const sign = z < 0 ? -1 : 1;
    const absZ = Math.abs(z);
    const t = 1.0 / (1.0 + p * absZ);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absZ * absZ / 2);
    const normalCDF = 0.5 * (1.0 + sign * y);
    return 2 * (1 - normalCDF);
  }
  
  // For multiple degrees of freedom, use gamma function approximation
  // This is a simplified approximation
  const k = degreesOfFreedom / 2;
  const x = chiSquare / 2;
  
  // Upper incomplete gamma function approximation
  let sum = 0;
  let term = 1;
  for (let i = 0; i < 100; i++) {
    term *= x / (k + i);
    sum += term;
    if (term < 1e-10) break;
  }
  
  const gamma = Math.exp(-x) * Math.pow(x, k) * sum / k;
  return Math.max(0, Math.min(1, 1 - gamma));
}

/**
 * Perform log-rank test on survival data
 * Returns p-value and chi-square statistic
 */
export function logRankTest(survivalData: SurvivalData[]): { 
  pValue: number; 
  chiSquare: number;
  degreesOfFreedom: number;
} | null {
  if (!survivalData || survivalData.length < 2) {
    return null;
  }

  // Get all unique event times across all groups
  const allTimes = new Set<number>();
  survivalData.forEach(group => {
    group.timePoints.forEach(tp => {
      allTimes.add(tp.time);
    });
  });
  const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);

  if (sortedTimes.length === 0) return null;

  // For each group, track at-risk counts and events at each time
  const groupData = survivalData.map(group => {
    const timePointMap = new Map<number, { survival: number }>();
    group.timePoints.forEach(tp => {
      timePointMap.set(tp.time, { survival: tp.survival });
    });
    
    // Calculate events (drops in survival)
    const events = new Map<number, number>();
    let prevSurvival = 1.0;
    
    for (const time of sortedTimes) {
      const tp = timePointMap.get(time);
      if (tp) {
        // Event occurred if survival dropped
        const survivalDrop = prevSurvival - tp.survival;
        if (survivalDrop > 0.001) {
          // Estimate number of events based on survival drop
          // Assuming equal risk, events ≈ atRisk * (1 - (survival/prevSurvival))
          events.set(time, Math.max(1, Math.round(survivalDrop * 100)));
        }
        prevSurvival = tp.survival;
      }
    }
    
    return {
      subtype: group.subtype,
      timePointMap,
      events,
      initialCount: 100, // Assume 100 subjects per group for calculation
    };
  });

  // Calculate log-rank test statistic
  let numerator = 0;
  let denominator = 0;

  // For each time point, calculate O-E (observed - expected)
  for (const time of sortedTimes) {
    // Total events at this time
    let totalEvents = 0;
    let totalAtRisk = 0;
    const groupAtRisk: number[] = [];
    const groupEvents: number[] = [];

    groupData.forEach((group, i) => {
      // Estimate at-risk count based on survival curve
      let atRisk = group.initialCount;
      let lastSurvival = 1.0;
      for (const [t, data] of group.timePointMap.entries()) {
        if (t < time) {
          lastSurvival = data.survival;
        }
      }
      atRisk = Math.round(group.initialCount * lastSurvival);
      
      const events = group.events.get(time) || 0;
      
      groupAtRisk[i] = atRisk;
      groupEvents[i] = events;
      totalEvents += events;
      totalAtRisk += atRisk;
    });

    if (totalAtRisk > 0 && totalEvents > 0) {
      // For each group except the last (since they sum to 0)
      for (let i = 0; i < groupData.length - 1; i++) {
        const observed = groupEvents[i];
        const expected = (groupAtRisk[i] / totalAtRisk) * totalEvents;
        const variance = totalAtRisk > 1 
          ? (groupAtRisk[i] * (totalAtRisk - groupAtRisk[i]) * totalEvents * (totalAtRisk - totalEvents)) 
            / (totalAtRisk * totalAtRisk * (totalAtRisk - 1))
          : 0;
        
        numerator += observed - expected;
        denominator += variance;
      }
    }
  }

  if (denominator <= 0) {
    return null;
  }

  const chiSquare = (numerator * numerator) / denominator;
  const df = survivalData.length - 1;
  const pValue = chiSquarePValue(chiSquare, df);

  return {
    pValue,
    chiSquare,
    degreesOfFreedom: df,
  };
}

/**
 * Format p-value for display
 */
export function formatPValue(pValue: number): string {
  if (pValue < 0.0001) {
    return "p < 0.0001";
  } else if (pValue < 0.001) {
    return `p = ${pValue.toExponential(2)}`;
  } else if (pValue < 0.01) {
    return `p = ${pValue.toFixed(4)}`;
  } else {
    return `p = ${pValue.toFixed(3)}`;
  }
}
