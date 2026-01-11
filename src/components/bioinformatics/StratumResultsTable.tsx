import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, AlertTriangle, CheckCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPValue } from "@/lib/logRankTest";
import { StratifiedCoxPHResult } from "@/lib/coxphAnalysis";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface StratumResultsTableProps {
  result: StratifiedCoxPHResult;
  subtypeColors: Record<string, string>;
  stratifyBy: string;
}

export const StratumResultsTable = ({ result, subtypeColors, stratifyBy }: StratumResultsTableProps) => {
  // Export stratum results as CSV/TSV
  const exportStratumData = (format: 'csv' | 'tsv') => {
    const separator = format === 'csv' ? ',' : '\t';
    const lines: string[] = [];
    
    // Header
    lines.push(['Stratum', 'N Samples', 'Subtype', 'Hazard Ratio', 'Lower 95% CI', 'Upper 95% CI', 'P-value', 'Significant'].join(separator));
    
    // Stratum-specific results
    result.strataResults.forEach(stratum => {
      stratum.groups.forEach(g => {
        lines.push([
          stratum.stratum,
          stratum.nSamples.toString(),
          g.subtype,
          g.hazardRatio.toFixed(4),
          g.lowerCI.toFixed(4),
          g.upperCI.toFixed(4),
          g.pValue.toExponential(4),
          g.pValue < 0.05 ? 'Yes' : 'No'
        ].join(separator));
      });
    });
    
    // Add interaction test result if available
    if (result.interactionTest) {
      lines.push('');
      lines.push(['Interaction Test (Cochran Q)', '', '', result.interactionTest.chiSquare.toFixed(4), 'df=' + result.interactionTest.df, '', result.interactionTest.pValue.toExponential(4), result.interactionTest.significant ? 'Yes' : 'No'].join(separator));
    }
    
    const content = lines.join('\n');
    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'text/tab-separated-values' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stratum-specific-results.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (result.strataResults.length === 0) {
    return null;
  }

  return (
    <Card className="border-0 bg-card/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <CardTitle className="text-lg">Stratum-Specific Hazard Ratios</CardTitle>
          <Badge variant="outline" className="text-xs">
            Stratified by {stratifyBy}
          </Badge>
          {result.interactionTest && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge 
                    variant={result.interactionTest.significant ? "destructive" : "secondary"}
                    className="cursor-help"
                  >
                    {result.interactionTest.significant ? (
                      <AlertTriangle className="h-3 w-3 mr-1" />
                    ) : (
                      <CheckCircle className="h-3 w-3 mr-1" />
                    )}
                    Interaction: {formatPValue(result.interactionTest.pValue)}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">
                    {result.interactionTest.significant 
                      ? "Significant interaction detected" 
                      : "No significant interaction"}
                  </p>
                  <p className="text-xs">
                    {result.interactionTest.significant 
                      ? `The effect of NMF subtypes on survival varies significantly across ${stratifyBy} strata (p=${formatPValue(result.interactionTest.pValue)}). Interpret pooled results with caution.`
                      : `The effect of NMF subtypes is consistent across ${stratifyBy} strata (p=${formatPValue(result.interactionTest.pValue)}). Pooled results are appropriate.`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Cochran's Q = {result.interactionTest.chiSquare.toFixed(2)}, df = {result.interactionTest.df}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportStratumData('csv')}>
            <FileSpreadsheet className="h-4 w-4 mr-1" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportStratumData('tsv')}>
            <FileSpreadsheet className="h-4 w-4 mr-1" />
            TSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Stratum</TableHead>
                <TableHead className="w-[80px] text-right">N</TableHead>
                <TableHead>Subtype</TableHead>
                <TableHead className="text-right">HR (95% CI)</TableHead>
                <TableHead className="text-right w-[100px]">P-value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.strataResults.map((stratum, stratumIdx) => (
                <>
                  {/* Reference group row */}
                  <TableRow key={`${stratum.stratum}-ref`} className={stratumIdx > 0 ? "border-t-2" : ""}>
                    <TableCell className="font-medium" rowSpan={stratum.groups.length + 1}>
                      {stratum.stratum}
                    </TableCell>
                    <TableCell className="text-right" rowSpan={stratum.groups.length + 1}>
                      {stratum.nSamples}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: subtypeColors[result.referenceGroup] || 'hsl(var(--primary))' }}
                        />
                        {result.referenceGroup}
                        <Badge variant="outline" className="text-xs">Ref</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">1.00 (reference)</TableCell>
                    <TableCell className="text-right">—</TableCell>
                  </TableRow>
                  {/* Comparison groups */}
                  {stratum.groups.map((group) => (
                    <TableRow key={`${stratum.stratum}-${group.subtype}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: subtypeColors[group.subtype] || 'hsl(var(--primary))' }}
                          />
                          {group.subtype}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {group.hazardRatio.toFixed(2)} ({group.lowerCI.toFixed(2)}–{group.upperCI.toFixed(2)})
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge 
                          variant={group.pValue < 0.05 ? "default" : "secondary"}
                          className={`text-xs ${group.pValue < 0.05 ? "bg-green-600 hover:bg-green-700" : ""}`}
                        >
                          {formatPValue(group.pValue)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              ))}
            </TableBody>
          </Table>
        </div>
        
        <p className="text-xs text-muted-foreground mt-3 text-center">
          Hazard ratios computed within each stratum. HR &gt; 1 indicates increased risk compared to {result.referenceGroup}.
        </p>
      </CardContent>
    </Card>
  );
};
