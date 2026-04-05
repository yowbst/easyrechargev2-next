"use client";

import dynamic from "next/dynamic";

const SwaggerUI = dynamic(() => import("./swagger-ui").then((m) => m.SwaggerUI), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-muted-foreground">Loading API documentation...</p>
    </div>
  ),
});

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-white">
      <SwaggerUI />
    </div>
  );
}
