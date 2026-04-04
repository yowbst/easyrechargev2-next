import { Card } from "@/components/ui/card";
import {
  Info, Shield, DollarSign, Users, MapPin, Clock, Award,
  Zap, CheckCircle, Star, Heart, Settings, Lightbulb, Target,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Info, Shield, DollarSign, Users, MapPin, Clock, Award,
  Zap, CheckCircle, Star, Heart, Settings, Lightbulb, Target,
};
import { cmsBgImage } from "@/lib/directusAssets";
import { t } from "@/lib/i18n/dictionaries";

interface FeatureItemConfig {
  id: string;
  icon: string;
}

interface FeaturesProps {
  title?: string;
  subtitle?: string;
  itemsConfig?: FeatureItemConfig[];
  tPrefix: string;
  image?: string;
  dictionary: Record<string, string>;
}

function getIconComponent(iconName?: string) {
  if (!iconName) return Info;
  return ICON_MAP[iconName] || Info;
}

export function Features({ title, subtitle, itemsConfig = [], tPrefix, image, dictionary }: FeaturesProps) {
  const hasImage = !!image;

  const defaultItemsConfig: FeatureItemConfig[] = [
    { id: "certifiedInstallers", icon: "Shield" },
    { id: "transparentPrices", icon: "DollarSign" },
    { id: "expertAdvice", icon: "Users" },
    { id: "nationalCoverage", icon: "MapPin" },
    { id: "fastInstallation", icon: "Clock" },
    { id: "qualityGuarantee", icon: "Award" },
  ];

  const displayItems = itemsConfig.length > 0 ? itemsConfig : defaultItemsConfig;

  return (
    <section
      className="relative py-24 overflow-hidden"
      style={hasImage ? { backgroundImage: `url(${cmsBgImage(image!)})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
    >
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {displayItems.map((item) => {
            const IconComponent = getIconComponent(item.icon);
            const itemTitle = t(dictionary, `${tPrefix}.features.items.${item.id}.title`);
            const itemDescription = t(dictionary, `${tPrefix}.features.items.${item.id}.description`);

            return (
              <Card
                key={item.id}
                className={`p-6 hover-elevate transition-all duration-300 ${hasImage ? "bg-white/10 backdrop-blur-md border-white/15" : ""}`}
                data-testid={`card-feature-${item.id}`}
              >
                <div className="mb-4">
                  <IconComponent className={`h-12 w-12 ${hasImage ? "text-white" : "text-primary"}`} />
                </div>
                <h3 className={`text-xl font-heading font-semibold mb-2 ${hasImage ? "text-white" : ""}`}>{itemTitle}</h3>
                <p className={hasImage ? "text-white/70" : "text-muted-foreground"}>{itemDescription}</p>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
