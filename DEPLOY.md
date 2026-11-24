# Deploying JARVIS for testers (free)

Three free pieces: **Neon** (database) + **Render** (backend) + **Vercel** (frontend). About 30 minutes.
Do them in this order, because each step gives you an address the next one needs.

## 0. Before you start
- Put the project on **GitHub** (private repo is fine). `.gitignore` already keeps `.env`, `jarvis.db`, `venv` and `node_modules` out. Check that none of them show up in `git status` before pushing.
- Get a **Gemini API key** at aistudio.google.com (you already use one locally).

## 1. Database — Neon
1. Sign up at neon.tech → **Create project** → copy the **connection string** (starts with `postgresql://`).
2. Keep it for step 2. Tables are created automatically on the first start.

Why not SQLite? Free hosts wipe their disk on every restart, so testers' accounts would disappear.

## 2. Backend — Render
1. render.com → **New → Web Service** → connect the GitHub repo.
2. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Environment variable `PYTHON_VERSION`:** `3.11.9`
   (A `render.yaml` is included if you prefer **New → Blueprint**.)
3. Environment variables:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the Neon string from step 1 |
   | `SECRET_KEY` | a long random string (`python -c "import secrets;print(secrets.token_urlsafe(48))"`) |
   | `GEMINI_API_KEY` | your Gemini key |
   | `CORS_ORIGINS` | leave empty for now, fill in at step 4 |
4. Deploy. Open `https://<your-service>.onrender.com/health`. You should see `{"status":"ok"}`.

## 3. Frontend — Vercel
1. vercel.com → **Add New → Project** → import the same repo.
2. **Root Directory:** `frontend` (Vercel detects Vite). 
3. **Environment variable:** `VITE_API_URL` = your Render address, no trailing slash, e.g. `https://jarvis-api.onrender.com`
4. Deploy. You get an address like `https://jarvis-xyz.vercel.app`.

## 4. Connect them
Back in Render → Environment → set `CORS_ORIGINS` = your Vercel address (no trailing slash) → it redeploys.
Open the Vercel link, create an account, and run through the tour.

## 5. Things testers will notice
- **First load after ~15 min idle takes 30–60 s** (Render's free plan sleeps). Tell testers to wait once. Upgrading to the $7 plan removes it.
- **Free RAM is 512 MB.** The ML libraries are heavy. If Render shows "out of memory", move the backend to Railway (about $5/month) or upgrade the Render plan.
- Redeploys: every `git push` to the main branch redeploys both sites automatically.
- Any change to the frontend's `VITE_API_URL` needs a **redeploy** on Vercel (it is baked in at build time).

## 6. Collecting feedback
- Make a **Google Form** (what did you try, what confused you, what's missing, would you pay ₹99/month) and share the link with the site.
- Ask 5–10 people to use it for a **full week**: Insights and the CGPA forecast only show value after a few days of data.
- Watch **Render → Logs** for errors while they test.

## 7. Before sharing widely
- Your Gemini key is shared by every tester. Add the daily AI limit before you go beyond ~20 people.
- Tell testers their data is stored on your database and who can see it, and that this is a test build.
- Passwords are hashed (bcrypt). Never put the real `.env` on GitHub.
