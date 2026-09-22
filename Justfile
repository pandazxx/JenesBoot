set shell := ["bash", "-c"]

# Install dependencies
install:
    npm ci

# Type-check
typecheck:
    npm run typecheck

# Lint
lint:
    npm run lint

# Run all tests (unit + scenario)
test:
    npm run test

# Generate HTML test report from junit.xml + scenario-results.json
# Runs after `just test`. Fails loudly locally so errors are visible.
# In CI the caller wraps this with || true so a generator error never
# masks the test pass/fail signal.
report:
    npm run report

# Production web build → dist/
build:
    npm run build

# Build headless entry and run smoke check
smoke:
    npm run headless -- --seed 42 --ticks 10

# Vite dev server (serves game at /JenesBoot/ and QA viewer at /JenesBoot/qa/)
dev:
    npm run dev

# Alias: open the QA viewer entry via the same dev server
dev-qa:
    npm run dev

# Preview production build
preview:
    npm run preview

# Full CI sequence
ci: typecheck lint test report build smoke
