import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { getUserPasswordHash, setUserPassword, updateUserProfile } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { hashPassword, verifyPassword } from "~/utils/password.server";
import { validatePasswordStrength, MIN_PASSWORD_LENGTH } from "~/utils/password";
import { useT } from "~/i18n/context";
import { metaTranslator } from "~/i18n/meta";
import { getRequestTranslator } from "~/i18n/locale.server";

const MAX_NAME_LENGTH = 80;

export const meta: MetaFunction = ({ matches }) => [
  { title: metaTranslator(matches)("meta.profile.title") }
];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const user = await requireUser(request, context);
  const hasPassword = (await getUserPasswordHash(context.env.DB, user.id)) !== null;
  return json({ user, hasPassword });
};

type ActionData =
  | { section: "profile" | "password"; ok: true }
  | { section: "profile" | "password"; ok: false; error: string };

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const user = await requireUser(request, context);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  // Errors below are shown as written, in the interface language.
  const t = getRequestTranslator(request);

  if (intent === "update-profile") {
    const name = String(form.get("name") ?? "").trim();
    if (name.length > MAX_NAME_LENGTH) {
      return json<ActionData>(
        { section: "profile", ok: false, error: t("profile.error.nameTooLong", { max: MAX_NAME_LENGTH }) },
        { status: 400 }
      );
    }
    // The avatar is not user-editable: it comes from Google, or falls back to the default
    // placeholder. This update deliberately touches the display name only.
    await updateUserProfile(context.env.DB, user.id, { name: name || null });
    return json<ActionData>({ section: "profile", ok: true });
  }

  if (intent === "set-password") {
    const current = String(form.get("current_password") ?? "");
    const next = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    const existing = await getUserPasswordHash(context.env.DB, user.id);
    // Changing an existing password requires proving the current one; setting the first
    // password only requires the authenticated session.
    if (existing && !(await verifyPassword(current, existing))) {
      return json<ActionData>(
        { section: "password", ok: false, error: t("profile.error.currentIncorrect") },
        { status: 400 }
      );
    }
    if (validatePasswordStrength(next)) {
      return json<ActionData>(
        {
          section: "password",
          ok: false,
          error: t("login.error.passwordLength", { min: MIN_PASSWORD_LENGTH })
        },
        { status: 400 }
      );
    }
    if (next !== confirm) {
      return json<ActionData>(
        { section: "password", ok: false, error: t("profile.error.mismatch") },
        { status: 400 }
      );
    }
    await setUserPassword(context.env.DB, user.id, await hashPassword(next));
    return json<ActionData>({ section: "password", ok: true });
  }

  return json<ActionData>({ section: "profile", ok: false, error: t("common.unknownAction") }, { status: 400 });
};

export default function ProfilePage() {
  const { user, hasPassword } = useLoaderData<typeof loader>();
  const profileFetcher = useFetcher<ActionData>();
  const passwordFetcher = useFetcher<ActionData>();
  const t = useT();

  const avatarSrc = user.avatar_url ?? "https://www.gravatar.com/avatar/?d=mp";
  const displayName = user.name ?? user.email ?? t("common.account");

  const profileData = profileFetcher.data;
  const passwordData = passwordFetcher.data;
  const profileBusy = profileFetcher.state !== "idle";
  const passwordBusy = passwordFetcher.state !== "idle";

  return (
    <div className="profile-page">
      <header className="profile-header">
        <h1 className="profile-title">{t("profile.title")}</h1>
        <p className="profile-description">{t("profile.description")}</p>
      </header>

      <div className="profile-identity">
        <img
          className="profile-identity-avatar"
          src={avatarSrc}
          alt=""
          referrerPolicy="no-referrer"
        />
        <div className="profile-identity-copy">
          <div className="profile-identity-name">{displayName}</div>
          {user.email ? <div className="profile-identity-email">{user.email}</div> : null}
        </div>
      </div>

      <section className="profile-section">
        <h2 className="profile-section-title">{t("profile.accountInfo")}</h2>
        <profileFetcher.Form method="post" className="profile-form">
          <input type="hidden" name="intent" value="update-profile" />

          <div className="profile-field">
            <label className="profile-label" htmlFor="profile-name">
              {t("profile.displayName")}
            </label>
            <input
              id="profile-name"
              className="profile-input"
              type="text"
              name="name"
              defaultValue={user.name ?? ""}
              maxLength={MAX_NAME_LENGTH}
              placeholder={t("profile.namePlaceholder")}
            />
            <p className="profile-hint">{t("profile.nameHint")}</p>
          </div>

          <div className="profile-actions">
            <button type="submit" className="btn btn-primary" disabled={profileBusy}>
              {profileBusy ? t("common.saving") : t("profile.saveChanges")}
            </button>
            {profileData?.ok ? (
              <p className="profile-status" role="status">
                {t("profile.saved")}
              </p>
            ) : null}
            {profileData && !profileData.ok ? (
              <p className="profile-error" role="alert">
                {profileData.error}
              </p>
            ) : null}
          </div>
        </profileFetcher.Form>
      </section>

      <section className="profile-section">
        <h2 className="profile-section-title">
          {hasPassword ? t("profile.changePassword") : t("profile.setPassword")}
        </h2>
        <p className="profile-section-intro">
          {hasPassword ? t("profile.withPassword") : t("profile.withoutPassword")}
        </p>
        <passwordFetcher.Form method="post" className="profile-form">
          <input type="hidden" name="intent" value="set-password" />

          {hasPassword ? (
            <div className="profile-field">
              <label className="profile-label" htmlFor="current-password">
                {t("profile.currentPassword")}
              </label>
              <input
                id="current-password"
                className="profile-input"
                type="password"
                name="current_password"
                autoComplete="current-password"
                required
              />
            </div>
          ) : null}

          <div className="profile-field">
            <label className="profile-label" htmlFor="new-password">
              {t("login.newPassword")}
            </label>
            <input
              id="new-password"
              className="profile-input"
              type="password"
              name="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              placeholder={t("login.passwordMin", { min: MIN_PASSWORD_LENGTH })}
              required
            />
          </div>

          <div className="profile-field">
            <label className="profile-label" htmlFor="confirm-password">
              {t("profile.confirmPassword")}
            </label>
            <input
              id="confirm-password"
              className="profile-input"
              type="password"
              name="confirm"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
          </div>

          <div className="profile-actions">
            <button type="submit" className="btn btn-primary" disabled={passwordBusy}>
              {passwordBusy
                ? t("common.saving")
                : hasPassword
                  ? t("profile.updatePassword")
                  : t("profile.setPasswordButton")}
            </button>
            {passwordData?.ok ? (
              <p className="profile-status" role="status">
                {t("profile.passwordSaved")}
              </p>
            ) : null}
            {passwordData && !passwordData.ok ? (
              <p className="profile-error" role="alert">
                {passwordData.error}
              </p>
            ) : null}
          </div>
        </passwordFetcher.Form>
      </section>
    </div>
  );
}
