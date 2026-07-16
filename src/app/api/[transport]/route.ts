import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyMcpToken } from "@/lib/mcp/auth";
import { registerAdminTools } from "@/lib/mcp/tools/admin";
import { registerAppTools } from "@/lib/mcp/tools/app";
import { registerCmsTools } from "@/lib/mcp/tools/cms";
import { registerDirectusTools } from "@/lib/mcp/tools/directus-generic";
import { registerFormTools } from "@/lib/mcp/tools/forms";

const handler = createMcpHandler(
  (server) => {
    registerCmsTools(server);
    registerAppTools(server);
    registerFormTools(server);
    registerAdminTools(server);
    registerDirectusTools(server);
  },
  { serverInfo: { name: "easyrecharge", version: "1.0.0" } },
  { basePath: "/api", maxDuration: 120 },
);

const authHandler = withMcpAuth(handler, verifyMcpToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
