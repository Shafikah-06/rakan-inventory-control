# AGENTS.md

> Project notes for the coding agent working in this folder.

## How to talk to me

- **Avoid technical jargon.** Use plain, everyday words. If a technical word is unavoidable, explain it in one simple sentence the first time.
- Reply in the language I write in, and match the level of detail I ask for.
- Start with what it means for me. Add details only when they help.
- Explain new ideas/concepts by comparing them to things I already know.
- Make technical decisions yourself, then tell me briefly what you decided and why.
- Tell me what I can do now, not what you changed behind the scenes.
- After each step, let me know how to verify the work done and what I should see.

## What this project is

Read this section first every time we start work.

<!-- This section is still empty. -->

**The first time we talk about this project, don't write code yet.** Ask me the 4 questions below in order, **one at a time**, and wait for my answer before asking the next. Skip any question my first message already answers.

1. Who is this for? (e.g. "the 5 people on my customer service team")
2. What is the most annoying, time-wasting task right now? (e.g. "we keep forgetting to follow up with customers")
3. Once it's built, what does success look like? (e.g. "every morning I can see at a glance who to follow up with today")
4. Do they usually use it on a phone or a computer?

When you're done asking, fill my answers into the blanks below, **delete the comment line, the "first time" paragraph, the 4 questions and this paragraph**, then show it to me for a quick check.

- **Who uses it**: <to fill in>
- **What it solves**: <to fill in>
- **What success looks like**: <to fill in>
- **Phone or computer**: <to fill in>

## Tech stack

- **Next.js 16 (App Router)** + **TypeScript**
- Styling with **Tailwind**, preferring the ready-made **shadcn/ui** components already in this project
- **Mobile-first**: design the phone layout first, then adapt it for computers, since many people will use it on their phones
- Charts with **recharts**
- Next.js 16 is quite new, and some patterns differ from older tutorials online. When unsure, follow the patterns already in this project.
- Supabase: use the **Supabase CLI** only (already logged in): `supabase link`, SQL via migrations and `supabase db push`. Never use the Supabase plugin or connector, and never send me to the Supabase dashboard.
- Vercel: deploy with the **Vercel CLI** only (already logged in), for example `vercel deploy --prod`. Never use a Vercel plugin, connect GitHub, or send me to the Vercel dashboard.

## Ground rules

- Change one small piece at a time, and let me check it before you continue.
- Only touch the files the current step needs. Don't tidy up anything else along the way.
- If you're not sure what I want, ask me instead of guessing.
- Build in this folder, whatever it is named. Never write absolute paths (such as `/Users/...` or `C:\Users\...`) into code or settings.
- Secret keys: if I paste one, put it into `.env.local` yourself (and into the hosting service's environment settings when we publish). Never put keys in code or on GitHub, and never print a full key back to me.
- Only use libraries, fonts, images and icons that are free to use, even for business (for fonts, use Google Fonts). If something needs a paid or commercial licence and there is truly no free option, stop and ask me before you use it.
