# Sakhaa Forge Repository Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the active application to Sakhaa Forge in canonical setup docs, resolve the B2/R2 storage conflict, and push a curated main branch to `Akshais97/sakhaa-forge`.

**Architecture:** This is repository hygiene before V0-F0 implementation. It changes documentation and repository tracking only; it does not create application runtime code or alter the V0 slice process.

**Tech Stack:** Markdown documentation, Git, GitHub remote, existing V0/Project source documents.

---

## File Structure

- Modify `README.md` to make Sakhaa Forge the application name and keep the V0 workflow description.
- Modify `docs/README.md`, `docs/V0/V0.md`, `docs/V0/V0_PRODUCT_SPECIFICATION.md`, `docs/V0/V0_ARCHITECTURE.md`, `docs/V0/V0_DOCUMENTATION_INDEX.md`, `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`, `docs/V0/V0_IMPLEMENTATION_PLAN.md`, `docs/Project/DESIGN.md`, `docs/Project/Design/PROJECT_BRAND_GUIDELINES.md`, `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`, `docs/V0/V0_INFORMATION_ARCHITECTURE.md`, and `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md` for current product naming.
- Modify `docs/Project/Architecture/PROJECT_ARCHITECTURE_PRINCIPLES.md` to replace the stale R2 media-storage line with Backblaze B2.
- Modify `.env.example` to use Sakhaa Forge local identifiers where user-visible.
- Create `.gitignore` to prevent legacy research folders, caches, media, virtual environments and generated binary artifacts from entering the new GitHub repository.
- Initialise Git on `main`, add a curated file set, commit, add `origin`, and push to `https://github.com/Akshais97/sakhaa-forge.git`.

## Task 1: Documentation Naming And Storage Authority

**Files:**
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/V0/V0.md`
- Modify: `docs/V0/V0_PRODUCT_SPECIFICATION.md`
- Modify: `docs/V0/V0_ARCHITECTURE.md`
- Modify: `docs/V0/V0_DOCUMENTATION_INDEX.md`
- Modify: `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- Modify: `docs/V0/V0_IMPLEMENTATION_PLAN.md`
- Modify: `docs/Project/DESIGN.md`
- Modify: `docs/Project/Design/PROJECT_BRAND_GUIDELINES.md`
- Modify: `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- Modify: `docs/V0/V0_INFORMATION_ARCHITECTURE.md`
- Modify: `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md`
- Modify: `docs/Project/Architecture/PROJECT_ARCHITECTURE_PRINCIPLES.md`
- Modify: `.env.example`

- [ ] **Step 1: Patch B2 authority**

Replace the stale sentence `R2 handles media and artifact storage.` with `Backblaze B2 handles media and artifact storage through private buckets and short-lived presigned access.`

- [ ] **Step 2: Patch current product naming**

Use `Sakhaa Forge` as the application/product name in current canonical docs. Keep `Virality Creator Engine` only as a descriptive engine/workflow term where that preserves existing V0 meaning.

- [ ] **Step 3: Verify naming and storage patch**

Run: `rg -n "\bR2\b|Cloudflare|Virality Creator Engine|Sakhaa Forge" README.md AGENTS.md docs/V0 docs/Project .env.example`

Expected: no `R2` storage authority remains in current V0/Project docs; `Sakhaa Forge` appears in current app identity surfaces.

## Task 2: Repository Hygiene

**Files:**
- Create: `.gitignore`
- Existing tracked candidates: `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, `.editorconfig`, `.env.example`, `.node-version`, `.nvmrc`, `.npmrc`, `.python-version`, `.tool-versions`, `docs/**`

- [ ] **Step 1: Create `.gitignore`**

Ignore local Python/Node caches, virtual environments, media, zip archives, legacy research folders, generated reports and unrelated historical experiments. Do not ignore `docs/`, root governance files or future V0 implementation folders such as `apps/`, `packages/`, `workers/`, `infra/` and `tests/`.

- [ ] **Step 2: Initialise Git main**

Run: `git init -b main`

Expected: repository initialised on `main`.

- [ ] **Step 3: Add curated files only**

Run: `git add AGENTS.md README.md CONTRIBUTING.md .editorconfig .env.example .node-version .nvmrc .npmrc .python-version .tool-versions .gitignore docs`

Expected: only governance/config/docs files are staged; legacy bloat remains untracked/ignored.

- [ ] **Step 4: Verify staged set**

Run: `git status --short`

Expected: staged docs and root setup files only. No media files, cache folders, legacy research folders, zip archives or virtual environment files are staged.

- [ ] **Step 5: Commit**

Run: `git commit -m "chore: initialise Sakhaa Forge V0 repository"`

Expected: one initial commit on `main`.

## Task 3: GitHub Remote Push

**Files:**
- Git remote metadata only.

- [ ] **Step 1: Add origin**

Run: `git remote add origin https://github.com/Akshais97/sakhaa-forge.git`

Expected: `origin` points to the Sakhaa Forge GitHub repository.

- [ ] **Step 2: Push main**

Run: `git push -u origin main`

Expected: `main` is pushed to GitHub. If authentication or network access fails, report the exact blocker and leave the local commit ready to push.

- [ ] **Step 3: Verify remote**

Run: `git status --short` and `git remote -v`

Expected: clean tracked state except ignored/untracked legacy local folders; origin is configured.

