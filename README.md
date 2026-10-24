# Panel Ink

A small manga page editor. For local use, it requires Python 3.10+ and a modern browser, with no extra packages or services.

## Run in GitHub Codespaces

The repository includes a dev container for running the editor without leaving a personal computer on. On GitHub, choose **Code → Codespaces → Create codespace on main**. In the Codespace terminal run `python app.py --no-browser`, then open port **8765** from the **Ports** tab. Keep the forwarded port private to your Codespace account.

The editor saves pages and artwork in the Codespace's `projects/` and `images/` folders. Those folders are intentionally ignored by Git and are not part of this editor repository. Download or back up your work before deleting the Codespace. Stopping a Codespace also stops the editor; restart the command when you resume it.

Panel Ink is a page editor, not an AI image generator. Running it in Codespaces provides a cloud workspace for assembling stories, but generating new illustrations still requires a separate image-generation tool or service. A GitHub repository alone does not run the app continuously.

## Start

Double-click **Start Panel Ink.cmd**, or run `python app.py` in this folder. The app opens at http://127.0.0.1:8765. Keep the server window running; close it or press Ctrl+C to stop. If the port is in use, run `python app.py --port 8766`.

## Make a page

1. Add artwork with **Add images**, or put generated images in `images/` and click the refresh arrow.
2. Select one of the six panels, then click an image in the library. Images can also be dragged from the library onto a panel. Each panel uses a 720 × 720 coordinate space; choose Fill or Fit for other image shapes.
3. Pick Speech, Thought, Shout, or Caption and click **Add bubble**. Edit dialogue on the right. Drag a bubble to move it, and adjust its width, height, text size, and tail with the controls. **Tail length** extends the tail from 0 to 300 panel pixels without changing the bubble body or text. Double-click a bubble to edit its text. Text shrinks to fit if necessary.
4. Give the page a name, then **Save page** (Ctrl+S). **Open page** reopens a saved page with its artwork and editable bubbles.
5. **Export PNG** downloads a 1504 × 2240 page: six 720 × 720 panels, 16-pixel gutters, and 24-pixel margins.

Page files are in `projects/`. Artwork is in `images/`. Back up both folders together. A browser draft helps recover refreshes, but **Save page** is what writes an editable project file to disk. Each saved page is a separate project in this first version. Animated GIFs export as a still frame.

## Assistant workflow / local API

An assistant can save generated artwork directly into `images/`, then create or edit page JSON in `projects/`. Refresh the library or reopen the page in the editor to see external changes. Save browser edits before asking an assistant to edit the same page.

- `GET /api/images` → `[{"name":"hero.png","url":"/images/hero.png"}]`
- `POST /api/images?name=hero.png` with raw image bytes → uploaded asset. Uploads get unique filenames.
- `GET /api/projects` → saved page IDs and names.
- `GET /api/projects/{id}` → editable page JSON.
- `POST /api/projects` with JSON → atomically saves a page.

Project format (exactly six panel objects):

```json
{
  "version": 1,
  "id": "chapter-one",
  "name": "Chapter one",
  "panels": [
    {
      "image": "/images/hero.png",
      "fit": "cover",
      "bubbles": [
        {"id":"dialogue-1","style":"speech","text":"We made it!","x":60,"y":60,"w":300,"h":180,"fontSize":30,"tail":"left"}
      ]
    },
    {"image":null,"fit":"cover","bubbles":[]},
    {"image":null,"fit":"cover","bubbles":[]},
    {"image":null,"fit":"cover","bubbles":[]},
    {"image":null,"fit":"cover","bubbles":[]},
    {"image":null,"fit":"cover","bubbles":[]}
  ]
}
```

Coordinates are panel-local pixels (0–720). Bubble `h` reserves 30 pixels below the body for the original tail. Optional `tailLength` (0–300, default 30) changes the tail independently; total rendered height for a bubble with a tail is `h - 30 + tailLength`. Styles: `speech`, `thought`, `shout`, `caption`. Tails: `left`, `right`, `none`. Fit: `cover` or `contain`. Use unique bubble IDs. Keep each bubble inside its panel; tails extending outside a panel are clipped. The server listens on loopback only.

## Checks

Run `python -m unittest -v` for persistence, upload, and invalid-save checks. Run `node --test test_editor.cjs` for upload/export timing regressions, and `node --check dist/app.js` for JavaScript syntax validation.
