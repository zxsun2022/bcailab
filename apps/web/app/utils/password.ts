// Client-safe password policy shared by the browser UI and the server. Pure — no crypto,
// no bindings — so route components may import the length constant and validator. The actual
// hashing/verification lives in `password.server.ts` and never reaches the client bundle.

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 256;

export type PasswordValidationError = "too_short" | "too_long";

/** Returns an error code if the password fails policy, or `null` if it is acceptable. */
export const validatePasswordStrength = (password: string): PasswordValidationError | null => {
  if (password.length < MIN_PASSWORD_LENGTH) return "too_short";
  if (password.length > MAX_PASSWORD_LENGTH) return "too_long";
  return null;
};
