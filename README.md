# Applied Electricity & Electronics Quiz

A static revision website made for the Applied Electricity & Electronics course.

**Made by Maya Pette ♡**  
Have fun revising and good luck for the exam! 🍀

## Step 1 features

- Chapter 1 question bank (40 questions)
- Full-chapter mode
- Random 20-question mode
- Mistake-review mode
- Local nickname
- Accuracy, chapter coverage and mastered-question tracking
- Active study-time tracking
- Best correct-answer streak
- Practice "Exam Readiness" estimate
- Local best-session leaderboard
- Local study-time leaderboard
- Responsive mobile-friendly design
- Data stored with browser `localStorage`

> The leaderboard is local to each browser/device for now. A shared online leaderboard can be added later with a backend such as Supabase.

## GitHub Pages

Upload these files to the repository root:

```text
index.html
style.css
app.js
chapter1.json
README.md
```

The JavaScript supports both `chapter1.json` in the repository root and `data/chapter1.json`.

In GitHub:
1. Go to **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: **main**
4. Folder: **/ (root)**
5. Save

## Readiness score

The practice readiness indicator is a heuristic based on:
- 45% overall quiz accuracy
- 25% chapter coverage
- 20% mastered-question coverage
- 10% practice consistency

It is a revision indicator, **not a prediction of the exam grade**.


## Step 2 — shared global leaderboard

This version is connected to Supabase.

When a quiz session is completed, the site submits:
- nickname
- chapter
- score
- total number of questions
- percentage
- active quiz time
- timestamp

Personal progress, mistakes, streaks and readiness still remain in the user's browser.

Only the Supabase publishable key is used in the browser. Never add a service-role or secret key to GitHub.


## Answer randomization

The visible answer positions are shuffled every time a question is displayed, while the original answer keys are preserved internally. This prevents memorizing A/B/C/D positions instead of the course content.
