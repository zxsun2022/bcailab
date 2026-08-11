export const FEATURED_WRITING_TRIAL_SLUG = "general-a2-study-invitation";

export const classifyWritingTrialAssignment = (
  featuredSlug: string
): "freeform" | "featured" | "invalid" => {
  if (!featuredSlug) return "freeform";
  return featuredSlug === FEATURED_WRITING_TRIAL_SLUG ? "featured" : "invalid";
};
