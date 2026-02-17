# Career Salary Predictor (100% Static + Pyodide)

This app is fully static and runs salary estimation in-browser using Python (Pyodide).

## Files

- `index.html`
- `style.css`
- `app.js`
- `salary_model.py`
- `salary_data.json`
- `README.md`

No backend is required.

## Local run

Because browsers block some local file fetches (`file://`), serve the folder over HTTP:

```bash
cd "/Users/johnnymaris/Desktop/career-salary-predictor"
python3 -m http.server 8000
```

Open:

- `http://127.0.0.1:8000/`

## Deploy static

Deploy this folder as-is to:

- Render Static Site
- GitHub Pages
- Netlify

## Notes

- The app fetches `salary_data.json` once and caches it in memory.
- The estimator function is `estimate_salary(payload, salary_data)` in `salary_model.py`.
- Disclaimer: Not financial advice; estimates vary.
