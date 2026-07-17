"use client";

import dynamic from "next/dynamic";

// Route-variant components for the generic [slug]/[sub1] resolver pages.
//
// These MUST be dynamic()-imported from a Client Component (this file), not
// from the Server Component pages: next/dynamic only lazy-loads on the client
// when called inside a Client Component. Called from a Server Component, every
// variant's chunk is included in the route's script set — which shipped
// QuoteForm+ContactForm+BlogListing+VehiclesHub (~350KB) to EVERY [slug] page
// regardless of which variant actually rendered.
//
// From here, each dynamic() registers a loadable reference; only the variant
// that actually renders triggers its chunk download (SSR still works — ssr
// defaults to true for dynamic() in Client Components).

export const QuoteForm = dynamic(() =>
  import("@/components/quote/QuoteForm").then((m) => m.QuoteForm),
);
export const ContactForm = dynamic(() =>
  import("@/components/ContactForm").then((m) => m.ContactForm),
);
export const BlogListing = dynamic(() =>
  import("@/components/BlogListing").then((m) => m.BlogListing),
);
export const VehiclesHub = dynamic(() =>
  import("@/components/VehiclesHub").then((m) => m.VehiclesHub),
);
export const MiniQuoteForm = dynamic(() =>
  import("@/components/MiniQuoteForm").then((m) => m.MiniQuoteForm),
);
export const VehicleDetailClient = dynamic(() =>
  import("@/components/VehicleDetailClient").then((m) => m.VehicleDetailClient),
);
export const QuoteSuccess = dynamic(() =>
  import("@/components/quote/QuoteSuccess").then((m) => m.QuoteSuccess),
);
export const QuoteSubmissionView = dynamic(() =>
  import("@/components/quote/QuoteSubmissionView").then((m) => m.QuoteSubmissionView),
);
