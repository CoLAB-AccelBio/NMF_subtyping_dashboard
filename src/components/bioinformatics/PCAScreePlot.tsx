import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Line, ComposedChart, ReferenceLine } from "recharts";
import { useMemo, useRef } from "react";
import { Download } from "lucide-react";
import { downloadChartAsPNG } from "@/lib/chartExport";

interface HeatmapData {
  genes: string[];
  samples: string[];
  sampleSubtypes: string[];
  values: number[][];
}

interface PCAScreePlotProps {
  heatmapData: HeatmapData;
}

// Compute all principal components variance using SVD-like approach on gene expression data
// For samples x genes matrix, number of PCs = min(samples, genes)
const computeAllPCAVariance = (values: number[][], nGenes: number, nSamples: number): { variances: number[]; cumulative: number[] } => {
  if (nSamples === 0 || nGenes === 0) return { variances: [], cumulative: [] };

  // Transpose to get samples as rows (samples x genes)
  const data: number[][] = [];
  for (let s = 0; s < nSamples; s++) {
    const row: number[] = [];
    for (let g = 0; g < nGenes; g++) {
      row.push(values[g][s]);
    }
    data.push(row);
  }

  const n = data.length; // samples
  const m = data[0].length; // genes

  // Center the data
  const means = Array(m).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      means[j] += data[i][j];
    }
  }
  for (let j = 0; j < m; j++) {
    means[j] /= n;
  }

  const centered = data.map(row => row.map((v, j) => v - means[j]));

  // Compute X^T X / (n-1) - the covariance matrix (m x m)
  // For efficiency with large m, we compute the Gram matrix X X^T (n x n) instead
  // The eigenvalues of X X^T / (n-1) are the same as X^T X / (n-1) (for non-zero ones)
  const useGram = n < m;
  
  let eigenvalues: number[] = [];
  let totalVariance = 0;

  if (useGram) {
    // Compute Gram matrix (n x n): X X^T
    const gram: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        let sum = 0;
        for (let k = 0; k < m; k++) {
          sum += centered[i][k] * centered[j][k];
        }
        gram[i][j] = sum / (n - 1);
        gram[j][i] = gram[i][j];
      }
    }

    // Total variance from Gram matrix trace
    for (let i = 0; i < n; i++) {
      totalVariance += gram[i][i];
    }

    // Power iteration on Gram matrix
    let currentGram = gram.map(row => [...row]);
    const maxPCs = Math.min(n, 50); // Limit for performance

    for (let pc = 0; pc < maxPCs; pc++) {
      let vector = Array(n).fill(0).map(() => Math.random());
      let norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
      vector = vector.map(v => v / norm);

      let eigenvalue = 0;
      for (let iter = 0; iter < 100; iter++) {
        const newVector = Array(n).fill(0);
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            newVector[i] += currentGram[i][j] * vector[j];
          }
        }
        eigenvalue = newVector.reduce((sum, v, i) => sum + v * vector[i], 0);
        norm = Math.sqrt(newVector.reduce((sum, v) => sum + v * v, 0));
        if (norm < 1e-10) break;
        vector = newVector.map(v => v / norm);
      }

      if (eigenvalue > 1e-6) {
        eigenvalues.push(eigenvalue);
        // Deflate
        currentGram = currentGram.map((row, i) =>
          row.map((v, j) => v - eigenvalue * vector[i] * vector[j])
        );
      } else {
        break;
      }
    }
  } else {
    // Compute covariance matrix (m x m)
    const cov: number[][] = Array(m).fill(null).map(() => Array(m).fill(0));
    for (let i = 0; i < m; i++) {
      for (let j = i; j < m; j++) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          sum += centered[k][i] * centered[k][j];
        }
        cov[i][j] = sum / (n - 1);
        cov[j][i] = cov[i][j];
      }
    }

    // Total variance
    for (let i = 0; i < m; i++) {
      totalVariance += cov[i][i];
    }

    // Power iteration
    let currentCov = cov.map(row => [...row]);
    const maxPCs = Math.min(m, 50);

    for (let pc = 0; pc < maxPCs; pc++) {
      let vector = Array(m).fill(0).map(() => Math.random());
      let norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
      vector = vector.map(v => v / norm);

      let eigenvalue = 0;
      for (let iter = 0; iter < 100; iter++) {
        const newVector = Array(m).fill(0);
        for (let i = 0; i < m; i++) {
          for (let j = 0; j < m; j++) {
            newVector[i] += currentCov[i][j] * vector[j];
          }
        }
        eigenvalue = newVector.reduce((sum, v, i) => sum + v * vector[i], 0);
        norm = Math.sqrt(newVector.reduce((sum, v) => sum + v * v, 0));
        if (norm < 1e-10) break;
        vector = newVector.map(v => v / norm);
      }

      if (eigenvalue > 1e-6) {
        eigenvalues.push(eigenvalue);
        // Deflate
        currentCov = currentCov.map((row, i) =>
          row.map((v, j) => v - eigenvalue * vector[i] * vector[j])
        );
      } else {
        break;
      }
    }
  }

  const variances = eigenvalues.map(e => totalVariance > 0 ? (e / totalVariance) * 100 : 0);
  const cumulative: number[] = [];
  let sum = 0;
  for (const v of variances) {
    sum += v;
    cumulative.push(Math.min(sum, 100));
  }

  return { variances, cumulative };
};

