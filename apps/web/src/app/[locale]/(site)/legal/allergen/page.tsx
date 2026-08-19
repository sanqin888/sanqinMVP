// apps/web/src/app/[locale]/legal/allergen/page.tsx

import type { Metadata } from "next";
import { isLocale } from "@/lib/i18n/locales";
import type { Locale } from "@/lib/i18n/locales";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const { locale } = params;
  if (!isLocale(locale)) return {};
  const isZh = locale === "zh";

  return {
    title: isZh ? "三秦 · 过敏原与食材说明" : "San Qin · Allergen Information",
  };
}

export default function AllergenPage({
  params,
}: {
  params: { locale: Locale };
}) {
  const { locale } = params;
  if (!isLocale(locale)) notFound();
  const isZh = locale === "zh";

  return (
    <div className="space-y-6 text-sm text-slate-800">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">
          {isZh ? "过敏原与食材说明" : "Allergen & ingredient information"}
        </h1>
        <p className="text-xs text-slate-500">
          {isZh
            ? "以下信息为一般性说明，仅供参考。实际配方和供应情况可能会有所变化。如你有严重食物过敏或特殊饮食需求，请在下单前直接联系门店确认。"
            : "The information below is a general guide only. Recipes and suppliers may change over time. If you have serious food allergies or special dietary needs, please contact the store directly before ordering."}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "1. 常见过敏原" : "1. Common allergens"}
        </h2>
        <p>
          {isZh
            ? "我们部分菜品可能含有或接触到以下常见过敏原（包括但不限于）：小麦/麸质、花生、坚果类、芝麻、鸡蛋、乳制品、大豆，以及甲壳类/贝类等。"
            : "Some of our dishes may contain or come into contact with the following common allergens (including but not limited to): wheat/gluten, peanuts, tree nuts, sesame, eggs, dairy, soy, and shellfish."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "2. 交叉接触风险" : "2. Cross-contact risk"}
        </h2>
        <p>
          {isZh
            ? "尽管我们会在日常操作中注意清洁与分区，但由于厨房空间和设备共用的客观条件，无法完全排除交叉接触的可能性。因此，我们无法保证任何菜品“绝对不含”某种过敏原。"
            : "Although we take care with cleaning and separation, our kitchen shares equipment and preparation areas. We therefore cannot guarantee that any dish is completely free from specific allergens."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "3. 口味与忌口备注" : "3. Taste preferences & notes"}
        </h2>
        <p>
          {isZh
            ? "你可以在下单时通过“备注”栏说明个人口味（如少辣、不加香菜等）或简单的忌口需求。我们会在合理范围内尽量配合，但这并不意味着完全无过敏原风险。"
            : "You may use the notes section when ordering to indicate preferences (e.g., less spicy, no cilantro) or simple dietary restrictions. We will do our best to accommodate within reason, but this does not eliminate allergen risk."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "4. 严重过敏或特殊人群" : "4. Severe allergies & special groups"}
        </h2>
        <p>
          {isZh
            ? "如你或同餐者有严重食物过敏、免疫相关疾病，或对饮食有严格限制（例如孕期、某些慢性疾病等），请在食用前咨询专业医生的意见，并在下单前直接与门店沟通确认。"
            : "If you or anyone in your group has severe food allergies, immune conditions, or strict dietary requirements (including certain medical conditions or pregnancy), please consult a medical professional and contact the store directly before consuming our food."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "5. 免责声明" : "5. Disclaimer"}
        </h2>
        <p className="text-xs text-slate-500">
          {isZh
            ? "本页面内容仅作为一般提示，不构成医疗建议或营养建议。最终是否适合食用某种菜品，应由你本人在充分了解自身健康状况后自行判断。如有疑问，请优先咨询医生或营养师。"
            : "This page is for general information only and does not constitute medical or nutritional advice. You are responsible for deciding whether a dish is suitable for you based on your own health condition. When in doubt, please consult a doctor or dietitian."}
        </p>
      </section>
    </div>
  );
}
