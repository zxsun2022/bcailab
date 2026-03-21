export function WritingUnavailableState() {
  return (
    <div className="writing-status-card">
      <div className="writing-status-title">Writing unavailable</div>
      <p className="writing-status-desc">
        This environment is missing the latest writing database schema. Apply the latest D1
        migrations and reload.
      </p>
    </div>
  );
}
