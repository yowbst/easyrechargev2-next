import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

interface FAQProps {
  title?: string;
  subtitle?: string;
  items: FAQItem[];
}

export function FAQ({ title, subtitle, items }: FAQProps) {
  if (!items.length) return null;

  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4 max-w-3xl">
        {title && (
          <h2 className="font-heading text-3xl font-bold text-center mb-3">
            {title}
          </h2>
        )}
        {subtitle && (
          <p className="text-center text-muted-foreground mb-10">
            {subtitle}
          </p>
        )}

        <Accordion className="space-y-3">
          {items.map((item) => (
            <AccordionItem
              key={item.id}
              value={item.id}
              className="border rounded-lg px-4 bg-background"
            >
              <AccordionTrigger className="font-medium text-left">
                {item.question}
              </AccordionTrigger>
              <AccordionContent>
                <div
                  className="text-muted-foreground prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: item.answer }}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
