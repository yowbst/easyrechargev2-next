import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { GoogleAdsTag } from "@/components/GoogleAdsTag";
import { OpenAIPixel } from "@/components/OpenAIPixel";
import { LazyCookieBanner as CookieBanner } from "@/components/LazyCookieBanner";
import { fetchLayout, fetchPageRegistry } from "@/lib/directus-queries";
import { extractLayoutDictionary } from "@/lib/i18n/dictionaries";
import { isValidLang, slugToDirectusLocale } from "@/lib/i18n/config";

interface LangLayoutProps {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}

export default async function LangLayout({ children, params }: LangLayoutProps) {
  const { lang } = await params;

  if (!isValidLang(lang)) {
    notFound();
  }

  const locale = slugToDirectusLocale(lang);

  const [layoutData, pageRegistry] = await Promise.all([
    fetchLayout(locale),
    fetchPageRegistry(),
  ]);

  const dictionary = layoutData
    ? extractLayoutDictionary(layoutData)
    : {};

  return (
    <>
      <Header
        lang={lang}
        layoutData={layoutData || {}}
        dictionary={dictionary}
        pageRegistry={pageRegistry}
      />
      <main className="flex-1">{children}</main>
      <Footer
        lang={lang}
        layoutData={layoutData || {}}
        dictionary={dictionary}
        pageRegistry={pageRegistry}
      />
      <CookieBanner
        title={dictionary["shared.cookie_banner.title"]}
        description={dictionary["shared.cookie_banner.description"]}
        acceptLabel={dictionary["shared.cookie_banner.accept"]}
        rejectLabel={dictionary["shared.cookie_banner.reject"]}
      />
      {/* Google Ads remarketing/conversion tag — configured via Directus
          site_settings.global_config.google_ads; renders nothing without a
          tag_id. Consent Mode v2, loaded at browser idle. */}
      <GoogleAdsTag tagId={layoutData?.global_config?.google_ads?.tag_id} />
      {/* ChatGPT Ads pixel — global_config.openai_ads.pixel_id; consent-gated,
          loaded at browser idle; console debug outside production. */}
      <OpenAIPixel
        pixelId={layoutData?.global_config?.openai_ads?.pixel_id}
        debug={process.env.VERCEL_ENV !== "production"}
      />
    </>
  );
}
