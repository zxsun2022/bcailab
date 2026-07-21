export default function About() {
  return (
    <div className="page">
      <h1>About bcailab</h1>
      <p className="page-intro">
        bcailab is a small AI tools lab focused on real workflows. The product direction is simple:
        build one clear tool for one clear job, keep the interface calm, and let people move
        between tools with the same account and the same overall design language.
      </p>
      <section>
        <h2>What this lab builds</h2>
        <p>
          Instead of one large app with many loosely related features, bcailab grows as a set of
          focused workspaces built on shared foundations: authentication, storage, layout patterns,
          and deployment infrastructure. That keeps each tool easier to learn, easier to maintain,
          and easier to improve without turning the whole product into a control panel.
        </p>
      </section>
      <section>
        <h2>English Studio</h2>
        <p>
          The lab&rsquo;s flagship product is an AI English coach that covers listening, speaking,
          writing, and translation in one workspace. The modules share an account and are gradually
          coming to share a learner profile, so practice in one place informs the others.
        </p>
        <p>
          <strong>Dictation</strong>: listen to a graded passage sentence by sentence, type what you
          hear, and get instant scoring on every sentence. Passages run from CEFR A2 to C1, with
          unlimited replays and a slower playback option.
        </p>
        <p>
          <strong>Reading / Recitation</strong>: practice reading passages aloud or from memory,
          store attempts, and get AI-supported evaluation on pronunciation, fluency, and clarity.
        </p>
        <p>
          <strong>Writing Coach</strong>: an iterative writing workflow where you choose a coach,
          submit a draft, receive structured feedback, revise, and track progress across rounds.
        </p>
        <p>
          <strong>Translate</strong>: LLM translation between English, Chinese, and other languages,
          with source-language detection and a two-pane layout.
        </p>
        <p>
          <strong>Speech</strong>: turn text into natural MP3 audio with Google Cloud TTS voices,
          keep a private generation history, and play or download results on demand.
        </p>
      </section>
      <section>
        <h2>Other tools</h2>
        <p>
          <strong>Posts</strong>: write in Markdown, publish quickly, and share a clean public URL
          without unnecessary formatting overhead.
        </p>
      </section>
      <section>
        <h2>Try before signing up</h2>
        <p>
          Translate and Dictation work without an account, within a daily limit. Reading and Writing
          each offer a full sample evaluation to anonymous visitors — you record or write once and
          get the same feedback a signed-in user would, without anything being stored.
        </p>
        <p>
          Signing in is what turns a one-off try into practice that accumulates: saved work, attempt
          history, and progress you can look back on.
        </p>
      </section>
      <section>
        <h2>How the platform works</h2>
        <p>
          You can sign in with Google or with a one-time code sent to your email. Once signed in, you
          can move between workspaces without logging in again. Shared infrastructure on Cloudflare
          handles app delivery, data storage, and asset storage so each tool can stay focused on its
          own job.
        </p>
        <p>
          Practice recordings and drafts are private to your account. Translation text is never
          stored at all, and anonymous trials are evaluated and discarded rather than saved.
        </p>
      </section>
      <section>
        <h2>Product principles</h2>
        <p>
          The standard for new work is practical usefulness over feature count. A tool should solve
          a concrete problem, keep the learning curve low, and feel coherent with the rest of the
          lab without being forced into a one-size-fits-all interface.
        </p>
        <p>
          More tools may be added over time, but growth is deliberate. bcailab stays small on
          purpose so the shipped tools can stay sharp.
        </p>
      </section>
    </div>
  );
}
