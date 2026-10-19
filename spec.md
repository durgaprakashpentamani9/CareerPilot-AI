PROJECT SPECIFICATION FOR A CODING AGENT

Project Name
  CareerPilot AI - Agentic Internship CRM

Purpose of this document
  Hand this spec to a coding agent and it should be able to build CareerPilot AI
  from scratch with identical functionality: an agentic internship CRM where a
  pipeline of specialized AI agents automates the job hunt end to end.

================================================================================
IMPORTANT WORKSPACE INSTRUCTIONS
================================================================================
The workspace already contains two folders:
  client/
  server/

STRICT RULES
  1.  ALL frontend code MUST be created inside the client folder.
  2.  ALL backend code MUST be created inside the server folder.
  3.  Never create frontend files outside client.
  4.  Never create backend files outside server.
  5.  Maintain clean folder structure and separation of concerns.
  6.  Use JavaScript (ESM) everywhere - React JSX on the client, Node ESM on the
      server. (This project is intentionally NOT TypeScript.)
  7.  Generate production-quality, complete working code - no pseudo-code.
  8.  No placeholder implementations. Every feature here must be fully built.
  9.  Use environment variables for all secrets/keys (JWT secret, Mongo URI, etc.).
  10. Offline-first: every AI/LLM call (Ollama) MUST degrade gracefully to a
      deterministic fallback. The app must be fully usable with NO LLM and NO
      external network.
  11. Dual storage behind ONE repository interface: MongoDB when MONGODB_URI is
      set, otherwise an auto-seeded in-memory store. Same code path for both.
  12. Do NOT add a PDF-generation dependency. PDFs are produced by a custom,
      zero-dependency generator.
  13. The CURRENT resume is the single source of truth. Uploading a new resume
      REPLACES the profile and RESETS the per-user pipeline (see PROFILE & RESUME
      MODULE). Previous runs are archived to a Resume History log, never shown on
      the dashboard.
  14. Live internship discovery (free Remotive API) is BEST-EFFORT only: it uses
      the built-in global fetch (no new dependency), runs behind a short timeout,
      and MUST fall back to the curated catalog on any failure so it never blocks
      the flow.

================================================================================
PROJECT OVERVIEW
================================================================================
Build a full-stack, AI-powered internship CRM that automates:
  - Resume parsing & profile extraction (a new upload REPLACES the profile and
    resets the pipeline; the previous resume + its results are archived to a log)
  - Internship discovery (resume-relevant; curated catalog + best-effort live feed)
  - Match scoring
  - Skill-gap analysis
  - Per-job resume tailoring + PDF export
  - Application tracking (kanban)
  - Outcome notifications
  - Analytics / feedback
  - A real-time workflow-automation visualization that advances per current resume

...driven by eight specialized AI agents coordinated as a pipeline.

The eight agents (pipeline order):
  Profile -> Discovery -> Matching -> Skill-Gap -> Preparation -> Tracker
  -> Feedback -> Notification

The application resembles a lightweight combination of:
  - LinkedIn / Internshala (opportunity discovery)
  - An ATS / application tracker
  - A multi-agent AI workflow engine

================================================================================
TECH STACK
================================================================================
Frontend (client)
  - React 18
  - Vite 8 (ESM)
  - TailwindCSS 3
  - React Router 7 (createBrowserRouter)
  - TanStack React Query 5 (server state + cache invalidation)
  - Zustand 5 (auth/session, persisted to localStorage)
  - react-hook-form 7
  - axios
  - lucide-react (icons)
  Scripts: dev = "vite --host 0.0.0.0", build = "vite build",
           preview = "vite preview --host 0.0.0.0"

Backend (server)
  - Node.js (ESM, "type":"module")
  - Express 4
  - MongoDB + Mongoose 8
  - multer 2 (resume upload, memory storage)
  - pdf-parse 1 (extract text from uploaded PDF)
  - bcryptjs (password hashing)
  - jsonwebtoken (JWT auth)
  - axios (Ollama HTTP calls)
  - node-cron (scheduled jobs)
  - bullmq + ioredis (OPTIONAL queue; only if UPSTASH_REDIS_URL is set)
  - playwright (OPTIONAL scraper; present but not the default discovery path)
  - dotenv
  Scripts: dev = "nodemon src/server.js", start = "node src/server.js"
  NOTE: PDFs use a custom zero-dependency generator (see PDF GENERATION).
  NOTE: Live discovery uses Node's built-in global fetch + AbortController (Node
        18+); NO HTTP-client dependency is added for it.

