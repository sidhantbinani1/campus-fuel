# EcoMenu AI — Team GitHub Workflow

This guide explains how our three-person team works on one GitHub project without overwriting each other's work.

## The big idea

GitHub is our shared project home, but it is not live editing like Google Docs. Each person works in their own copy of the project on a small **branch**. When their task works, it is merged into the shared `main` version.

```text
main (the shared version that should work)
  ├── jennifer-ui
  ├── meal-data
  └── search-and-compare
```

## Team roles for the first version

- Jennifer: homepage appearance, meal cards, and mobile design (`jennifer-ui`)
- Teammate 2: verified meal records in the dataset (`meal-data`)
- Teammate 3: search, filters, and comparison logic (`search-and-compare`)

Jennifer is the **merge captain**: before merging work into `main`, make sure it runs and does not overwrite somebody else's task.

## Our two rules

1. Never have two people edit the same file at the same time.
2. Never push work directly to `main`. Work in a named branch, then use a Pull Request to merge it.

## Starting a task

In your own Codex chat, paste this prompt and replace the branch name:

> I am collaborating in the shared GitHub repository `https://github.com/sidhantbinani1/ecomenu-ai.git`. I am a beginner. First make sure I have the latest shared `main` version, then create my own branch named `[MY-BRANCH-NAME]`. Do not change `main`. Tell me when it is safe for me to start working.

Suggested first branch names:

- `jennifer-ui`
- `meal-data`
- `search-and-compare`

## Finishing a task

After your feature works, paste this prompt into Codex:

> Check that my current work runs correctly. Commit and push only my changes to my current branch. Do not merge into `main`. Then give me the GitHub link to open a Pull Request.

On GitHub, open the Pull Request. Jennifer checks it, then selects **Merge pull request** when it is ready.

## Beginning the next task

After another person's Pull Request has been merged, paste this into Codex before you begin new work:

> My teammate's Pull Request was merged. Update my project to the latest `main` version before I start my next branch. Preserve any work that is not yet committed.

## Current next step

Create the starter EcoMenu app on `main` first. Once it is pushed to GitHub, each teammate can create their branch and work at the same time.
