# Tuning ZAP baseline for BLACKGLASS

The GitHub Action [`.github/workflows/dast-zap-baseline.yml`](.github/workflows/dast-zap-baseline.yml) calls **`zaproxy/action-baseline`** with **`rules_file_name: ".zap/rules.tsv"`** (requires **`actions/checkout`** — present in the workflow).

1. Edit [`.zap/rules.tsv`](../.zap/rules.tsv) using the [OWASP ZAP baseline rules format](https://www.zaproxy.org/docs/docker/baseline-scan/) (`RULE_ID<TAB>IGNORE|WARN|FAIL` + optional description).
2. Replace the starter **IGNORE** row with findings from your real staging report (don’t leave broad ignores that hide real issues).
3. When findings are stable enough, set **`fail_action: true`** so PRs break on new high-risk alerts.