================================================================================
CONFIGURATION / ENVIRONMENT  (server/src/config/env.js)
================================================================================
Load with dotenv. Defaults in parentheses:
  PORT (5000)
  CLIENT_URL (http://localhost:5173)
  CLIENT_URLS (comma-separated, trimmed, filtered; default empty)
  MONGODB_URI ("")               -> empty selects in-memory mode
  JWT_SECRET ("careerpilot-local-development-secret")
  JWT_EXPIRES_IN ("7d")
  OLLAMA_BASE_URL (http://localhost:11434)
  OLLAMA_CHAT_MODEL ("llama3.1:8b")
  OLLAMA_EMBED_MODEL ("nomic-embed-text")
  UPSTASH_REDIS_URL ("")         -> empty disables the queue
  SEED_SAMPLE_DATA (false; true only when the env string === "true")
  ENABLE_LIVE_DISCOVERY (true; only the string "false" disables the live feed)
  NODE_ENV ("development")

CORS (app.js): allow no-origin requests; allow configured origins; in development
also allow localhost/127.0.0.1/private-LAN origins via regex
  ^http://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|
           172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+):\d+$
credentials: true. express.json limit "1mb".
Health route: GET /api/health ->
  { status:"ok", service:"CareerPilot AI API",
    aiRuntime:"Ollama local inference", autoApplyEnabled:false }

================================================================================
APPLICATION MODULES
================================================================================
Implement the following modules. All routes are mounted under /api and require a
Bearer JWT except /api/auth/*. Each controller wraps async handlers and throws
httpError(status,message); errors return { message } via the error middleware.

--------------------------------------------------------------------------------
AUTHENTICATION MODULE
--------------------------------------------------------------------------------
Features:
  - Register, Login, Get current user
  - JWT bearer auth, protected routes
User fields:
  { name:string, email:string(unique,lowercase), password:string(bcrypt hash) }
Backend:
  POST /api/auth/register   {name,email,password} -> 201 {user,profile,token}
                            (creates user + empty profile; 409 if email exists)
  POST /api/auth/login      {email,password} -> {user,token} ; 401 invalid
  GET  /api/auth/me         -> {user:{_id,name,email}}
Frontend:
  Login Page, Register Page, Protected Routing (ProtectedRoute -> Outlet/Navigate)

--------------------------------------------------------------------------------
PROFILE & RESUME MODULE
--------------------------------------------------------------------------------
Profile fields:
  { userId, skills:string[], projects:string[], experience:string[],
    education:string[],
    preferences:{ roles:string[], location:string, workMode:string,
                  stipendRange:string },
    resumeText:string, embedding:number[] }
ResumeHistory fields (one snapshot per superseded resume):
  { userId, label:string ("Resume #N"), skills:string[], summary:string,
    topMatches:[{ title, company, score }], matchCount:number,
    highMatchCount:number, resumeVersionCount:number, supersededAt:Date }
Features:
  - Upload a PDF resume; parse it (Profile Agent) into skills/projects/experience/
    education/summary/embedding.
  - A new resume is the SINGLE SOURCE OF TRUTH and RESETS the pipeline so every
    downstream section reflects the new resume only (see upload behavior below).
  - Resume History: previous resumes + the results they produced are archived to a
    log (NOT shown on the dashboard).
  - Edit preferences (roles/location/work mode/stipend).
Backend:
  GET   /api/profile                       -> {profile}
  GET   /api/profile/history               -> { history } (createdAt desc)
  POST  /api/profile/upload-resume         (multipart field "resume", multer
        memoryStorage, 5MB, application/pdf only else 400)
        -> { profile, summary, pipelineReset:true }
        Upload behavior (in order):
          0. parseResume in a try/catch. GUARD: if parsing throws OR the extracted
             resumeText is < 30 chars, throw 422 and DO NOT touch the profile or
             pipeline (a failed/empty parse must never wipe the user's data).
          1. Archive the previous resume (if profile.resumeText existed) to
             resumeHistory: skills snapshot, summary excerpt, top 3 matches,
             match/high-match/resume-version counts, supersededAt.
          2. Upsert the profile REPLACING skills/projects/experience/education/
             resumeText/embedding with the newly parsed values (NOT merged);
             preferences preserved.
          3. Clear this user's matches and resumeVersions (deleteWhere) so the
             pipeline / Workflow Graph restart for the new resume.
          4. Best-effort re-sync discovery for the new profile
             (syncInternshipsForProfile); failures are swallowed (logged), never
             failing the upload.
  PATCH /api/profile/preferences {roles,location,workMode,stipendRange} -> {profile}
        (roles parsed via parseListInput)
Frontend:
  Profile page: ResumeUploadCard (upload + extracted skill chips + a "pipeline was
  reset" notice; on success invalidate profile, profile-history, internships,
  matches, resume-versions, applications, notifications, analytics), Preferences
  form, Projects/Experience/Education blocks, and a Resume History log section
  (previous resumes: label, replaced-date, skill chips, match counts, top matches).

--------------------------------------------------------------------------------
INTERNSHIP DISCOVERY MODULE
--------------------------------------------------------------------------------
Internship fields:
  { title:string, company:string, description:string, skillsRequired:string[],
    location:string, applyLink:string, source:string, deadline:Date,
    postedDate:Date, embedding:number[] }
Features:
  - List all internships, each enriched with the user's match (or null)
  - Sync = resume-driven discovery (see Discovery Agent). NOT a fixed list.
    Catalog ranking + best-effort live (Remotive) postings merged in.
  - Repair legacy applyLinks containing "example.com" from the seed map
Backend:
  GET  /api/internships        -> { internships:[ ...internship, match|null ] }
        (sorted postedDate desc; applyLink repair by title::company)
  POST /api/internships/sync   -> { count, internships }
        (profile = getOne(profiles,{userId}); saved =
         syncInternshipsForProfile(profile); shared with the resume-upload re-sync)
Frontend:
  Internship Explorer: search + source filter, match-score badges, sorted by
  score desc; each card -> Details + external-apply icon (records APPLIED, then
  opens applyLink).

--------------------------------------------------------------------------------
MATCHING MODULE
--------------------------------------------------------------------------------
Match fields:
  { userId, internshipId, score:number, matchedSkills:string[],
    missingSkills:string[], reason:string }  (unique {userId,internshipId})
Features:
  - Generate one match per internship for the user (Matching Agent)
Backend:
  POST /api/matches/generate -> { matches[] sorted score desc }
        (400 if no profile; 400 if profile has no resumeText; delegates to the
         shared regenerateMatches(userId, profile) in pipelineService)
  GET  /api/matches          -> { matches:[ ...match, internship ] } score desc
Frontend:
  Match score on Explorer/Details; Matched/Missing skill boxes + reason on Details.

--------------------------------------------------------------------------------
SKILL GAP MODULE
--------------------------------------------------------------------------------
Features:
  - Convert a match's missing skills into a prioritized study plan (Skill-Gap Agent)
Backend:
  GET /api/skill-gaps/:internshipId -> { skillGap } ; 404 if no match for the pair
Frontend:
  Skill Gaps panel on Internship Details (priority + suggested action + mini project)

--------------------------------------------------------------------------------
RESUME PREPARATION & PDF MODULE
--------------------------------------------------------------------------------
ResumeVersion fields:
  { userId, internshipId, content:string, changeSummary:string[],
    matchedSkills:string[], missingSkills:string[], approved:boolean }
Features:
  - Generate a job-tailored resume = the candidate's REAL resume with ONLY the
    Skills section retailored to the job (Preparation Agent). No fabrication.
  - View/Download the tailored resume as a real PDF.
  - Approve a version. "Apply with updated resume" (records APPLIED + opens link).
  - Generating a version marks the related application PREPARING (no downgrade).
Backend:
  GET  /api/application-materials            -> { resumeVersions } (createdAt desc)
  POST /api/application-materials/generate {internshipId} -> 201 {resumeVersion}
        (400 if no profile.resumeText; 404 if internship missing;
         markApplicationPreparing(): create app PREPARING or raise to PREPARING)
  POST /api/application-materials/approve {resumeVersionId} -> {resumeVersion}
        (owner check; sets approved:true)
  GET  /api/application-materials/:id/pdf    -> application/pdf (owner check, 401
        without token). Renders version.content AS-IS via textToPdf (NO injected
        header; the resume text already carries name/contact). Content-Disposition
        inline; filename="careerpilot-<slug>.pdf".
Frontend:
  Internship Details "Resume Version" panel: changeSummary + tailored content
  (pre), View/Download PDF (blob fetch via axios then objectURL), Approve, and an
  "Apply with updated resume" CTA. Reload a prior version for the internship from
  the ["resume-versions"] cache (match by internshipId).

--------------------------------------------------------------------------------
APPLICATION TRACKER MODULE
--------------------------------------------------------------------------------
Application fields:
  { userId, internshipId, status(enum), appliedAt:Date, nextActionDate:Date,
    notes:string }  (unique {userId,internshipId})
  APPLICATION_STATUSES = [SAVED, PREPARING, APPLIED, INTERVIEW, OFFER, REJECTED]
  STATUS_RANK = { SAVED:0, PREPARING:1, APPLIED:2, INTERVIEW:3, OFFER:4, REJECTED:4 }
Features:
  - Save/track applications across a 6-column kanban
  - Edit status / next-action date / notes ; Delete an application
  - Duplicate create is a status PROGRESSION (never 409); only raises status upward
Backend:
  POST   /api/applications {internshipId,status="SAVED",nextActionDate,notes}
         -> new app (+"Application saved" notification); OR if duplicate, progress
            status upward only (set appliedAt on first APPLIED); milestone status
            changes raise a notification. 404 if internship missing.
  GET    /api/applications -> { applications:[ ...application, internship ] }
  PATCH  /api/applications/:id {status?,nextActionDate?,notes?} (owner check)
         -> updates; milestone status change raises a notification
  DELETE /api/applications/:id (owner check, 404 else) -> { success:true, id }
Frontend:
  Application Tracker: kanban by status; per-card status <select>, date, notes+Save,
  and a trash (delete) button with confirm; controls disable while pending; notes
  resync from server. Invalidate applications/analytics/notifications on every edit.

--------------------------------------------------------------------------------
NOTIFICATION MODULE
--------------------------------------------------------------------------------
Notification fields: { userId, title:string, message:string, read:boolean }
Milestone notifications (raised ONLY when status actually changes to one of these;
SAVED/PREPARING do NOT notify; re-saving the same status never duplicates):
  APPLIED   -> "Application submitted" / "<label> was marked as applied."
  INTERVIEW -> "Interview stage" / "<label> moved to Interview. Prepare Wer
               talking points."
  OFFER     -> "Offer received" / "Congratulations! <label> resulted in an offer."
  REJECTED  -> "Application closed" / "<label> was marked rejected. Capture the
               learnings and keep going."
  (label = "<internship.title> at <internship.company>")
Backend:
  GET   /api/notifications        -> { notifications } (createdAt desc)
  PATCH /api/notifications/:id/read (owner check) -> { notification } read:true
Frontend:
  AppShell bell button + dropdown panel (title/message/date/read state); unread
  badge = count of !read; click unread -> mark read -> invalidate ["notifications"];
  close on outside pointerdown or Escape.

--------------------------------------------------------------------------------
ANALYTICS MODULE
--------------------------------------------------------------------------------
Features:
  - Outcome metrics + recommendation (Feedback Agent)
Backend:
  GET /api/analytics -> { analytics:{ totalApplications, interviewRate, offerRate,
        matchScoreEffectiveness, topPerformingSkills:[{skill,count}],
        recommendationNote } }
Frontend:
  Analytics page: metric cards + Top-Performing Skills list + Recommendation note.

================================================================================
AI AGENT SYSTEM
================================================================================
The eight "agents" are the pipeline stages (server/src/agents/). Each is a pure
module with deterministic fallbacks. Their collective live state is visualized by
the Workflow Automation Graph (see ORCHESTRATION).

Intent / characteristics: every agent has a clear single responsibility, consumes
profile/internship/match data, and returns plain JSON the controllers persist.

Profile Agent  (profileAgent.parseResume(buffer))
  Responsibilities: parse uploaded PDF; extract skills/projects/experience/
    education/summary/embedding.
  Behavior:
    - pdf-parse -> resumeText
    - generateLocalText(structured-profile prompt) for summary (fallback
      summarizeText)
    - skills = extractSkills(resumeText) (keyword scan vs knownSkills)
    - projects/experience/education = sectionLines() (lines >4 chars containing a
      label; max 8). Labels: projects[project,built,developed];
      experience[experience,intern,worked];
      education[education,university,college,school,degree]
    - embedding = generateEmbedding(resumeText) (may be [])

Discovery Agent  (discoverInternships(profile))  [RESUME-DRIVEN + LIVE + FALLBACK]
  Responsibilities: return internships relevant to the resume, not a fixed list.
  Behavior:
    - hasSignal = profile.skills.length>0 OR preferences.roles.length>0
    - If signal:
        * fetchLiveInternships(profile) [BEST-EFFORT]: global fetch the free
          Remotive API (https://remotive.com/api/remote-jobs?search=<term>&limit=40,
          term = first preferred role | first skill | "developer") behind a 5s
          AbortController timeout. Keep only early-career titles
          (/intern|graduate|trainee|junior|entry-level|apprentice/i), strip HTML
          from the description, skillsRequired = extractSkills(title+desc),
          source "Remotive (live)". ANY error/timeout/empty -> [] (never throws).
          Gated by ENABLE_LIVE_DISCOVERY (only "false" disables).
        * pool = dedupe([...internshipCatalog, ...live]) by title::company;
          rank by relevanceScore desc, keep score>0, take top 10:
            relevanceScore = (#skill overlap)*2 + (any preferred-role keyword in
              `${title} ${description}` ? 1:0)*2 + (location substring of
              i.location ? 1:0)
    - Else / nothing matched: fall back to seedInternships (the 5)
    - normalizeInternship() defaults + embedding via generateEmbedding(title\n desc)
    - scrapeCompanyPage(url) (Playwright) exists but is NOT the default path.

Matching Agent  (scoreInternship(profile, internship))
  Responsibilities: score fit; output matched/missing skills + a reason.
  Behavior:
    matchedSkills = required ∩ profile ; missingSkills = required − profile
    skillScore = required.length ? round(matched/required*80) : 45
    roleBoost = pref role in `${title} ${description}` ? 10 : 0
    locationBoost = pref location substring of internship.location ? 10 : 0
    score = min(100, skillScore + roleBoost + locationBoost)
    reason = generateLocalText(...) or deterministic fallback string
  Output example: { score:77, matchedSkills:[...], missingSkills:["express"],
                    reason:"Matched 5 of 6 listed skills. Focus on express ..." }

Skill-Gap Agent  (buildSkillGapReport(match))
  Responsibilities: turn missing skills into a prioritized plan.
  Output: { internshipId, missingSkills, priorities:[{ skill,
    priority:(i<2?"High":"Medium"), suggestedAction, miniProject }] }

Preparation Agent  (generateResumeVariant(profile, internship))
  Responsibilities: produce the REAL resume with ONLY the Skills section
    retailored to the job; never fabricate.
  Behavior:
    - Find skills heading via regex (technical skills|core skills|key skills|
      skill set|technologies|technical proficiencies|skills); inline-after-colon
      vs heading-then-following-lines (until blank line or a known OTHER heading).
    - Tokenize skills (split on [,|/;•], preserve casing).
    - Reorder: required-matching tokens first (in requiredSkills order), then real
      matched skills missing from the list (added, pretty-cased), then the rest in
      original order. No removals.
    - Replace ONLY that section; rebuild full text. If no skills section, insert a
      tailored "Skills" block near the top; rest unchanged.
  Output: { content, changeSummary[honest lines incl. missing-skills-to-strengthen
    + "Human approval required..."], matchedSkills, missingSkills, approved:false }

Tracker Agent  (applicationController logic)
  Responsibilities: persist applications; enforce status progression; enrich with
    internship; support delete.

Feedback Agent  (buildAnalytics({applications,matches,internships,profile}))
  Responsibilities: compute analytics.
  Behavior: totalApplications; interviewRate = (INTERVIEW+OFFER)/total*100;
    offerRate = OFFER/total*100; matchScoreEffectiveness = avg score of matches
    for applied internships; topPerformingSkills = top 6 profile-skills required
    across internships; recommendationNote based on avg>=70.

Notification Agent  (notification creation paths)
  Responsibilities: raise in-app notifications on save + status milestones +
    background reminders.

================================================================================
AGENT ORCHESTRATION ENGINE
================================================================================
Pipeline (per user, driven by their real data/actions):
  Resume upload  (REPLACES profile; archives previous resume to history; CLEARS
                  matches + resumeVersions; re-syncs discovery -> pipeline restarts)
   -> Profile Agent
   -> Discovery Agent
   -> Matching Agent
   -> Skill-Gap Agent
   -> Preparation Agent
   -> Tracker Agent
   -> Feedback Agent
   -> Notification Agent
   -> Workflow Graph / Dashboard update

Requirements:
  - Status tracking per stage; cache-driven sync across all pages.
  - Each new resume resets the resume-derived stages (Matching, Skill-Gap,
    Preparation) to Waiting, so the graph advances stage-by-stage again instead of
    showing stale "done" state from a prior resume.
  - Optional queue (BullMQ + Redis) when UPSTASH_REDIS_URL is set.
  - Scheduled jobs (node-cron) for sync, match recalculation, reminders.
  - Shared pipeline logic lives in services/pipelineService.js
    (syncInternshipsForProfile, regenerateMatches) and is reused by the Sync,
    Match, and resume-upload paths so all three behave identically.

WORKFLOW AUTOMATION GRAPH  (components/WorkflowGraph.jsx) - CRITICAL
  Props: { profile, internships, applications, notifications, resumeVersions }.
  Render 8 nodes (icon, label, Active/Waiting) + header badge
  "<activeCount>/8 stages active". Each node's active flag is a DISTINCT real
  signal so the graph advances stage-by-stage (must NOT all light up at once) and
  stays in sync with every page via shared React Query caches:
    Profile Agent       = Boolean(profile.resumeText)
    Discovery Agent     = hasResume AND internships.length > 0
    Matching Agent      = some internship has .match
    Skill-Gap Agent     = some match has missing or matched skills
    Preparation Agent   = resumeVersions.length > 0
    Tracker Agent       = applications.length > 0
    Feedback Agent      = some application status in [APPLIED,INTERVIEW,OFFER,REJECTED]
    Notification Agent  = notifications.length > 0
  Dashboard must fetch resumeVersions (["resume-versions"]) and pass them in.
  Because a new resume CLEARS matches + resumeVersions server-side, the Matching/
  Skill-Gap/Preparation nodes automatically drop back to Waiting on each upload and
  re-activate as the user re-runs Match / generates a version for the new resume.

================================================================================
PDF GENERATION  (server/src/utils/pdf.js)  - ZERO DEPENDENCIES
================================================================================
textToPdf(text, options) -> Buffer. Generate professional PDFs for the tailored
resume version. Requirements:
  - Valid multi-page PDF (A4 595.28x841.89, Helvetica Type1).
  - Word-wrap (~95 chars/line), paginate (~48 lines/page).
  - Escape "(" ")" "\"; strip non-Latin-1 (-> "?") and control chars.
  - Objects: 1 Catalog -> 2 Pages; 3 Font; then per page a content-stream object
    and a Page object (Font 3, Parent 2). Content uses BT /F1 <size> Tf, Td to top
    margin, TL leading, "(line) Tj" + "T*", ET.
  - Correct xref (20-byte entries) computed from latin1 byte offsets; trailer
    { /Size, /Root 1 0 R }; startxref; %%EOF.
  - Must round-trip through pdf-parse (extractable text).
The /pdf route streams this with Content-Type application/pdf; the client fetches
it as a blob (header auth) and opens an object URL.

================================================================================
STORAGE & PERSISTENCE LAYER
================================================================================
config/db.js: dbState={mode:"memory",connected:false}; connectDatabase(): no
  MONGODB_URI -> stay memory; else mongoose.connect (mode "mongo") with memory
  fallback on failure.
services/repository.js: ONE async interface switching on dbState.mode. Collections
  (logical keys -> models): users, profiles, internships, matches, resumeVersions,
  resumeHistory, applications, notifications. Functions: getAll(coll,filter,sort),
  getById, getOne, create, updateById, upsert(filter,createData,updateData),
  deleteById, deleteWhere.
  (mongo: Model methods .lean(); upsert uses $set=updateData + $setOnInsert.)
services/pipelineService.js: shared pipeline steps reused by Sync, Match and
  resume-upload: syncInternshipsForProfile(profile) (discoverInternships -> upsert
  by {title,company}); regenerateMatches(userId,profile) (scoreInternship per
  internship -> upsert by {userId,internshipId}, returned sorted by score desc).
services/memoryStore.js: in-memory arrays (incl. resumeHistory); withId() adds
  _id=randomUUID + createdAt/updatedAt; clone() on reads; insert/update/upsert/
  removeMany; internships pre-seeded from seedInternships; seedDemoUser()
  (demo@careerpilot.ai / "Password@123" + sample profile).
services/seedService.js seedInitialData(): mongo -> upsert seedInternships only if
  SEED_SAMPLE_DATA; memory -> seedDemoUser() + upsert seedInternships.
services/ollamaService.js: generateLocalText(prompt) POST /api/generate ->
  data.response.trim() or "" on error; generateEmbedding(text) POST /api/embeddings
  -> data.embedding || []. axios timeout 8000.
utils/text.js: knownSkills[25], normalizeSkill, uniqueStrings, extractSkills,
  summarizeText(text,max=220), parseListInput.

================================================================================
BACKGROUND JOBS / SCHEDULER  (server/src/jobs/backgroundJobs.js)
================================================================================
startQueues(): if UPSTASH_REDIS_URL -> ioredis + BullMQ Queue
  "careerpilot-background"; else null.
Cron (startCronJobs):
  "0 */6 * * *" syncInternshipsJob       (discoverInternships() -> upsert by
                                          {title,company})
  "0 2 * * *"   recalculateMatchesJob    (score every internship per user/profile)
  "0 * * * *"   notifyUsersJob           (dedup-by-message: deadline<=3d ->
                "Deadline approaching"; match.score>=80 -> "High-match opportunity";
                APPLIED >7d -> "Follow-up reminder")
