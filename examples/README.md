# Workshop notes

Synthetic data for exercising Lineglade. Run `npm run example` to regenerate the six artifacts.

- `workshop.jsonl`: original seven physical lines, CRLF endings.
- `matches.jsonl`: five valid records, exact source spelling and CRLF preserved.
- `project.json`: portable source, settings and notes.
- `report.json`: complete machine-readable inspection and diagnostics.
- `report.html`: standalone human-readable complete report.
- `summary.svg`: generated summary illustration, not a screenshot.

Line 4 deliberately duplicates `content`; a pointer to `/content` is ambiguous there. Line 5 has a trailing comma and is invalid. Line 6 is blank. The sample includes `9007199254740993` and `1e400` to demonstrate token preservation. User / assistant labels are fictional data.
