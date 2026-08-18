import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { getUserPasswordHash, setUserPassword, updateUserProfile } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { hashPassword, verifyPassword } from "~/utils/password.server";
import { validatePasswordStrength, MIN_PASSWORD_LENGTH } from "~/utils/password";

const MAX_NAME_LENGTH = 80;

export const meta: MetaFunction = () => [{ title: "Profile · bcailab" }];

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

  if (intent === "update-profile") {
    const name = String(form.get("name") ?? "").trim();
    if (name.length > MAX_NAME_LENGTH) {
      return json<ActionData>(
        { section: "profile", ok: false, error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` },
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
        { section: "password", ok: false, error: "Current password is incorrect." },
        { status: 400 }
      );
    }
    if (validatePasswordStrength(next)) {
      return json<ActionData>(
        {
          section: "password",
          ok: false,
          error: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`
        },
        { status: 400 }
      );
    }
    if (next !== confirm) {
      return json<ActionData>(
        { section: "password", ok: false, error: "The two passwords do not match." },
        { status: 400 }
      );
    }
    await setUserPassword(context.env.DB, user.id, await hashPassword(next));
    return json<ActionData>({ section: "password", ok: true });
  }

  return json<ActionData>({ section: "profile", ok: false, error: "Unknown action." }, { status: 400 });
};

export default function ProfilePage() {
  const { user, hasPassword } = useLoaderData<typeof loader>();
  const profileFetcher = useFetcher<ActionData>();
  const passwordFetcher = useFetcher<ActionData>();

  const avatarSrc = user.avatar_url ?? "https://www.gravatar.com/avatar/?d=mp";
  const displayName = user.name ?? user.email ?? "Account";

  const profileData = profileFetcher.data;
  const passwordData = passwordFetcher.data;
  const profileBusy = profileFetcher.state !== "idle";
  const passwordBusy = passwordFetcher.state !== "idle";

  return (
    <div className="profile-page">
      <header className="profile-header">
        <h1 className="profile-title">Profile</h1>
        <p className="profile-description">
          Manage how you appear across the studio and how you sign in.
        </p>
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
        <h2 className="profile-section-title">Account information</h2>
        <profileFetcher.Form method="post" className="profile-form">
          <input type="hidden" name="intent" value="update-profile" />

          <div className="profile-field">
            <label className="profile-label" htmlFor="profile-name">
              Display name
            </label>
            <input
              id="profile-name"
              className="profile-input"
              type="text"
              name="name"
              defaultValue={user.name ?? ""}
              maxLength={MAX_NAME_LENGTH}
              placeholder="Your name"
            />
            <p className="profile-hint">Leave blank to fall back to your email address.</p>
          </div>

          <div className="profile-actions">
            <button type="submit" className="btn btn-primary" disabled={profileBusy}>
              {profileBusy ? "Saving…" : "Save changes"}
            </button>
            {profileData?.ok ? (
              <p className="profile-status" role="status">
                Saved.
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
          {hasPassword ? "Change password" : "Set a password"}
        </h2>
        <p className="profile-section-intro">
          {hasPassword
            ? "Your account can sign in with an email code, Google, or this password."
            : "Optional. Your account already signs in with an email code or Google — a password simply adds another way in."}
        </p>
        <passwordFetcher.Form method="post" className="profile-form">
          <input type="hidden" name="intent" value="set-password" />

          {hasPassword ? (
            <div className="profile-field">
              <label className="profile-label" htmlFor="current-password">
                Current password
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
              New password
            </label>
            <input
              id="new-password"
              className="profile-input"
              type="password"
              name="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              required
            />
          </div>

          <div className="profile-field">
            <label className="profile-label" htmlFor="confirm-password">
              Confirm new password
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
              {passwordBusy ? "Saving…" : hasPassword ? "Update password" : "Set password"}
            </button>
            {passwordData?.ok ? (
              <p className="profile-status" role="status">
                Password saved.
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
