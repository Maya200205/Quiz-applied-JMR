# PCB Quiz

Static browser quiz for **Chapter 1 — Introduction to PCB Technology**.

## Features

- 40 Chapter 1 questions
- Single-answer, multiple-answer and true/false questions
- Immediate correction and explanation
- Random 20-question mode
- Full-chapter mode
- Mistake-review mode
- Progress stored locally in the browser with `localStorage`
- No backend or database required

## Run locally

Because the quiz loads its JSON question bank with `fetch()`, open it through a small local web server rather than double-clicking `index.html`.

With Python:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Put it on GitHub

1. Create a new GitHub repository.
2. Upload all files from this folder to the repository root.
3. Commit and push.
4. Open **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select your main branch and the `/ (root)` folder.
7. Save. GitHub Pages will provide the public quiz URL.

## Add future chapters

Create another JSON file in `data/` using the same structure as `chapter1.json`.

Each question uses:

```json
{
  "id": "q1",
  "type": "single",
  "question": "Question text",
  "options": ["A", "B", "C", "D"],
  "answer": [0],
  "explanation": "Why the answer is correct."
}
```

Types:
- `single`: one correct option
- `multi`: several correct options
- `tf`: true / false

The current interface is wired to Chapter 1 only. It can be extended later with a chapter-selection screen.

## Source

The question bank was created from the uploaded course file:

`01 - An introduction to PCB technology.pdf`

It intentionally stays within that chapter's material.