export const PCAScreePlot = ({ heatmapData }: PCAScreePlotProps) => {
  const chartRef = useRef<HTMLDivElement>(null);

  const chartData = useMemo(() => {
    const { variances, cumulative } = computeAllPCAVariance(
      heatmapData.values, 
      heatmapData.genes.length, 
      heatmapData.samples.length
    );

    return variances.map((variance, idx) => ({
      pc: `PC${idx + 1}`,
      pcNum: idx + 1,
      variance: variance,
      cumulative: cumulative[idx],
    }));
  }, [heatmapData]);

  const handleDownload = () => {
    downloadChartAsPNG(chartRef.current, "pca-scree-plot");
  };

  // Find PC where cumulative reaches 80%
  const pc80 = chartData.findIndex(d => d.cumulative >= 80);

  return (
    <Card className="border-0 bg-card/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg">PCA Scree Plot ({chartData.length} components)</CardTitle>
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="h-4 w-4 mr-1" />
          PNG
        </Button>
      </CardHeader>
      <CardContent>
        <div ref={chartRef} className="h-[200px] bg-card">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 40, bottom: 30, left: 10 }}>
              <XAxis
                dataKey="pcNum"
                type="number"
                domain={[1, chartData.length]}
                tick={{ fontSize: 9 }}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickFormatter={(v) => `${v}`}
                label={{ value: "Principal Component", position: "bottom", offset: 10, fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 9 }}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))" }}
                label={{ value: "Variance (%)", angle: -90, position: "insideLeft", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                tick={{ fontSize: 9 }}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))" }}
                label={{ value: "Cumulative (%)", angle: 90, position: "insideRight", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                formatter={(value: number, name: string) => [
                  `${value.toFixed(2)}%`,
                  name === "variance" ? "Variance" : "Cumulative"
                ]}
                labelFormatter={(label) => `PC${label}`}
              />
              <Bar yAxisId="left" dataKey="variance" fill="hsl(var(--primary))" radius={[1, 1, 0, 0]}>
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fillOpacity={0.8} />
                ))}
              </Bar>
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cumulative"
                stroke="hsl(var(--destructive))"
                strokeWidth={2}
                dot={false}
              />
              <ReferenceLine yAxisId="right" y={80} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.5} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-center text-muted-foreground mt-2">
          {pc80 >= 0 
            ? `80% variance explained by first ${pc80 + 1} components (dashed line)`
            : "Dashed line indicates 80% cumulative variance threshold"}
        </p>
      </CardContent>
    </Card>
  );
};
