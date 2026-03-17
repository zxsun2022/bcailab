import { Link } from "@remix-run/react";
import { READING_OUTPUT_LANGUAGE_OPTIONS } from "~/utils/reading-settings";
import { useReadingOutputLanguage } from "~/utils/use-reading-output-language";

export const handle = {
  breadcrumb: { label: "settings", href: "/reading/settings" }
};

export default function ReadingSettingsPage() {
  const [outputLanguage, setOutputLanguage] = useReadingOutputLanguage();

  return (
    <div className="esl-settings-page">
      <div className="esl-settings-card">
        <Link to="/reading" className="posts-link esl-mobile-back">
          &larr; Passages
        </Link>

        <div className="esl-settings-header">
          <h2>Settings</h2>
          <p className="esl-settings-subtitle">
            Reading preferences live here. More settings can be added to this page later.
          </p>
        </div>

        <section className="esl-settings-section">
          <div className="menu-label">Feedback</div>
          <div className="menu-setting-row">
            <div className="menu-setting-title">Output Language</div>
            <div className="menu-setting-hint">
              New feedback and retry requests use this language.
            </div>
          </div>
          <div className="menu-option-grid menu-option-grid-two esl-settings-options">
            {READING_OUTPUT_LANGUAGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`menu-option-button ${
                  outputLanguage === option.value ? "is-active" : ""
                }`}
                aria-pressed={outputLanguage === option.value}
                onClick={() => setOutputLanguage(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
