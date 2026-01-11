import html2canvas from "html2canvas";
import JSZip from "jszip";

export interface ChartExportOptions {
  backgroundColor?: string;
  scale?: number;
  paddingRight?: number;
  paddingBottom?: number;
}

export const downloadChartAsPNG = async (
  element: HTMLElement | null,
  filename: string,
  options: ChartExportOptions = {}
): Promise<void> => {
  if (!element) return;

  const {
    backgroundColor = "#ffffff",
    scale = 4,
    paddingRight = 0,
    paddingBottom = 0,
  } = options;

  try {
    const canvas = await html2canvas(element, {
      backgroundColor,
      scale,
      logging: false,
      useCORS: true,
      allowTaint: true,
      width: element.scrollWidth + paddingRight,
      height: element.scrollHeight + paddingBottom,
      windowWidth: element.scrollWidth + paddingRight,
      windowHeight: element.scrollHeight + paddingBottom,
      onclone: (clonedDoc) => {
        const clonedElement = clonedDoc.body.querySelector('[data-heatmap-container]') || clonedDoc.body;
        const textElements = clonedElement.querySelectorAll('*');
        textElements.forEach((el) => {
          if (el instanceof HTMLElement) {
            el.style.fontFamily = 'system-ui, -apple-system, sans-serif';
          }
        });
      }
    });

    const link = document.createElement("a");
    link.download = `${filename}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (error) {
    console.error("Failed to export chart:", error);
  }
};

// Returns PNG as blob for ZIP export
export const getChartAsPNGBlob = async (
  element: HTMLElement | null,
  options: ChartExportOptions = {}
): Promise<Blob | null> => {
  if (!element) return null;

  const {
    backgroundColor = "#ffffff",
    scale = 4,
    paddingRight = 0,
    paddingBottom = 0,
  } = options;

  try {
    const canvas = await html2canvas(element, {
      backgroundColor,
      scale,
      logging: false,
      useCORS: true,
      allowTaint: true,
      width: element.scrollWidth + paddingRight,
      height: element.scrollHeight + paddingBottom,
      windowWidth: element.scrollWidth + paddingRight,
      windowHeight: element.scrollHeight + paddingBottom,
      onclone: (clonedDoc) => {
        const clonedElement = clonedDoc.body.querySelector('[data-heatmap-container]') || clonedDoc.body;
        const textElements = clonedElement.querySelectorAll('*');
        textElements.forEach((el) => {
          if (el instanceof HTMLElement) {
            el.style.fontFamily = 'system-ui, -apple-system, sans-serif';
          }
        });
      }
    });

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    });
  } catch (error) {
    console.error("Failed to export chart:", error);
    return null;
  }
};

export const downloadSVGAsFile = (
  svgElement: SVGElement | null,
  filename: string
): void => {
  if (!svgElement) return;

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgElement);
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.download = `${filename}.svg`;
  link.href = url;
  link.click();

  URL.revokeObjectURL(url);
};

// Returns SVG as string for ZIP export
export const getSVGAsString = (
  containerElement: HTMLElement | null
): string | null => {
  if (!containerElement) return null;

  // Find the chart SVG specifically - look for Recharts container or the largest SVG
  // Avoid icon SVGs (small, typically in buttons) by checking size and context
  const allSvgs = containerElement.querySelectorAll('svg');
  let chartSvg: SVGElement | null = null;
  let maxArea = 0;

  allSvgs.forEach((svg) => {
    // Skip SVGs inside buttons (likely icons)
    if (svg.closest('button')) return;
    
    // Skip very small SVGs (icons are typically < 32px)
    const width = svg.getBoundingClientRect().width;
    const height = svg.getBoundingClientRect().height;
    const area = width * height;
    
    // Look for the largest SVG that's not an icon
    if (width > 50 && height > 50 && area > maxArea) {
      maxArea = area;
      chartSvg = svg as SVGElement;
    }
  });

  // Fallback: try to find SVG in recharts-wrapper or similar chart containers
  if (!chartSvg) {
    chartSvg = containerElement.querySelector('.recharts-wrapper svg') as SVGElement | null;
  }

  if (!chartSvg) return null;

  const clonedSvg = chartSvg.cloneNode(true) as SVGElement;
  
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('width', '100%');
  rect.setAttribute('height', '100%');
  rect.setAttribute('fill', 'white');
  clonedSvg.insertBefore(rect, clonedSvg.firstChild);

  const serializer = new XMLSerializer();
  return serializer.serializeToString(clonedSvg);
};

export const downloadRechartsAsSVG = (
  containerElement: HTMLElement | null,
  filename: string
): void => {
  if (!containerElement) return;

  const svgElement = containerElement.querySelector('svg');
  if (!svgElement) {
    console.error("No SVG element found in container");
    return;
  }

  const clonedSvg = svgElement.cloneNode(true) as SVGElement;
  
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('width', '100%');
  rect.setAttribute('height', '100%');
  rect.setAttribute('fill', 'white');
  clonedSvg.insertBefore(rect, clonedSvg.firstChild);

  downloadSVGAsFile(clonedSvg, filename);
};

export interface ChartRef {
  id: string;
  name: string;
  ref: HTMLElement | null;
  type: 'recharts' | 'heatmap' | 'cards';
  pngOptions?: ChartExportOptions;
}

export const exportAllAsZip = async (
  charts: ChartRef[],
  format: 'png' | 'svg',
  filename: string = 'nmf-visualizations'
): Promise<void> => {
  const zip = new JSZip();
  const folder = zip.folder(filename);
  
  if (!folder) return;

  for (const chart of charts) {
    if (!chart.ref) continue;

    try {
      if (format === 'png') {
        const blob = await getChartAsPNGBlob(chart.ref, chart.pngOptions);
        if (blob) {
          folder.file(`${chart.name}.png`, blob);
        }
      } else {
        const svgString = getSVGAsString(chart.ref);
        if (svgString) {
          folder.file(`${chart.name}.svg`, svgString);
        }
      }
    } catch (error) {
      console.error(`Failed to export ${chart.name}:`, error);
    }
  }

  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  
  const link = document.createElement("a");
  link.download = `${filename}-${format}.zip`;
  link.href = url;
  link.click();

  URL.revokeObjectURL(url);
};
