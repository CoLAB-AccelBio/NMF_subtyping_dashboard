import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Loader2 } from "lucide-react";
import { exportAllAsZip, ChartRef, getChartAsPNGBlob } from "@/lib/chartExport";
import JSZip from "jszip";

interface ExportAllButtonProps {
  getChartRefs: () => ChartRef[];
}

export const ExportAllButton = ({ getChartRefs }: ExportAllButtonProps) => {
  const [isExporting, setIsExporting] = useState(false);

  const handleExportPNG = useCallback(async () => {
    setIsExporting(true);
    try {
      const charts = getChartRefs();
      await exportAllAsZip(charts, 'png', 'nmf-visualizations');
    } finally {
      setIsExporting(false);
    }
  }, [getChartRefs]);

  const handleExportSVG = useCallback(async () => {
    setIsExporting(true);
    try {
      const charts = getChartRefs();
      await exportAllAsZip(charts, 'svg', 'nmf-visualizations');
    } finally {
      setIsExporting(false);
    }
  }, [getChartRefs]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isExporting}>
          {isExporting ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-1" />
          )}
          Export All
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover">
        <DropdownMenuItem onClick={handleExportPNG}>
          Export as PNG (ZIP)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportSVG}>
          Export as SVG (ZIP)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
