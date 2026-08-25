import { appShellPath, mapdownRootRedirect } from "./_shared/root-host";

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

  // `/library` and `/import` are rendered by the SPA from the same shell as `/`, and have no
  // asset of their own. Serving that shell here keeps the URL intact; the `_redirects` rewrite
  // that used to do this turned into a 308 to `/` in production and lost the route.
  const shell = appShellPath(new URL(context.request.url).pathname);
  if (shell) {
    return context.next(new Request(new URL(shell, context.request.url), context.request));
  }

  return context.next();
};
