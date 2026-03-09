export default function About() {
  return (
    <div className="page">
      <h1>About bcailab</h1>
      <p className="page-intro">
        bcailab is a personal lab for small, practical tools. The goal is simple: build focused
        software for one clear job, keep the interface calm, and make it easy to move between tools
        with the same account.
      </p>
      <section>
        <h2>What this lab is for</h2>
        <p>
          This project is intentionally small in scope. Instead of one large product with many
          modes, bcailab grows as a collection of independent utilities that share the same
          foundation. That keeps each tool easier to understand, easier to maintain, and faster to
          use.
        </p>
      </section>
      <section>
        <h2>Current tools</h2>
        <p>
          <strong>Posts</strong>: write in Markdown, publish quickly, and share a clean public URL
          without extra formatting overhead.
        </p>
        <p>
          <strong>Speech</strong>: turn text into MP3 audio with Google Cloud TTS voices. Neural2
          supports synchronized text highlighting, while Chirp3 is optimized for high-quality speech
          output.
        </p>
      </section>
      <section>
        <h2>Access and workflow</h2>
        <p>
          Access is handled through Google sign-in. Once signed in, you can move from one tool to
          another without logging in again. The homepage is designed as the entry point, so starting
          a session and switching tools stays lightweight.
        </p>
        <p>
          More tools may be added over time, but the principle stays the same: each one should solve
          a concrete problem well, without unnecessary steps or clutter.
        </p>
      </section>
    </div>
  );
}
