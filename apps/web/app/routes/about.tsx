export default function About() {
  return (
    <div className="page">
      <h1>About bcailab</h1>
      <p className="page-intro">
        bcailab is a personal lab for small, focused tools. Each tool solves one concrete problem,
        while sharing a consistent login and a simple interface.
      </p>
      <section>
        <h2>Current tools</h2>
        <p>
          <strong>Posts</strong>: write Markdown and publish a shareable post URL.
        </p>
        <p>
          <strong>Speech</strong>: generate MP3 audio from text using Google Cloud TTS voices.
          Neural2 supports synchronized text highlighting; Chirp3 focuses on high-quality speech output.
        </p>
      </section>
      <section>
        <h2>How access works</h2>
        <p>
          Tools are available after Google sign-in. The homepage allows quick login and then you can
          switch between tools without logging in again.
        </p>
      </section>
      <section>
        <h2>Data and storage</h2>
        <p>
          Structured data is stored in Cloudflare D1. Generated binary assets such as Speech audio files
          are stored in Cloudflare R2.
        </p>
      </section>
    </div>
  );
}
