import { Card } from "@/components/ui/card";
import * as LucideIcons from "lucide-react";
import { cmsBgImage } from "@/lib/directusAssets";
import { t } from "@/lib/i18n/dictionaries";

interface ProcessStepConfig {
  id: string;
  icon: string;
  number: number;
}

interface ProcessStepsProps {
  title?: string;
  subtitle?: string;
  stepsConfig?: ProcessStepConfig[];
  tPrefix: string;
  image?: string;
  tOptions?: Record<string, unknown>;
  dictionary: Record<string, string>;
}

function getIconComponent(iconName?: string) {
  if (!iconName) return LucideIcons.Circle;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IconComponent = (LucideIcons as any)[iconName];
  return IconComponent || LucideIcons.Circle;
}

export function ProcessSteps({ title, subtitle, stepsConfig = [], tPrefix, image, tOptions, dictionary }: ProcessStepsProps) {
  const hasImage = !!image;

  const defaultStepsConfig: ProcessStepConfig[] = [
    { id: "request", icon: "FileText", number: 1 },
    { id: "contact", icon: "Phone", number: 2 },
    { id: "decision", icon: "CheckCircle", number: 3 },
    { id: "installation", icon: "Wrench", number: 4 },
  ];

  const displaySteps = stepsConfig.length > 0 ? stepsConfig : defaultStepsConfig;

  return (
    <section
      className="relative py-24 overflow-hidden"
      style={hasImage ? { backgroundImage: `url(${cmsBgImage(image!)})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
    >
      {!hasImage && <div className="absolute inset-0 bg-muted/30" />}
      {hasImage && <div className="absolute inset-0 bg-slate-900/70" />}

      <div className="relative z-10 container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className={`text-3xl md:text-4xl font-heading font-bold mb-4 ${hasImage ? "text-white" : ""}`}>
            {title}
          </h2>
          <p className={`text-lg max-w-3xl mx-auto ${hasImage ? "text-white/75" : "text-muted-foreground"}`}>
            {subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {displaySteps.map((step, index) => {
            const IconComponent = getIconComponent(step.icon);
            const stepTitle = t(dictionary, `${tPrefix}.process.steps.${step.id}.title`, tOptions as Record<string, string | number> | undefined);
            const stepDescription = t(dictionary, `${tPrefix}.process.steps.${step.id}.description`, tOptions as Record<string, string | number> | undefined);

            return (
              <div key={step.id} className="relative" data-testid={`step-${step.id}`}>
                {index < displaySteps.length - 1 && (
                  <div className={`hidden lg:block absolute top-16 left-1/2 w-full h-0.5 ${hasImage ? "bg-white/20" : "bg-primary/30"}`} />
                )}

                <Card className={`p-6 h-full relative z-10 ${hasImage ? "bg-white/10 backdrop-blur-md border-white/15" : ""}`}>
                  <div className="mb-4 relative">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${hasImage ? "bg-white/15" : "bg-primary/10"}`}>
                      <IconComponent className={`h-8 w-8 ${hasImage ? "text-white" : "text-primary"}`} />
                    </div>
                    <div className="absolute -top-2 -left-2 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                      {step.number}
                    </div>
                  </div>
                  <h3 className={`text-lg font-heading font-semibold mb-2 ${hasImage ? "text-white" : ""}`}>{stepTitle}</h3>
                  <p className={`text-sm ${hasImage ? "text-white/70" : "text-muted-foreground"}`}>{stepDescription}</p>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
