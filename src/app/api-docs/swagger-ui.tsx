"use client";

import { useEffect, useState } from "react";
import SwaggerUIReact from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

export function SwaggerUI() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [spec, setSpec] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    fetch("/api/docs")
      .then((r) => r.json())
      .then(setSpec)
      .catch(console.error);
  }, []);

  if (!spec) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading API documentation...</p>
      </div>
    );
  }

  return <SwaggerUIReact spec={spec} />;
}