server.js startServer(): connectDatabase(); seedInitialData(); startQueues();
  startCronJobs(); app.listen(PORT).

================================================================================
SEED & DEMO DATA
================================================================================
data/seedInternships.js: canonical 5 (kept for link-repair + fallback) -
  Frontend Engineering Intern@NovaLearn; Backend Developer Intern@SkillBridge Labs;
  AI Product Intern@CareerCraft AI; Full Stack MERN Intern@ApplyFlow; UX Research
  Intern@MapleWorks. (skillsRequired from knownSkills; reachable Internshala/
  LinkedIn applyLinks - NEVER example.com; deadline=now+Nd; postedDate=now.)
data/internshipCatalog.js: export [...seedInternships, ...10 more] across React/
  Node/Python-data/ML/DevOps/full-stack/QA/UI/cloud/Tailwind roles. Discovery ranks
  this catalog.
scripts/seedDemoData.js: connect MONGODB_URI; upsert demo user demo@careerpilot.ai
  / "Demo@12345"; upsert a profile with a realistic resumeText + skills
  [javascript,react,node.js,mongodb,git,html,communication,problem solving] +
  preferences (roles[frontend,mern,ai product], Remote); ensure internships exist;
  CLEAR that user's matches/applications/resumeVersions/notifications. Idempotent.

