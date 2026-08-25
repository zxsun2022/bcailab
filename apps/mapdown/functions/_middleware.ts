import { mapdownRootRedirect } from "./_shared/root-host";

export const onRequest: PagesFunction<Env> = async (context) => {
  const target = mapdownRootRedirect(
    context.request.url,
    context.env.PUBLISHED_ORIGIN,
    context.env.MAPDOWN_ORIGIN
  );

  if (target) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: target,
        "Cache-Control": "no-store"
      }
    });
  }

  return context.next();
};
