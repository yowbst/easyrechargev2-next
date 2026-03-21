import { Card } from "@/components/ui/card";
import { LucideCmsIcon } from "./LucideCmsIcon";

interface FeatureItem {
  id: string;
  icon: string;
  title: string;
  description: string;
}

interface FeaturesProps {
  title?: string;
  subtitle?: string;
  items: FeatureItem[];
}

export function Features({ title, subtitle, items }: FeaturesProps) {
  if (!items.length) return null;

  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        {title && (
          <h2 className="font-heading text-3xl font-bold text-center mb-3">
            {title}
          </h2>
        )}
        {subtitle && (
          <p className="text-center text-muted-foreground mb-10 max-w-2xl mx-auto">
            {subtitle}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => (
            <Card key={item.id} className="p-6 space-y-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <LucideCmsIcon name={item.icon} className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