================================================================================
FRONTEND PAGES
================================================================================
Create:
  Login
  Register
  Dashboard            (metric cards, Workflow Graph, ranked opportunities,
                        profile snapshot, tracker preview)
  Profile              (resume upload, extracted skills, preferences, Resume
                        History log)
  Internship Explorer  (search/filter, match scores, external apply)
  Internship Details   (match, skill gaps, resume version, PDF, apply)
  Application Tracker  (kanban + delete)
  Analytics            (metrics + top skills + recommendation)

Routing (router.jsx, createBrowserRouter):
  /login, /register (public) ; ProtectedRoute -> AppShell with children:
  index=Dashboard, profile, internships, internships/:id, tracker, analytics ;
  "*" -> redirect "/".

Frontend infrastructure:
  api/client.js  axios (baseURL VITE_API_URL || http://localhost:5000/api); request
    interceptor adds Bearer token from authStore; 401 -> logout.
  store/authStore.js  zustand+persist (name "careerpilot-session", localStorage):
    { token, user, setSession, logout }.
  api/queries.js  authApi, profileApi (get/history/uploadResume/updatePreferences),
    internshipApi, matchApi, skillGapApi, materialApi (list/generate/approve/
    downloadPdf(blob)/openPdf), applicationApi (create/list/update/remove),
    notificationApi, analyticsApi.
  Shared React Query keys (invalidate to keep ALL sections in sync):
    ["profile"], ["profile-history"], ["internships"], ["matches"],
    ["applications"], ["notifications"], ["analytics"], ["resume-versions"],
    ["skill-gap", id].

================================================================================
UI REQUIREMENTS
================================================================================
Use:
  - Modern, clean SaaS design
  - Responsive laWet (sidebar nav on lg; mobile bottom nav)
  - Top header with user name + notification bell + logout
  - Loading states, error states, empty states
  - Inline success feedback (save/apply/generate)
Design tokens (tailwind.config.js theme.extend.colors):
  ink #18212f, paper #f7f8f3, moss #1f7a5c, coral #d55c45, gold #c28a21
  boxShadow.soft = "0 14px 40px rgba(24,33,47,0.08)" (class shadow-soft)
  Heavy headings (font-black); rounded-md/lg white cards with border-ink/10 on a
  paper background; lucide-react icons; .scrollbar-thin + line-clamp utilities.
StatusPill tones: SAVED ink/10, PREPARING gold/15, APPLIED moss/10,
  INTERVIEW blue-100/blue-700, OFFER emerald-100/emerald-700, REJECTED coral/10.
utils/format.js: formatDate (Intl "MMM d, yyyy" or "Not set"); cx(...classes).

================================================================================
DATABASE MODELS  (mongoose, all timestamps:true)
================================================================================
Create models for:
  User          name(req,trim), email(req,unique,lowercase,trim), password(req)
  Profile       userId(ref,unique,req), skills[], projects[], experience[],
                education[], preferences{roles[],location,workMode,stipendRange},
                resumeText, embedding[Number]
  Internship    title(req), company(req), description, skillsRequired[], location,
                applyLink(req), source, deadline(Date), postedDate(Date),
                embedding[Number]   unique{company,title,applyLink}
  Match         userId(req), internshipId(req), score(Number,0), matchedSkills[],
                missingSkills[], reason   unique{userId,internshipId}
  ResumeVersion userId(req), internshipId(req), content, changeSummary[],
                matchedSkills[], missingSkills[], approved(Boolean,false)
  ResumeHistory userId(req), label, skills[], summary, topMatches[{title,company,
                score}], matchCount(Number,0), highMatchCount(Number,0),
                resumeVersionCount(Number,0), supersededAt(Date)
  Application   userId(req), internshipId(req), status(enum,default SAVED),
                appliedAt(Date), nextActionDate(Date), notes
                APPLICATION_STATUSES exported   unique{userId,internshipId}
  Notification  userId(req), title(req), message(req), read(Boolean,false)

================================================================================
PROJECT STRUCTURE
================================================================================
CLIENT:
client/
 |-- index.html  tailwind.config.js  postcss.config.js  vite.config.js
 +-- src/
      |-- main.jsx  router.jsx  index.css
      |-- api/          (client.js, queries.js)
      |-- store/        (authStore.js)
      |-- components/   (AppShell, WorkflowGraph, Button, Field, ErrorBanner,
      |                  LoadingState, MetricCard, StatusPill, ProtectedRoute,
      |                  ResumeUploadCard)
      |-- pages/        (Login, Register, Dashboard, Profile, InternshipExplorer,
      |                  InternshipDetails, ApplicationTracker, Analytics)
      +-- utils/        (format.js)

SERVER:
server/
 |-- scripts/          (seedDemoData.js)
 +-- src/
      |-- server.js  app.js
      |-- config/       (env.js, db.js)
      |-- models/       (User, Profile, Internship, Match, ResumeVersion,
      |                  ResumeHistory, Application, Notification)
      |-- services/     (repository.js, memoryStore.js, seedService.js,
      |                  ollamaService.js, pipelineService.js)
      |-- agents/       (profileAgent, discoveryAgent, matchingAgent, skillGapAgent,
      |                  applicationPreparationAgent, feedbackAgent)
      |-- controllers/  (auth, profile, internship, match, skillGap,
      |                  applicationMaterial, application, notification, analytics)
      |-- routes/       (one router per resource; all require auth except auth)
      |-- middleware/   (auth.js, errorHandler.js)
      |-- jobs/         (backgroundJobs.js)
      |-- data/         (seedInternships.js, internshipCatalog.js)
      +-- utils/        (asyncHandler, httpError, jwt, text, pdf)

================================================================================
DEVELOPMENT APPROACH
================================================================================
Implement in phases.
  Phase 1: Storage layer + models (incl. ResumeHistory) + Auth + Profile/Resume
           upload (Profile Agent) with replace-on-upload + pipeline reset + history
  Phase 2: Internship Discovery (resume-driven catalog + best-effort live feed +
           fallback) + Matching + Skill-Gap (shared pipelineService)
  Phase 3: Resume Preparation (tailored) + zero-dependency PDF + materials routes
  Phase 4: Applications/Tracker (+ delete, progression) + Notifications (milestones)
  Phase 5: Analytics + Dashboard + Workflow Automation Graph + Background jobs
  Phase 6: Demo seed + verify against ACCEPTANCE CRITERIA

================================================================================
FINAL REQUIREMENT
================================================================================
The final application must be:
  - Fully functional   - Offline-capable (LLM optional)   - Modular
  - Cleanly documented - Responsive                       - In sync across pages

Generate all code, folders, APIs, schemas, services, agents, UI pages, components,
state management, the discovery/matching/tailoring logic, the zero-dependency PDF
generator, and the workflow-graph visualization needed to satisfy this spec.

ACCEPTANCE CRITERIA (the build is correct when ALL hold):
  A. Auth issues a JWT; protected routes 401 without it.
  B. PDF resume upload -> profile.skills populated (REPLACED, not merged); Profile
     shows them. A second, different resume fully replaces the first resume's
     skills (no accumulation across uploads).
  B2. Upload reset: a new resume CLEARS the user's matches + resumeVersions and
     re-syncs discovery; GET /profile shows only the new resume's data; the
     Workflow Graph's Matching/Skill-Gap/Preparation nodes drop to Waiting.
  B3. Resume History: the previous resume (skills + top matches + counts) is
     archived to GET /profile/history (NOT shown on the dashboard); the first-ever
     upload archives nothing.
  B4. Bad/empty PDF guard: an unreadable or <30-char parse returns 422 and leaves
     the existing profile, matches and resumeVersions untouched.
  C. Sync is resume-driven: demo profile returns relevant roles and EXCLUDES
     zero-overlap roles (e.g. Machine Learning, Cloud Engineering); broader than
     the fixed 5; no-profile/cron path falls back to the seed 5. Live (Remotive)
     postings augment results when reachable but NEVER block: any failure/timeout
     silently falls back to the curated catalog.
  D. Matches: one per internship; score 0..100; matched/missing correct.
  E. Skill gaps: prioritized missing skills; 404 before matches exist.
  F. Tailoring: REAL resume with ONLY the Skills line reordered (verify exactly the
     skills line changes); nothing fabricated; related app -> PREPARING.
  G. PDF: /pdf returns valid application/pdf (pdf-parse readable); 401 without token;
     client opens via blob.
  H. Apply (external / with updated resume): records APPLIED, opens applyLink,
     refreshes caches.
  I. Tracker: kanban; edits persist; DELETE removes (owner-checked; repeat 404);
     duplicate create never 409 and only progresses status upward.
  J. Notifications: "Application saved" on first save; status changes to
     APPLIED/INTERVIEW/OFFER/REJECTED raise the milestone notification (no dup on
     same-status re-save); bell badge + dropdown update; mark-read owner-checked.
  K. Workflow graph: nodes activate independently per the signal map; badge shows
     active/total; stays in sync via shared cache invalidation.
  L. Analytics: totals, interview/offer rates, match effectiveness, top skills,
     recommendation note all compute.
  M. Offline: with Ollama down and MONGODB_URI unset, the whole flow works
     (in-memory + deterministic fallbacks); demo user demo@careerpilot.ai /
     Password@123 auto-seeded in memory mode.

BUILD / RUN:
  Backend:  cd server && npm install && npm run dev   # http://localhost:5000/api
  Frontend: cd client && npm install && npm run dev    # http://localhost:5173
  Memory mode (zero setup): leave MONGODB_URI unset -> demo@careerpilot.ai /
    Password@123 auto-seeded.
  Mongo mode: set MONGODB_URI; run `node scripts/seedDemoData.js` for a clean demo
    account (demo@careerpilot.ai / Demo@12345).
================================================================================
END OF SPECIFICATION
================================================================================ 