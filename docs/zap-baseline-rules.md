# Tuning ZAP baseline for BLACKGLASS

The GitHub Action [`.github/workflows/dast-zap-baseline.yml`](.github/workflows/dast-zap-baseline.yml) calls **`zaproxy/action-baseline`**. To suppress stable false positives:

1. Copy [`.zap/rules.tsv`](../.zap/rules.tsv) patterns from the [OWASP ZAP baseline rules format](https://www.zaproxy.org/docs/docker/baseline-scan/).
2. Uncomment real rule rows (format: `RULE_ID<TAB>IGNORE|WARN|FAIL` optional URL regex).
3. Add to the workflow **`with:`** block:

```yaml
rules_file_name: ".zap/rules.tsv"
```

4. When findings are stable enough, set **`fail_action: true`** so PRs break on new high-risk alerts.
