# Contributing to Eva

Thanks for your interest in contributing to Eva. This guide will help you get started.

## Getting Started

Eva is a monorepo managed with pnpm. The main apps and packages are:

- **apps/web** — Vite + TanStack Router dashboard
- **apps/chrome-extension** — Browser extension
- **packages/backend** — Convex backend (serverless DB + functions)
- **packages/ui** — eva's config (look and defaults) for `@vvedantb/ui` components
- **packages/shared** — Shared utilities and types

### Prerequisites

- Node.js 20+
- pnpm 9+
- A [Convex](https://convex.dev) account
- A [Clerk](https://clerk.com) account

### Setup

1. Fork and clone the repo
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Copy `.env.example` to `.env.local` and fill in your environment variables
4. Start the Convex backend:
   ```bash
   pnpm convex
   ```
5. Start the web app:
   ```bash
   pnpm dev
   ```

## Making Changes

1. Create a branch from `main`
2. Make your changes
3. Test locally to ensure nothing is broken
4. Submit a pull request against `main`

### Code Style

- TypeScript only — no `any`, `unknown`, or `as` type assertions
- All components are client components (Vite SPA — no SSR)
- Keep changes minimal and focused — don't refactor surrounding code unless it's part of the PR's purpose
- No unnecessary comments or docstrings

### Commit Messages

Keep commit messages concise and descriptive. Focus on the "why" not the "what".

## Pull Requests

- Keep PRs focused on a single change
- Provide a clear description of what the PR does and why
- Link any related issues
- Make sure TypeScript compiles cleanly (`npx tsc`)

## Reporting Bugs

Open an issue with:

- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details (OS, browser, Node version)

## Feature Requests

Open an issue describing:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
