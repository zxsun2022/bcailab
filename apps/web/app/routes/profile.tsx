import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { getUserPasswordHash, setUserPassword, updateUserProfile } from "@bcailab/db";
import { requireUser } from "~/utils/auth.server";
import { hashPassword, verifyPassword } from "~/utils/password.server";
import { validatePasswordStrength, MIN_PASSWORD_LENGTH } from "~/utils/password";

const MAX_NAME_LENGTH = 80;
const MAX_AVATAR_LENGTH = 500;

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
    const avatar = String(form.get("avatar_url") ?? "").trim();
    if (name.length > MAX_NAME_LENGTH) {
      return json<ActionData>(
        { section: "profile", ok: false, error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` },
        { status: 400 }
      );
    }
    if (avatar.length > MAX_AVATAR_LENGTH || (avatar && !/^https?:\/\//i.test(avatar))) {
      return json<ActionData>(
        { section: "profile", ok: false, error: "Enter a valid http(s) image URL, or leave it blank." },
        { status: 400 }
      );
    }
    // Empty means "leave unchanged" (updateUserProfile COALESCEs null), so a blank field is a no-op.
    await updateUserProfile(context.env.DB, user.id, {
      name: name || null,
      avatar_url: avatar || null
    });
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
    <div className="tool-settings-page">
      <h1 className="login-title">Profile</h1>
      <div className="tool-settings-card">
        <section className="tool-settings-section">
          <div className="settings-user-profile">
            <img className="settings-user-avatar" src={avatarSrc} alt={displayName} />
            <div className="settings-user-info">
              <div className="settings-user-name">{displayName}</div>
              {user.email ? <div className="settings-user-email">{user.email}</div> : null}
            </div>
          </div>
        </section>

        <section className="tool-settings-section">
          <div className="menu-label">Account information</div>
          <profileFetcher.Form method="post" className="login-form">
            <input type="hidden" name="intent" value="update-profile" />
            <label className="login-label" htmlFor="profile-name">
              Display name
            </label>
            <input
              id="profile-name"
              className="login-input"
              type="text"
              name="name"
              defaultValue={user.name ?? ""}
              maxLength={MAX_NAME_LENGTH}
              placeholder="Your name"
            />
            <label className="login-label" htmlFor="profile-avatar">
              Avatar image URL
            </label>
            <input
              id="profile-avatar"
              className="login-input"
              type="url"
              name="avatar_url"
              defaultValue={user.avatar_url ?? ""}
              maxLength={MAX_AVATAR_LENGTH}
              placeholder="https://…"
            />
            <button type="submit" className="login-submit" disabled={profileBusy}>
              {profileBusy ? "Saving…" : "Save changes"}
            </button>
            {profileData?.ok ? <p className="login-devcode">Saved.</p> : null}
            {profileData && !profileData.ok ? <p className="login-error">{profileData.error}</p> : null}
          </profileFetcher.Form>
        </section>

        <section className="tool-settings-section">
          <div className="menu-label">{hasPassword ? "Change password" : "Set a password"}</div>
          <passwordFetcher.Form method="post" className="login-form">
            <input type="hidden" name="intent" value="set-password" />
            {hasPassword ? (
              <>
                <label className="login-label" htmlFor="current-password">
                  Current password
                </label>
                <input
                  id="current-password"
                  className="login-input"
                  type="password"
                  name="current_password"
                  autoComplete="current-password"
                  required
                />
              </>
            ) : null}
            <label className="login-label" htmlFor="new-password">
              New password
            </label>
            <input
              id="new-password"
              className="login-input"
              type="password"
              name="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              required
            />
            <label className="login-label" htmlFor="confirm-password">
              Confirm new password
            </label>
            <input
              id="confirm-password"
              className="login-input"
              type="password"
              name="confirm"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
            <button type="submit" className="login-submit" disabled={passwordBusy}>
              {passwordBusy ? "Saving…" : hasPassword ? "Update password" : "Set password"}
            </button>
            {passwordData?.ok ? <p className="login-devcode">Password saved.</p> : null}
            {passwordData && !passwordData.ok ? (
              <p className="login-error">{passwordData.error}</p>
            ) : null}
          </passwordFetcher.Form>
        </section>
      </div>
    </div>
  );
}
