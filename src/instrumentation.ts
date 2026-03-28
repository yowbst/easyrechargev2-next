import { type Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getPostHogServer, extractDistinctId } =
    await import("@/lib/posthog-server");

  try {
    const posthog = getPostHogServer();
    const cookieHeader =
      typeof request.headers.cookie === "string"
        ? request.headers.cookie
        : Array.isArray(request.headers.cookie)
          ? request.headers.cookie.join("; ")
          : null;
    const distinctId = extractDistinctId(cookieHeader) ?? "anonymous";

    posthog.captureException(err, distinctId, {
      $request_path: request.path,
      $request_method: request.method,
      $route_path: context.routePath,
      $route_type: context.routeType,
      $render_source: context.renderSource,
      $router_kind: context.routerKind,
    });

    await posthog.flush();
  } catch {
    // Don't let PostHog errors break the error handler
  }
};
