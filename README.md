# Azure DevOps Branch Name Autofill

A Greasemonkey / Tampermonkey userscript that automatically fills in the
**"Create a branch"** name field in Azure DevOps based on the linked work item.

When you open the "New branch…" dialog from a work item, sprint board, backlog,
or Kanban board, the branch name input is populated with:

```
feature/1234-Title-In-Dash-Separated-Pascal-Case
```

## Installation

1. Install a userscript manager in your browser:
   - [Tampermonkey](https://www.tampermonkey.net/) (Chrome, Firefox, Edge, Safari)
   - [Greasemonkey](https://www.greasespot.net/) (Firefox)
   - [Violentmonkey](https://violentmonkey.github.io/) (Chrome, Firefox, Edge)
2. Click
   [**Install azure-devops-branch-name-autofill.user.js**](https://raw.githubusercontent.com/jamiegluk/azure-devops-branch-name-autofill/master/azure-devops-branch-name-autofill.user.js)
   — your userscript manager will prompt you to install it.
3. Navigate to Azure DevOps and open a "New branch…" dialog from any work item.

## How It Works

The script uses a `MutationObserver` to watch for the "Create a branch" dialog
appearing in the DOM. When detected, it:

1. Reads the linked work item ID and title from the dialog.
2. Formats the title into Dash-Separated-Pascal-Case.
3. Builds a branch name: `feature/{id}-{Formatted-Title}`.
4. Sets the branch name input value and selects it for easy editing.
5. Adds a **"Copy to clipboard"** button to the name field (appears on hover),
   matching the native Azure DevOps style.

## Customisation

The formatting logic and branch prefix are defined at the top of the script for
easy modification:

- **`BRANCH_PREFIX`** — change `"feature/"` to any prefix you prefer (e.g.
  `"bugfix/"`, `""`).
- **`formatTitle(title)`** — replace this function to use a different naming
  convention (e.g. kebab-case, snake_case).

## Compatibility

- Azure DevOps Services (`dev.azure.com` and `*.visualstudio.com`)
- Tested with Tampermonkey and Greasemonkey
- Works from: work item views, sprint taskboards, backlogs, and Kanban boards

## License

[MIT](LICENSE) — Jamie Lievesley
