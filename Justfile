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

# Production web build → dist/
build:
    npm run build

# Build headless entry and run smoke check
smoke:
    npm run headless -- --seed 42 --ticks 10

# Vite dev server
dev:
    npm run dev

# Preview production build
preview:
    npm run preview

# Full CI sequence
ci: typecheck lint test build smoke
