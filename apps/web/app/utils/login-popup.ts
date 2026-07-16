/**
 * Opens the sign-in popup (/login: Google OAuth or email code). The popup
 * posts a "bcailab-auth" message back to the opener on success (handled in
 * Header), which reloads the page.
 */
export const openLoginPopup = () => {
  const width = 520;
  const height = 640;
  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;
  window.open(
    "/login",
    "bcailab-auth",
    `width=${width},height=${height},left=${left},top=${top}`
  );
};
