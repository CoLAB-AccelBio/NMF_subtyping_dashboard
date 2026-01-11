# NMF Analysis CLI - Quick Reference

## Quick Start

### Using GEO Data
```bash
Rscript nmf_analysis_cli.R --geo_id GSE62254 --dataset GSE62254
```

### Using Local Files
```bash
Rscript nmf_analysis_cli.R \
  --dataset MyDataset \
  --expr_file expression.txt \
  --samples_annot_file annotations.txt
```

## All Parameters

### Required (choose one mode)

**GEO Mode:**
```bash
--geo_id GEO_ID          # e.g., GSE62254
--dataset DATASET_NAME   # any descriptive name
```

**Local Files Mode:**
```bash
--dataset DATASET_NAME              # any descriptive name
--expr_file FILE                    # expression matrix (genes × samples)
--samples_annot_file FILE           # sample annotations
```

### Optional

```bash
-o, --output_dir DIR        # output directory (default: nmf_output)
--rank_min INT              # minimum NMF rank to test (default: 2)
--rank_max INT              # maximum NMF rank to test (default: 6)
--top_genes INT             # number of variable genes (default: 5000)
--nrun INT                  # NMF runs at optimal rank (default: 30)
--seed INT                  # random seed (default: 123)
--surv_time_col COLUMN      # survival time column (auto-detected if not specified)
--surv_event_col COLUMN     # survival event column (auto-detected if not specified)
```

## Common Use Cases

### 1. Quick analysis with GEO data
```bash
Rscript nmf_analysis_cli.R --geo_id GSE62254 --dataset GSE62254
```

### 2. Custom output directory
```bash
Rscript nmf_analysis_cli.R \
  --geo_id GSE62254 \
  --dataset GSE62254 \
  --output_dir /path/to/results
```

### 3. Test wider rank range
```bash
Rscript nmf_analysis_cli.R \
  --dataset MyData \
  --expr_file expr.txt \
  --samples_annot_file annot.txt \
  --rank_min 2 \
  --rank_max 10
```

### 4. Faster testing (fewer runs)
```bash
Rscript nmf_analysis_cli.R \
  --dataset MyData \
  --expr_file expr.txt \
  --samples_annot_file annot.txt \
  --nrun 10 \
  --top_genes 2000
```

### 5. High-quality results (more runs)
```bash
Rscript nmf_analysis_cli.R \
  --dataset MyData \
  --expr_file expr.txt \
  --samples_annot_file annot.txt \
  --nrun 100 \
  --rank_min 2 \
  --rank_max 8
```

### 6. Custom survival analysis columns
```bash
Rscript nmf_analysis_cli.R \
  --dataset MyData \
  --expr_file expr.txt \
  --samples_annot_file annot.txt \
  --surv_time_col "OS_months" \
  --surv_event_col "death_event"
```

## Input File Requirements

### Expression Matrix (--expr_file)
- Tab-delimited text
- Genes in rows, samples in columns
- Header row with sample IDs
- First column with gene IDs

### Sample Annotations (--samples_annot_file)
- Tab-delimited text
- Samples in rows
- First column with sample IDs (matching expression file)
- Optional columns for clinical data

**For survival analysis**, include columns for time and event:
- Auto-detected column names:
  - Time: `DFS.m`, `survival`, `time`, or `months`
  - Event: `recur`, `death`, `status`, or `event`
- Or specify exact names:
  - `--surv_time_col "your_column"`
  - `--surv_event_col "your_column"`

## Output Files

**Main results:**
- `nmf_results.json` - complete analysis
- `samples_annotation.tsv` - samples with subtypes

**Plots:**
- `nmf_rank_estimation.pdf`
- `nmf_consensus_heatmap.pdf`
- `nmf_basis_heatmap.pdf`
- `nmf_coef_heatmap.pdf`
- `kaplan_meier_plot.pdf` (if survival data)

**Additional:**
- `nmf_sample_results.json`
- `nmf_marker_genes.json`
- `heatmap_expression_matrix.tsv`

## Troubleshooting

### Get help
```bash
Rscript nmf_analysis_cli.R --help
```

### Test with minimal parameters
```bash
Rscript nmf_analysis_cli.R \
  --dataset Test \
  --expr_file data.txt \
  --samples_annot_file annot.txt \
  --rank_max 3 \
  --nrun 5 \
  --top_genes 1000
```

### Common errors

**"Error: --dataset is required"**
→ Always specify --dataset parameter

**"Error: --expr_file is required"**
→ When not using --geo_id, both --expr_file and --samples_annot_file are required

**"Error: Expression file not found"**
→ Check file path is correct

**Package installation fails**
→ Try installing packages manually in R first

## Performance Tips

- **Faster:** Reduce `--nrun`, `--top_genes`, `--rank_max`
- **Higher quality:** Increase `--nrun` (50-100)
- **Large datasets:** Reduce `--top_genes` to 2000-3000
- **Memory issues:** Reduce `--top_genes` and `--nrun`

## Examples Directory

Run the interactive examples:
```bash
bash run_examples.sh
```
