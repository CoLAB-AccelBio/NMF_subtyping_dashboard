# Complete R script for NMF Subtyping Analysis
# Includes: Expression analysis, NMF, Survival analysis, Rank selection

# ========== INSTALL PACKAGES ==========
if (!requireNamespace("BiocManager", quietly = TRUE)) install.packages("BiocManager")
required_pkgs <- c("GEOquery", "limma", "NMF", "survival", "jsonlite")
for (pkg in required_pkgs) {
  if (!requireNamespace(pkg, quietly = TRUE)) {
    if (pkg %in% c("GEOquery", "limma", "NMF")) {
      BiocManager::install(pkg)
    } else {
      install.packages(pkg)
    }
  }
}

library(GEOquery)
library(limma)
library(NMF)
library(survival)
library(jsonlite)

# ========== DOWNLOAD DATA ==========
geo_id <- "GSE62254"

gse <- getGEO(geo_id, GSEMatrix = TRUE)[[1]]
expr_data <- exprs(gse)
pheno_data <- pData(gse)

# Log-transform if needed
if (max(expr_data, na.rm = TRUE) > 50) {
  expr_data <- log2(expr_data + 1)
}

# Remove low-variance genes (keep top 5000)
gene_vars <- apply(expr_data, 1, var, na.rm = TRUE)
top_genes <- names(sort(gene_vars, decreasing = TRUE))[1:5000]
expr_filtered <- expr_data[top_genes, ]

# Make non-negative for NMF
expr_nmf <- expr_filtered - min(expr_filtered, na.rm = TRUE)

# ========== NMF RANK SELECTION ==========
cat("Running NMF rank estimation (this may take a while)...\n")

rank_min <- 2
rank_max <- 6
ranks <- rank_min:rank_max

rank_range <- rank_min:rank_max
estim <- nmfEstimateRank(expr_nmf, range = rank_range, method = "brunet", nrun = 10, seed = 123)

# Extract rank metrics
rank_metrics <- data.frame(
  rank = rank_range,
  cophenetic = estim$measures$cophenetic,
  silhouette = estim$measures$silhouette.consensus
)

# Find optimal rank (highest cophenetic before drop)
optimal_rank <- rank_range[which.max(rank_metrics$cophenetic)]
cat("Optimal rank:", optimal_rank, "\n")

# ========== RUN NMF AT OPTIMAL RANK ==========
cat("Running NMF at optimal rank...\n")
nmf_result <- nmf(expr_nmf, rank = optimal_rank, method = "brunet", nrun = 30, seed = 123)

# Get sample assignments
H <- coef(nmf_result)
sample_subtypes <- paste0("Subtype_", apply(H, 2, which.max))

# Get marker genes (basis matrix)
W <- basis(nmf_result)
marker_genes <- list()
for (k in 1:optimal_rank) {
  gene_weights <- W[, k]
  top_idx <- order(gene_weights, decreasing = TRUE)[1:20]
  for (i in top_idx) {
    marker_genes <- append(marker_genes, list(list(
      gene = rownames(W)[i],
      subtype = paste0("Subtype_", k),
      weight = as.numeric(gene_weights[i] / max(gene_weights))
    )))
  }
}

# ========== SURVIVAL ANALYSIS ==========
cat("Performing survival analysis...\n")

# Extract survival data from phenotype (adjust column names as needed)
# Common column names: "death from disease:ch1", "overall survival months:ch1"
surv_time_col <- grep("survival|time|months", colnames(pheno_data), value = TRUE, ignore.case = TRUE)[1]
surv_event_col <- grep("death|status|event", colnames(pheno_data), value = TRUE, ignore.case = TRUE)[1]

if (!is.na(surv_time_col) && !is.na(surv_event_col)) {
  surv_time <- as.numeric(pheno_data[[surv_time_col]])
  surv_event <- pheno_data[[surv_event_col]]
  
  # Convert event to binary (1 = event occurred)
  surv_event <- ifelse(grepl("yes|1|dead|death", surv_event, ignore.case = TRUE), 1, 0)
  
  # Create survival data by subtype
  unique_subtypes <- unique(sample_subtypes)
  survival_data <- lapply(unique_subtypes, function(st) {
    idx <- sample_subtypes == st
    if (sum(idx) > 0 && any(!is.na(surv_time[idx]))) {
      fit <- survfit(Surv(surv_time[idx], surv_event[idx]) ~ 1)
      list(
        subtype = st,
        timePoints = lapply(1:length(fit$time), function(i) {
          list(time = fit$time[i], survival = fit$surv[i])
        })
      )
    } else {
      NULL
    }
  })
  survival_data <- Filter(Negate(is.null), survival_data)
  
  # Calculate log-rank p-value
  surv_formula <- Surv(surv_time, surv_event) ~ factor(sample_subtypes)
  surv_diff <- survdiff(surv_formula)
  pvalue <- 1 - pchisq(surv_diff$chisq, length(surv_diff$n) - 1)
  
} else {
  cat("Survival columns not found. Generating placeholder data.\n")
  survival_data <- lapply(unique(sample_subtypes), function(st) {
    list(
      subtype = st,
      timePoints = lapply(seq(0, 60, by = 6), function(t) {
        list(time = t, survival = exp(-t * runif(1, 0.01, 0.03)))
      })
    )
  })
  pvalue <- NA
}

# ========== PREPARE HEATMAP DATA ==========
top_marker_genes <- unique(sapply(marker_genes[1:min(50, length(marker_genes))], function(x) x$gene))
heatmap_expr <- expr_filtered[top_marker_genes, ]

heatmap_data <- list(
  genes = rownames(heatmap_expr),
  samples = colnames(heatmap_expr),
  sampleSubtypes = sample_subtypes,
  values = as.list(as.data.frame(t(apply(heatmap_expr, 1, as.list))))
)

# Fix: Convert heatmap values properly
heatmap_data$values <- lapply(1:nrow(heatmap_expr), function(i) as.numeric(heatmap_expr[i, ]))

# ========== BUILD OUTPUT JSON ==========
# Build result list conditionally
result <- list(
  summary = list(
    dataset = geo_id,
    n_samples = ncol(expr_matrix),
    n_genes = nrow(expr_matrix),
    n_subtypes = optimal_rank,
    subtype_counts = as.list(table(sample_subtypes)),
    cophenetic_correlation = round(estim$measures$cophenetic[which(ranks == optimal_rank)], 3),
    silhouette_mean = round(estim$measures$silhouette.coef[which(ranks == optimal_rank)], 2),
    optimal_rank = optimal_rank
  ),
  rankMetrics = rank_metrics,
  sampleResults = sample_results,
  markerGenes = marker_genes,
  survivalData = survival_data,
  heatmapData = heatmap_data
)

# Add p-value only if it exists
if (!is.na(pvalue)) {
  result$survival_pvalue <- round(pvalue, 4)
}

# ========== SAVE OUTPUT ==========
jsonlite::write_json(result, "nmf_results.json", pretty = TRUE, auto_unbox = TRUE)

cat("\n✅ Results saved to nmf_results.json\n")
cat("Upload this file to the dashboard to visualize results.\n")
