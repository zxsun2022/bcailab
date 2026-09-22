/**
 * English interface copy — the source of truth for message keys.
 *
 * `zh.ts` is typed against this object, so adding a key here without translating it is a
 * type error rather than a silent English fallback (design §3.3). Keys are flat and grouped
 * by surface. Placeholders use `{name}`; a test asserts both catalogues use the same ones.
 *
 * Learning material — passage titles, topics, sentences, prompts — is never in here. It is
 * the thing being learned and stays English in both interfaces.
 */
export const en = {
  // --- shared ---
  "common.signIn": "Sign in",
  "common.signInFree": "Sign in — it's free",
  "common.signedIn": "Signed in",
  "common.profile": "Profile",
  "common.settings": "Settings",
  "common.theme": "Theme",
  "common.logOut": "Log out",
  "common.home": "Home",
  "common.account": "Account",
  "common.user": "User",
  "common.openUserMenu": "Open user menu",
  "common.userMenu": "User menu",
  "common.unknownAction": "Unknown action.",
  "common.practice": "Practice",
  "common.tools": "Tools",
  "common.progress": "Progress",
  "theme.auto": "Auto",
  "theme.light": "Light",
  "theme.dark": "Dark",

  // --- language switcher ---
  "locale.formLabel": "Language",
  "locale.switchTo": "Switch the interface to {language}",

  // --- document / meta ---
  "meta.root.description": "Personal tools lab",
  "meta.english.description":
    "One workspace for focused English practice: read, write, listen, speak, and translate with AI feedback along the way.",
  "meta.dictation.title": "Dictation · bcailab",
  "meta.dictation.description":
    "Listen sentence by sentence and type what you hear. Instant scoring, graded passages from A2 to C1. Free to try — no account needed.",
  "meta.dictationPassage.title": "{title} · Dictation · bcailab",
  "meta.login.title": "Sign in · bcailab",

  // --- breadcrumbs (site header) ---
  "breadcrumb.english": "english",

  // --- footer ---
  "footer.location": "© {year} bcailab · Burnaby, British Columbia, Canada",
  "footer.about": "About",

  // --- error boundary ---
  "error.status": "Error",
  "error.title": "Something went wrong",
  "error.detail": "An unexpected error interrupted this page. Trying again often clears it.",
  "error.notFoundTitle": "This page does not exist",
  "error.notFoundDetail":
    "The link may be out of date, or the item it pointed at has been removed.",
  "error.serverDetail": "The server could not complete this request.",
  "error.goStudio": "Go to English Studio",

  // --- English Studio modules (registry copy) ---
  "module.dictation.label": "Dictation",
  "module.dictation.description": "Listen sentence by sentence and type what you hear.",
  "module.dictation.detail":
    "Graded passages from A2 to C1 with per-sentence audio, unlimited replays, and a speed toggle. Every sentence is scored instantly against the reference. Free to try without an account.",
  "module.reading.label": "Reading",
  "module.reading.description":
    "Read aloud or recite passages, get AI evaluation on every attempt.",
  "module.reading.detail":
    "Save passages, record attempts, and receive structured feedback on pronunciation, fluency, and completeness — with a progress dashboard across attempts.",
  "module.writing.label": "Writing",
  "module.writing.description": "Draft, get structured feedback, revise, and track rounds.",
  "module.writing.detail":
    "Choose a coach persona, submit a draft, and work through revision rounds with scored feedback that remembers where you left off.",
  "module.translate.label": "Translate",
  "module.translate.description": "DeepL-style translation between English, Chinese, and more.",
  "module.translate.detail":
    "Two-pane translation driven by an LLM: auto-detect the source language, keep formatting intact, and swap directions in one click. Free to try without an account.",
  "module.speech.label": "Speech",
  "module.speech.description": "Turn any text into natural audio you can replay anywhere.",
  "module.speech.detail":
    "Generate MP3 audio with natural voices, keep a private history, and use it as listening or shadowing material.",
  "module.dictionary.label": "AI Dictionary",
  "module.dictionary.description": "Word and phrase explanation with bilingual support.",
  "module.dictionary.detail":
    "Planned: contextual explanations that connect back to your reading and writing practice.",
  "moduleTag.listening": "Listening",
  "moduleTag.scoring": "Scoring",
  "moduleTag.freeToTry": "Free to try",
  "moduleTag.speaking": "Speaking",
  "moduleTag.evaluation": "Evaluation",
  "moduleTag.writing": "Writing",
  "moduleTag.feedback": "Feedback",
  "moduleTag.translation": "Translation",
  "moduleTag.llm": "LLM",
  "moduleTag.tts": "TTS",
  "moduleTag.vocabulary": "Vocabulary",
  "moduleAccess.public": "No account",
  "moduleAccess.trial": "Free to try",
  "moduleAccess.auth": "Account",

  // --- homepage ---
  "home.eyebrow": "English Studio — from bcailab",
  "home.titleLead": "Deliberate English practice,",
  "home.titleEmphasis": "one attempt at a time.",
  "home.desc":
    "Take dictation sentence by sentence, recite passages and learn exactly what needs work, revise essays with a writing coach, generate audio for shadowing, and translate without leaving the page — one account, shared progress across every mode.",
  "home.openStudio": "Open English Studio",
  "home.tryTranslate": "Try Translate — no account",
  "home.seeInside": "See what’s inside",
  "home.access":
    "Translate and Dictation are open to everyone. Reading and Writing include a free trial before you sign in.",
  "home.loginHint": "Please sign in to access the tools.",
  "home.inside": "Inside English Studio",
  "home.planned": "Planned",
  "home.notBuilt": "Not built yet",
  "home.otherProjects": "Other projects",
  "home.project.mapdown.note": "No account",
  "home.project.mapdown.description":
    "A keyboard-driven Markdown mind-map editor. Enter adds a sibling, Tab adds a child, and maps live in your browser — so it works offline and on the first visit.",
  "home.project.posts.note": "Account required",
  "home.project.posts.description":
    "A quiet publishing tool. Write in Markdown, publish in one step, share a clean public URL.",
  "home.project.vanmemo.note": "Separate site",
  "home.project.vanmemo.description":
    "A calm home for fleeting thoughts. Capture without picking a folder or inventing a title, then find it again by tag, search, or pin.",
  "home.lab": "The lab",
  "home.labBody":
    "bcailab is built and run by {name} from Burnaby, British Columbia, Canada. The lab stays small on purpose so the shipped tools can stay sharp — growth is deliberate, one useful product at a time.",
  "home.aboutLab": "About the lab →",
  "home.followX": "Follow on X →",

  // --- /english landing ---
  "english.eyebrow": "A bcailab product",
  "english.tagline":
    "One workspace for focused English practice — read, write, listen, speak, and translate with AI feedback along the way.",
  "english.desc":
    "English Studio brings the lab’s language tools together in one place. Practice through real workflows: recite a passage and learn what needs work; revise an essay with an AI coach; turn text into audio for listening and shadowing; and translate without leaving your workspace.",
  "english.signInToStart": "Sign in to start",
  "english.modules": "Modules",
  "english.soon": "Soon",
  "english.noteTitle": "One account, shared progress",
  "english.noteBody":
    "Every module uses the same Google sign-in and the same design language. Your practice feeds one shared learner profile — dictation and reading both contribute — and history stays private to your account.",
  "english.viewProgress": "View your progress →",

  // --- studio navigation rail ---
  "rail.openNav": "Open navigation",
  "rail.closeNav": "Close navigation",
  "rail.navDialog": "English Studio navigation",
  "rail.backHome": "Back to bcailab home",
  "rail.expand": "Expand sidebar",
  "rail.collapse": "Collapse sidebar",

  // --- dictation library ---
  "dictation.title": "Dictation",
  "dictation.intro":
    "Listen to a passage sentence by sentence and type what you hear. You get instant feedback on every sentence.",
  "dictation.introAnonymous": " No account needed to start.",
  "dictation.workspace": "Your workspace",
  "dictation.recent": "Recent practice",
  "dictation.fullProgress": "Full progress →",
  "dictation.attempts": "{count} attempts",
  "dictation.attemptsBest": "{count} attempts · best {best}%",
  "dictation.inProgressDone": "In progress · {done} done",
  "dictation.empty": "No passages are available yet.",
  "dictation.band.A2": "Short everyday sentences, simple tenses.",
  "dictation.band.B1": "Everyday narrative with common connectors.",
  "dictation.band.B2": "Varied tenses, opinion and contrast.",
  "dictation.band.C1": "Complex sentences and nuanced vocabulary.",
  "dictation.sentences": "{count} sentences",
  "dictation.best": "Best {pct}%",
  "dictation.notStarted": "Not started",

  // --- dictation session ---
  "dictation.unknownSentence": "Unknown sentence.",
  "dictation.malformed": "Malformed submission.",
  "dictation.quotaSignedIn": "Daily dictation limit reached. Please come back tomorrow.",
  "dictation.quotaAnonymous":
    "You've used today's free dictation practice. Sign in to keep going — it's free.",
  "dictation.gateTitle": "Come back tomorrow",
  "dictation.backToLibrary": "Back to library",
  "dictation.backToDictation": "Back to Dictation",
  "dictation.feedbackPending": "Looking for patterns in your errors…",
  "dictation.feedbackTitle": "What to work on",
  "dictation.overallAccuracy": "overall accuracy",
  "dictation.replayOne": "{count} replay",
  "dictation.replayMany": "{count} replays",
  "dictation.blank": "(blank)",
  "dictation.handoff":
    "You know the words now. Read the same passage aloud and get feedback on your pronunciation and rhythm.",
  "dictation.readAloud": "Read it aloud",
  "dictation.signInCta":
    "Sign in to save your progress and get coach feedback on your error patterns.",
  "dictation.sentenceOf": "Sentence {current} of {total}",
  "dictation.playSentence": "Play sentence",
  "dictation.playAgain": "Play sentence again",
  "dictation.loading": "Loading…",
  "dictation.playing": "Playing…",
  "dictation.play": "Play",
  "dictation.replay": "Replay",
  "dictation.playbackSpeed": "Playback speed",
  "dictation.listens": "{count} listens",
  "dictation.yourAnswer": "Your answer",
  "dictation.placeholder": "Type what you hear…",
  "dictation.correct": "{pct}% correct",
  "dictation.scoring": "Scoring…",
  "dictation.finish": "Finish",
  "dictation.nextSentence": "Next sentence",
  "dictation.checking": "Checking…",
  "dictation.check": "Check",

  // --- sign-in popup ---
  "login.title": "Sign in to bcailab",
  "login.google": "Continue with Google",
  "login.orEmail": "or use email",
  "login.email": "Email address",
  "login.password": "Password",
  "login.newPassword": "New password",
  "login.signingIn": "Signing in…",
  "login.useCode": "Sign in with an email code instead",
  "login.usePassword": "Sign in with a password instead",
  "login.forgot": "Forgot or never set a password?",
  "login.sending": "Sending…",
  "login.sendReset": "Send reset code",
  "login.backToPassword": "Back to password sign-in",
  "login.enterCode": "Enter the 6-digit code sent to {email}",
  "login.passwordMin": "At least {min} characters",
  "login.devCode": "Dev mode: your code is {code}",
  "login.saving": "Saving…",
  "login.setPassword": "Set password & sign in",
  "login.differentEmail": "Use a different email",
  "login.sendCode": "Send sign-in code",
  "login.verifying": "Verifying…",
  "login.verify": "Verify & sign in",
  "login.error.email": "Enter a valid email address.",
  "login.error.credentials": "Incorrect email or password.",
  "login.error.codeFormat": "Enter the 6-digit code from the email.",
  "login.error.passwordLength": "Choose a password of at least {min} characters.",
  "login.error.notConfigured": "Email sign-in is not configured on this deployment.",
  "login.error.rateLimited": "Too many codes requested. Please try again later.",
  "login.error.sendFailed": "Could not send the email. Please try again.",
  "login.error.expired": "Code expired or not found. Request a new one.",
  "login.error.tooManyAttempts": "Too many attempts. Request a new code.",
  "login.error.incorrectCode": "Incorrect code. Please check and try again."
} satisfies Record<string, string>;

export type MessageKey = keyof typeof en;
