import { Card } from "@/components/ui/card";
import { LucideCmsIcon } from "./LucideCmsIcon";

interface ProcessStep {
  id: string;
  icon: string;
  number: number;
  title: string;
  description: string;
}

interface ProcessStepsProps {
  title?: string;
  subtitle?: string;
  steps: ProcessStep[];
}

export function ProcessSteps({ title, subtitle, steps }: ProcessStepsProps) {
  if (!steps.length) return null;

  return (
    <section className="py-16">
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

        <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Connector line (desktop only) */}
          <div className="hidden lg:block absolute top-12 left-[12.5%] right-[12.5%] h-px bg-border" />

          {steps.map((step) => (
            <Card key={step.id} className="relative p-6 space-y-3">
              <span className="absolute -top-3 -left-2 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                {step.number}
              </span>
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <LucideCmsIcon name={step.icon} className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
