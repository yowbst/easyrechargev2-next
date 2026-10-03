import {
  Info, Shield, DollarSign, Users, MapPin, Clock, Award, Zap,
  CheckCircle, Star, Heart, Settings, Lightbulb, Target, ShieldCheck,
  Timer, Landmark,
} from "lucide-react";
import { Container, Eyebrow, SectionTitle } from "./Shell";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Info, Shield, DollarSign, Users, MapPin, Clock, Award, Zap,
  CheckCircle, Star, Heart, Settings, Lightbulb, Target, ShieldCheck,
  Timer, Landmark,
};

export interface ProofItem {
  id: string;
  icon?: string;
  title: string;
  body: string;
}

/**
 * The four reassurance cards. Content comes from the same Directus keys the
 * old Features block used (`…features.items.<id>.*`), so this is a change of
 * form, not of copy — nothing new to translate.
 */
export function ProofGrid({
  eyebrow,
  title,
  items,
}: {
  eyebrow?: string;
  title?: string;
  items: ProofItem[];
}) {
  if (items.length === 0) return null;
  return (
    <section data-reveal className="bg-b-paper py-14">
      <Container>
        {title && (
          <div className="mb-9 max-w-[40rem]">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            <SectionTitle>{title}</SectionTitle>
          </div>
        )}
        {/* auto-fit rather than a fixed column count: 6 cards fall as 3 + 3,
            4 or 5 leave the last row left-aligned instead of stretching a
            card to double width, and 7+ simply add a row. The count is
            CMS-driven, so the grid has to survive any of them. */}
        <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18.75rem),1fr))]">
          {items.map((item) => {
            const Icon = (item.icon && ICON_MAP[item.icon]) || Info;
            return (
              <div
                key={item.id}
                className="rounded-xl bg-b-sand p-8"
                data-testid={`card-proof-${item.id}`}
              >
                <div className="mb-6 flex size-11 items-center justify-center rounded-lg bg-b-paper">
                  <Icon className="size-5 text-b-link" />
                </div>
                <h3 className="mb-2.5 text-[17px] font-semibold leading-[1.3] md:text-xl">
                  {item.title}
                </h3>
                <p className="text-[15px] leading-[1.6] text-muted-foreground">
                  {item.body}
                </p>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
