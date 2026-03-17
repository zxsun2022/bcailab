import { Link } from "@remix-run/react";
import { useWritingFeedbackLanguage } from "~/utils/use-writing-feedback-language";
import { WRITING_FEEDBACK_LANGUAGE_OPTIONS } from "~/utils/writing-settings";

export const handle = {
  breadcrumb: { label: "settings", href: "/writing/settings" }
};

export default function WritingSettingsPage() {
  const [feedbackLanguage, setFeedbackLanguage] = useWritingFeedbackLanguage();

  return (
    <div className="writing-settings-page">
      <div className="writing-settings-card">
        <Link to="/writing" className="writing-mobile-back">
          &larr; Articles
        </Link>

        <div className="writing-settings-header">
          <h2>Settings</h2>
          <p className="writing-settings-subtitle">
            Writing preferences live here. More settings can be added to this page later.
          </p>
        </div>

        <section className="writing-settings-section">
          <div className="menu-label">Feedback</div>
          <div className="menu-setting-row">
            <div className="menu-setting-title">Language</div>
            <div className="menu-setting-hint">
              New feedback and retry requests use this language.
            </div>
          </div>
          <div className="menu-option-grid menu-option-grid-two writing-settings-options">
            {WRITING_FEEDBACK_LANGUAGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`menu-option-button ${
                  feedbackLanguage === option.value ? "is-active" : ""
                }`}
                aria-pressed={feedbackLanguage === option.value}
                onClick={() => setFeedbackLanguage(option.value)}
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
