import * as LucideIcons from "lucide-react";

type Props = {
  name?: string | null;
  className?: string;
};

export function LucideCmsIcon({ name, className = "" }: Props) {
  if (!name) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IconComponent = (LucideIcons as any)[name];
  if (!IconComponent) return null;
  return <IconComponent className={className} />;
}
