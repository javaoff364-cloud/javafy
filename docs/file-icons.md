# Javafy File Icon Theme

The `assets/vscode-icons` folder is a self-contained Visual Studio Code icon theme extension. It includes the extension manifest, theme JSON, and all SVG assets.

## Preview

| Icon | File | Purpose |
| --- | --- | --- |
| ![Javafy](../assets/vscode-icons/javafy.svg) | `javafy.config.js` | Project configuration |
| ![Page](../assets/vscode-icons/jfy.svg) | `.jfy` | Page, route and layout |
| ![Component](../assets/vscode-icons/jfc.svg) | `.jfc` | Reusable UI component |
| ![Service](../assets/vscode-icons/jfs.svg) | `.jfs` | Server-side service |
| ![API](../assets/vscode-icons/jfa.svg) | `.jfa` | API endpoint |
| ![TypeScript](../assets/vscode-icons/typescript.svg) | `.ts` | TypeScript |
| ![TSX](../assets/vscode-icons/tsx.svg) | `.tsx` | React + TypeScript |
| ![JavaScript](../assets/vscode-icons/javascript.svg) | `.js` | JavaScript |
| ![JSON](../assets/vscode-icons/json.svg) | `.json` | JSON |
| ![CSS](../assets/vscode-icons/css.svg) | `.css` | Stylesheets |
| ![Markdown](../assets/vscode-icons/markdown.svg) | `.md` | Documentation |
| ![HTML](../assets/vscode-icons/html.svg) | `.html` | HTML |
| ![SVG](../assets/vscode-icons/svg.svg) | `.svg` | Vector graphics |
| ![YAML](../assets/vscode-icons/yaml.svg) | `.yml`, `.yaml` | Configuration |
| ![Folder](../assets/vscode-icons/folder.svg) | folders | Project folders |

## Run the extension locally

1. Open `assets/vscode-icons` in VS Code.
2. Press **F5** to open an Extension Development Host.
3. Run **Preferences: File Icon Theme**.
4. Select **Javafy File Icons**.

To package it, run `npx @vscode/vsce package` from `assets/vscode-icons`.

## Theme files

- Extension manifest: `assets/vscode-icons/package.json`
- Theme definition: `assets/vscode-icons/javafy-icon-theme.json`
- SVG assets: `assets/vscode-icons/*.svg`

This is a file icon theme, not a color theme. It changes Explorer icons, not editor syntax colors.
