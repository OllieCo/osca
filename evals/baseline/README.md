# Eval Baseline

`baseline.json` is the reference run against which the regression detector compares every subsequent `dispatcher-eval` run.

## Baseline refresh policy

Re-baseline **only** on an intentional model or prompt rollout. Never re-baseline to suppress a regression.

Steps to re-baseline:
1. Confirm the new model or prompt change is intentional and reviewed.
2. Run `tsx evals/dispatcher-eval.ts --model <model> --baseline`.
3. Commit `baseline.json` in the same PR as the model/prompt change.
4. Note the baseline run ID in the PR description.

## Baseline metadata fields

| Field | Description |
|-------|-------------|
| `run_id` | Unique run identifier (`run-<timestamp>`) |
| `timestamp` | ISO-8601 datetime of the baseline run |
| `model` | Ollama model name + version pinned |
| `temperature` | Temperature setting (always 0 for reproducibility) |
| `prompt_hash` | SHA-256 prefix of all prompt files at time of run |
| `case_count` | Number of cases in the golden set at baseline time |
| `categories` | Pass rates per category at baseline |

## Retention

Superseded baseline files are archived under `baseline/archive/` with the run ID as filename.
Run artefact JSON reports are stored under `evals/reports/` — target 1-year retention
(OBS integration pending Observability project delivery).
