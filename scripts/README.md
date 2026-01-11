# NMF Subtyping Analysis - Command Line Tool

This is a command-line version of the NMF (Non-negative Matrix Factorization) subtyping analysis script.

## Features

- Download data directly from GEO or use local files
- Automatic rank selection using cophenetic correlation
- Survival analysis with Kaplan-Meier plots and Cox Proportional Hazards
- Comprehensive visualizations (consensus maps, heatmaps)
- JSON output for downstream analysis and dashboards

## Requirements

The script will automatically install required R packages:
- BiocManager
- GEOquery
- limma
- NMF
- survival
- jsonlite
- optparse

## Usage

### Basic Syntax

```bash
Rscript nmf_analysis_cli.R [OPTIONS]
```

### Required Parameters

You must provide **one** of the following combinations:

**Option 1: Using GEO data**
- `--geo_id` - GEO dataset ID (e.g., GSE62254)
- `--dataset` - Dataset name for labeling

**Option 2: Using local files**
- `--dataset` - Dataset name for labeling
- `--expr_file` - Path to expression matrix file
- `--samples_annot_file` - Path to sample annotation file

### Optional Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `-o, --output_dir` | Output directory for results | `nmf_output` |
| `--rank_min` | Minimum rank to test for NMF | `2` |
| `--rank_max` | Maximum rank to test for NMF | `6` |
| `--top_genes` | Number of top variable genes to use | `5000` |
| `--nrun` | Number of NMF runs at optimal rank | `30` |
| `--seed` | Random seed for reproducibility | `123` |
| `--surv_time_col` | Column name for survival time (auto-detected if not specified) | `NULL` |
| `--surv_event_col` | Column name for survival event (auto-detected if not specified) | `NULL` |

### Help

```bash
Rscript nmf_analysis_cli.R --help
```

## Examples

### Example 1: Download from GEO

```bash
Rscript nmf_analysis_cli.R \
  --geo_id GSE62254 \
  --dataset GSE62254 \
  --output_dir results/GSE62254
```

### Example 2: Use local files

```bash
Rscript nmf_analysis_cli.R \
  --dataset MyDataset \
  --expr_file data/expression_matrix.txt \
  --samples_annot_file data/sample_annotations.txt \
  --output_dir results/MyDataset
```

### Example 3: Custom rank range and parameters

```bash
Rscript nmf_analysis_cli.R \
  --dataset MyDataset \
  --expr_file data/expression_matrix.txt \
  --samples_annot_file data/sample_annotations.txt \
  --output_dir results/MyDataset_custom \
  --rank_min 3 \
  --rank_max 8 \
  --top_genes 3000 \
  --nrun 50 \
  --seed 456
```

### Example 4: Specify survival analysis columns

```bash
Rscript nmf_analysis_cli.R \
  --dataset MyDataset \
  --expr_file data/expression_matrix.txt \
  --samples_annot_file data/sample_annotations.txt \
  --surv_time_col "OS_months" \
  --surv_event_col "death_event"
```

## Input File Formats

### Expression Matrix File (`--expr_file`)
- Tab-delimited text file
- Genes as rows, samples as columns
- First column: gene names/IDs
- Header row with sample IDs

Example:
```
Gene	Sample1	Sample2	Sample3
GENE1	5.2	6.1	4.8
GENE2	7.3	7.9	6.5
...
```

### Sample Annotation File (`--samples_annot_file`)
- Tab-delimited text file
- Samples as rows
- First column: sample IDs (must match expression file)
- Additional columns: clinical/phenotypic data

Example:
```
Sample	Age	Gender	DFS.m	recur
Sample1	65	M	24	yes
Sample2	52	F	36	no
...
```

**Important:** For survival analysis, you can either:

1. **Let the script auto-detect** columns named:
   - Time: `DFS.m`, `survival`, `time`, `months` (case-insensitive)
   - Event: `recur`, `death`, `status`, `event` (case-insensitive)

2. **Specify exact column names** using:
   - `--surv_time_col "your_time_column"`
   - `--surv_event_col "your_event_column"`

## Output Files

All outputs are saved in the specified output directory:

### Main Results
- `nmf_results.json` - Complete analysis results in JSON format
- `samples_annotation.tsv` - Sample annotations with NMF subtypes and scores

### Visualizations
- `nmf_rank_estimation.pdf` - Rank selection metrics
- `nmf_consensus_heatmap.pdf` - Sample consensus clustering
- `nmf_basis_heatmap.pdf` - Gene basis matrix
- `nmf_coef_heatmap.pdf` - Sample coefficient matrix
- `kaplan_meier_plot.pdf` - Survival curves (if survival data available)

### Additional Data
- `nmf_sample_results.json` - Sample-level results
- `nmf_marker_genes.json` - Marker genes for each subtype
- `heatmap_expression_matrix.tsv` - Top 200 variable genes expression

## Making the Script Executable (Linux/Mac)

```bash
# Make executable
chmod +x nmf_analysis_cli.R

# Run directly
./nmf_analysis_cli.R --dataset MyDataset --expr_file data.txt --samples_annot_file annot.txt
```

## Troubleshooting

### Package Installation Issues

If you encounter issues with BiocManager or Bioconductor packages:

```R
# In R console:
install.packages("BiocManager")
BiocManager::install(c("GEOquery", "limma", "NMF"))
```

### Memory Issues

For large datasets, you may need to:
- Reduce `--top_genes` (e.g., to 3000 or 2000)
- Reduce `--nrun` (e.g., to 20 or 10)
- Increase system memory

### Survival Analysis Not Working

Ensure your sample annotation file has columns for:
- Survival time (numeric)
- Event status (yes/no, 1/0, or death/censored)

The script auto-detects common column name patterns. If your columns have different names, use:
```bash
--surv_time_col "YourTimeColumn" --surv_event_col "YourEventColumn"
```

## Citation

If you use this tool, please cite the NMF package:
```
Gaujoux R and Seoighe C (2010). "A flexible R package for nonnegative matrix factorization." 
BMC Bioinformatics, 11(1), 367.
```

## License

This script is provided as-is for research purposes.
