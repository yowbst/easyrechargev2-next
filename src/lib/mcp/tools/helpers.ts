export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function err(message: string, hint?: string): ToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(hint ? { error: message, hint } : { error: message }) }],
  };
}

export async function run(fn: () => Promise<unknown>, hint?: string): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e), hint);
  }
}
