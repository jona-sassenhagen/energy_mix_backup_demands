# Repository Guidelines

## Project Structure & Module Organization
- Root holds `plot.py`, the Dash entry point that wires layout, callbacks, and data transforms.
- Scenario capacity factors live in `df_cf.csv`; run the app from the repo root so `plot.py` resolves `scenarios/df_cf.csv` correctly.
- When expanding, place new analytics modules under `scenarios/` and keep supporting assets (figures, notebooks) in clearly named subfolders.

## Build, Test, and Development Commands
- `python -m venv .venv && source .venv/bin/activate` sets up an isolated environment for Dash and Plotly.
- `pip install dash plotly pandas numpy` installs the current runtime stack; pin versions before sharing.
- `python plot.py` launches the development server on http://127.0.0.1:8051 with hot reload.

## Coding Style & Naming Conventions
- Follow PEP 8 with 4-space indentation; group imports as standard/lib/third-party.
- Use `snake_case` for functions and component IDs (`nuclear_slider`), `UPPER_SNAKE_CASE` for constants, and `CapWords` for classes.
- Format prior to commit using `black plot.py` (line length 88) and sanity-check with `flake8` to keep callbacks tidy.

## Testing Guidelines
- No automated suite exists yet; add `tests/` with `test_*.py` as you extend functionality and favor `pytest` for Dash callback tests.
- Run `pytest` before raising a PR. Supplement with `python -m compileall plot.py` to catch syntax errors when UI tests are unavailable.
- Validate data changes by loading `df_cf.csv` in a short notebook or script to confirm column set and date coverage.

## Commit & Pull Request Guidelines
- With no prior history, default to Conventional Commits (`feat: add storage donut chart`) and keep subjects ≤72 characters.
- PRs should explain scenario assumptions, list new commands, attach a screenshot or GIF of UI updates, and link tracking issues.
- Document any edits to `df_cf.csv`, including data sources and regeneration steps, in the PR description or supporting docs.

## Data Handling & Configuration
- Treat `df_cf.csv` as canonical input; stash alternates under `data/raw/` with provenance notes before replacing the active file.
- Avoid committing large generated artifacts; extend `.gitignore` when adding new export routines, and never store credentials in the repo.
