import type { Metadata } from "next";
import { SwaggerUI } from "./swagger-ui";

export const metadata: Metadata = {
  title: "API Documentation | easyRecharge",
  robots: { index: false, follow: false },
};

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-white">
      <SwaggerUI />
    </div>
  );
}
