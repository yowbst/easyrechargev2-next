"use client";

interface ProgressBarProps {
  currentStep: number;
  totalSteps: number;
  onStepClick?: (step: number) => void;
  className?: string;
}

export function ProgressBar({ currentStep, totalSteps, onStepClick, className = "" }: ProgressBarProps) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1;
        const isDone = step < currentStep;
        const isActive = step === currentStep;
        return (
          <div key={step} className="flex items-center gap-1.5 flex-1">
            <div
              onClick={() => isDone && onStepClick?.(step)}
              className={`flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                isDone
                  ? "bg-primary text-primary-foreground cursor-pointer hover:brightness-110"
                  : isActive
                    ? "bg-primary/20 text-primary ring-2 ring-primary ring-offset-1"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {step}
            </div>
            {step < totalSteps && (
              <div className={`flex-1 h-0.5 rounded-full transition-colors ${isDone ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
